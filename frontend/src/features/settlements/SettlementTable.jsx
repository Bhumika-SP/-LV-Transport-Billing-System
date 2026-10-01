import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../../auth/auth-context';
import EntityFormModal from '../../components/EntityFormModal';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get, post } from '../../lib/api';
import { currentMonth, formatINR, formatMonth } from '../../lib/format';
import { v } from '../../lib/forms';

const SETTLEMENT_STATUSES = ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED'];
const label = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');

function NewSettlementModal({ open, onClose, driverId }) {
  const navigate = useNavigate();
  const drivers = useOptions('drivers', { enabled: open && !driverId });
  const initialValues = useMemo(
    () => ({ driverId: driverId ? String(driverId) : '', settlementMonth: currentMonth() }),
    [driverId],
  );
  return (
    <EntityFormModal
      open={open && (Boolean(driverId) || !drivers.isLoading)}
      onClose={onClose}
      size="sm"
      title="New monthly settlement"
      fields={[
        ...(driverId
          ? []
          : [
              {
                name: 'driverId',
                label: 'Driver',
                type: 'select',
                required: true,
                placeholder: 'Select driver',
                options: (drivers.data ?? []).map(toSelect.drivers),
              },
            ]),
        { name: 'settlementMonth', label: 'Settlement month', type: 'month', required: true },
      ]}
      schema={z.object({ driverId: v.required('Driver'), settlementMonth: v.required('Month') })}
      initialValues={initialValues}
      onSubmit={(values) => post('/settlements', values)}
      submitLabel="Create & calculate"
      successMessage="Settlement calculated"
      invalidateKeys={[['settlements']]}
      onSuccess={(s) => navigate(`/settlements/${s.id}`)}
    />
  );
}

/** Settlement list. `driverId` pins it to one driver (driver page tab). */
export default function SettlementTable({ driverId }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canPrepare = can(PERMISSIONS.SETTLEMENT_PREPARE);
  const [creating, setCreating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const { params, update, toggleSort } = useListParams({
    sortBy: 'settlementMonth',
    sortDir: 'desc',
  });
  const drivers = useOptions('drivers', { includeInactive: true, enabled: !driverId });
  const query_ = { ...params, ...(driverId && { driverId }) };

  const list = useQuery({
    queryKey: ['settlements', 'list', query_],
    queryFn: () => get('/settlements', query_),
    placeholderData: keepPreviousData,
  });

  const prepare = useMutation({
    mutationFn: () =>
      post('/settlements/prepare', { settlementMonth: params.month || currentMonth() }),
    onSuccess: (r) => {
      toast.success(
        `Created ${r.created}, recalculated ${r.recalculated}, left unchanged ${r.skipped}`,
      );
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      setPreparing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const columns = [
    {
      key: 'settlementMonth',
      header: 'Month',
      sortable: true,
      render: (s) => formatMonth(s.settlementMonth),
    },
    ...(driverId
      ? []
      : [
          {
            key: 'driver',
            important: true,
            header: 'Driver',
            render: (s) => (
              <Link
                className="font-medium text-brand-700 hover:underline"
                to={`/drivers/${s.driver.id}?tab=settlements`}
                onClick={(e) => e.stopPropagation()}
              >
                {s.driver.fullName}
              </Link>
            ),
          },
        ]),
    {
      key: 'grossEarnings',
      header: 'Gross earnings',
      align: 'right',
      render: (s) => formatINR(s.grossEarnings),
    },
    {
      key: 'totalDeductions',
      header: 'Deductions',
      align: 'right',
      render: (s) => `−${formatINR(s.totalDeductions)}`,
    },
    {
      key: 'finalAmount',
      important: true,
      header: 'Final settlement',
      align: 'right',
      sortable: true,
      render: (s) => <span className="font-semibold">{formatINR(s.finalAmount)}</span>,
    },
    {
      key: 'status',
      important: true,
      header: 'Status',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (s) => (s.paymentStatus ? <StatusBadge status={s.paymentStatus} /> : '—'),
    },
    { key: 'version', header: 'Ver.', align: 'right' },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Toolbar>
        <input
          type="month"
          aria-label="Settlement month"
          className={`${inputClass} w-full sm:w-44`}
          value={params.month ?? ''}
          onChange={(e) => update({ month: e.target.value || undefined })}
        />
        {!driverId && (
          <FilterSelect
            label="Driver"
            value={params.driverId}
            onChange={(val) => update({ driverId: val })}
            options={(drivers.data ?? []).map(toSelect.drivers)}
          />
        )}
        <FilterSelect
          label="Status"
          value={params.status}
          onChange={(val) => update({ status: val })}
          options={SETTLEMENT_STATUSES.map((s) => ({ value: s, label: label(s) }))}
        />
        <FilterSelect
          label="Payment"
          value={params.paymentStatus}
          onChange={(val) => update({ paymentStatus: val })}
          options={['UNPAID', 'PARTIALLY_PAID', 'PAID'].map((s) => ({ value: s, label: label(s) }))}
        />
        {canPrepare && (
          <div className="flex gap-2 sm:ml-auto">
            {!driverId && (
              <Button variant="secondary" icon={Calculator} onClick={() => setPreparing(true)}>
                Prepare month
              </Button>
            )}
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New settlement
            </Button>
          </div>
        )}
      </Toolbar>
      <DataTable
        columns={columns}
        rows={list.data?.items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        sort={params}
        onSort={toggleSort}
        onRowClick={(s) => navigate(`/settlements/${s.id}`)}
        empty={
          <EmptyState
            title="No settlements"
            description="Use “Prepare month” to create drafts for every driver with activity."
          />
        }
      />
      <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      <NewSettlementModal open={creating} onClose={() => setCreating(false)} driverId={driverId} />
      <ConfirmDialog
        open={preparing}
        onClose={() => setPreparing(false)}
        title={`Prepare settlements for ${formatMonth(params.month || currentMonth())}`}
        message="Creates a calculated draft for every driver with trips, earnings, expenses or recoveries in the month, and recalculates existing drafts. Settlements under review, approved or finalized are not touched."
        confirmLabel="Prepare"
        variant="primary"
        loading={prepare.isPending}
        onConfirm={() => prepare.mutate()}
      />
    </div>
  );
}
