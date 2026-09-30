import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { get, post } from '../../lib/api';
import { formatDate, formatINR } from '../../lib/format';

/** Full, append-only rate history for a vehicle type (active and cancelled). */
export default function RateHistoryTable({ vehicleTypeId, currentRateId }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rates', vehicleTypeId],
    queryFn: () => get('/rates', { vehicleTypeId }),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }) => post(`/rates/${id}/cancel`, { reason }),
    onSuccess: ({ tripsUsingRate }) => {
      toast.success('Rate cancelled');
      if (tripsUsingRate > 0) {
        toast.warning(
          `${tripsUsingRate} trip(s) were priced with this rate and keep it until an admin recalculates them.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['rates'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
      setCancelling(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const columns = [
    {
      key: 'ratePerKm',
      header: 'Rate / km',
      align: 'right',
      render: (r) => (
        <span className={r.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'font-medium'}>
          {formatINR(r.ratePerKm)}
        </span>
      ),
    },
    { key: 'effectiveFrom', header: 'Effective from', render: (r) => formatDate(r.effectiveFrom) },
    {
      key: 'effectiveTo',
      header: 'Effective to',
      render: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : 'Open-ended'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.id === currentRateId ? (
          <StatusBadge status="CURRENT" />
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
    {
      key: 'notes',
      header: 'Notes',
      className: 'whitespace-normal',
      render: (r) => (r.status === 'CANCELLED' ? `Cancelled: ${r.cancelReason}` : r.notes),
    },
    { key: 'createdBy', header: 'Added by', render: (r) => r.createdBy?.name ?? '—' },
  ];

  if (can(PERMISSIONS.RATE_MANAGE)) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (r) =>
        r.status === 'ACTIVE' && (
          <Button variant="ghost" size="sm" icon={Ban} onClick={() => setCancelling(r)}>
            Cancel
          </Button>
        ),
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={
          <EmptyState
            title="No rates yet"
            description="Trips cannot be priced until a rate exists."
          />
        }
      />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel rate"
        message={`Cancel ${formatINR(cancelling?.ratePerKm)}/km from ${formatDate(cancelling?.effectiveFrom)}? The record is kept for history but will no longer apply to new trips.`}
        confirmLabel="Cancel rate"
        requireReason
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate({ id: cancelling.id, reason })}
      />
    </>
  );
}
