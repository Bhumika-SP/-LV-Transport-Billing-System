import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import Stat from '../../components/ui/Stat';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatDate, formatINR, formatMonth } from '../../lib/format';
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '../../lib/forms';
import { useReversePayment } from './usePayments';
import { DocumentsButton } from '../documents/DocumentsPanel';

/** Payment history with filters and totals by method. `driverId` pins one driver. */
export default function PaymentsTable({ driverId }) {
  const { can } = useAuth();
  const [reversing, setReversing] = useState(null);
  const reverse = useReversePayment(() => setReversing(null));
  const { params, update } = useListParams();
  const drivers = useOptions('drivers', { includeInactive: true, enabled: !driverId });
  const query_ = { ...params, ...(driverId && { driverId }) };
  const filters = Object.fromEntries(
    ['driverId', 'month', 'method', 'fromDate', 'toDate']
      .filter((k) => query_[k])
      .map((k) => [k, query_[k]]),
  );

  const list = useQuery({
    queryKey: ['payments', 'list', query_],
    queryFn: () => get('/payments', query_),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['payments', 'summary', filters],
    queryFn: () => get('/payments/summary', filters),
    placeholderData: keepPreviousData,
  });
  const byMethod = Object.fromEntries(
    (summary.data?.byMethod ?? []).map((m) => [m.method, m.amount]),
  );

  const columns = [
    { key: 'paymentDate', header: 'Date', render: (p) => formatDate(p.paymentDate) },
    ...(driverId
      ? []
      : [{ key: 'driver', important: true, header: 'Driver', render: (p) => p.driver.fullName }]),
    {
      key: 'settlement',
      header: 'Settlement',
      render: (p) => (
        <Link className="text-brand-700 hover:underline" to={`/settlements/${p.settlement.id}`}>
          {formatMonth(p.settlement.settlementMonth)}
        </Link>
      ),
    },
    { key: 'paymentMethod', header: 'Method', render: (p) => paymentMethodLabel(p.paymentMethod) },
    { key: 'referenceNumber', header: 'Reference' },
    {
      key: 'amount',
      important: true,
      header: 'Amount',
      align: 'right',
      render: (p) => (
        <span className={p.status === 'REVERSED' ? 'text-slate-400 line-through' : 'font-medium'}>
          {formatINR(p.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      important: true,
      header: 'Status',
      render: (p) => <StatusBadge status={p.status === 'REVERSED' ? 'CANCELLED' : 'ACTIVE'} />,
    },
    {
      key: 'notes',
      header: 'Notes',
      className: 'whitespace-normal max-w-xs',
      render: (p) => (p.status === 'REVERSED' ? `Reversed: ${p.reversalReason}` : p.notes),
    },
    { key: 'createdBy', header: 'Recorded by', render: (p) => p.createdBy?.name ?? '—' },
  ];
  columns.push({
    key: 'documents',
    header: <span className="sr-only">Documents</span>,
    align: 'right',
    render: (r) => (
      <DocumentsButton
        entityType="DRIVER_PAYMENT"
        entityId={r.id}
        title={`Payment proof · ${r.driver?.fullName ?? ''}`}
        canManage={can(PERMISSIONS.PAYMENT_RECORD)}
      />
    ),
  });
  if (can(PERMISSIONS.PAYMENT_REVERSE)) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (p) =>
        p.status === 'VALID' && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setReversing(p)}>
            Reverse
          </Button>
        ),
    });
  }

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Total paid"
          value={formatINR(summary.data?.total)}
          hint={`${summary.data?.count ?? 0} valid payments`}
          tone="positive"
        />
        {PAYMENT_METHOD_OPTIONS.map((m) => (
          <Stat
            key={m.value}
            label={m.label}
            value={formatINR(byMethod[m.value] ?? '0')}
            tone="muted"
          />
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          {!driverId && (
            <FilterSelect
              label="Driver"
              value={params.driverId}
              onChange={(v) => update({ driverId: v })}
              options={(drivers.data ?? []).map(toSelect.drivers)}
            />
          )}
          <input
            type="month"
            aria-label="Settlement month"
            className={`${inputClass} w-full sm:w-44`}
            value={params.month ?? ''}
            onChange={(e) => update({ month: e.target.value || undefined })}
          />
          <FilterSelect
            label="Method"
            value={params.method}
            onChange={(v) => update({ method: v })}
            options={PAYMENT_METHOD_OPTIONS}
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(v) => update({ status: v })}
            options={[
              { value: 'VALID', label: 'Valid' },
              { value: 'REVERSED', label: 'Reversed' },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          empty={
            <EmptyState
              title="No payments"
              description="Payments are recorded from a finalized settlement."
            />
          }
        />
        <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <ConfirmDialog
        open={Boolean(reversing)}
        onClose={() => setReversing(null)}
        title="Reverse payment"
        message={`Reverse the ${formatINR(reversing?.amount)} ${paymentMethodLabel(reversing?.paymentMethod)} payment to ${reversing?.driver.fullName}? The record is kept and the outstanding amount is restored.`}
        confirmLabel="Reverse"
        requireReason
        loading={reverse.isPending}
        onConfirm={(reason) => reverse.mutate({ id: reversing.id, reason })}
      />
    </>
  );
}
