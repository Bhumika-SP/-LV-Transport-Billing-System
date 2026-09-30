import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
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
import { del, get, post } from '../../lib/api';
import { formatDate, formatINR, formatMonth } from '../../lib/format';
import { paymentMethodLabel } from '../../lib/forms';
import {
  CorrectModal,
  CreateSettlementModal,
  EditPendingModal,
  ReceiveModal,
} from './SettlementModals';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'RECEIVED', label: 'Received' },
];

/** Expected vs actually received, kept clearly apart (spec §35). */
function Summary({ filters }) {
  const { data } = useQuery({
    queryKey: ['company-settlements', 'summary', filters],
    queryFn: () => get('/company-settlements/summary', filters),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Stat
        label="Expected (all settlements)"
        value={formatINR(data?.expectedTotal)}
        hint={data && `${data.count} settlement${data.count === 1 ? '' : 's'}`}
        tone="muted"
      />
      <Stat
        label="Actually received"
        value={formatINR(data?.receivedTotal)}
        hint={data && `${data.receivedCount} RECEIVED · counts toward LV profit`}
        tone="positive"
      />
      <Stat
        label="Pending (not yet received)"
        value={formatINR(data?.pendingTotal)}
        hint={data && `${data.pendingCount} PENDING · not counted as received`}
        tone="warning"
      />
    </div>
  );
}

/**
 * Company settlement list with filters, totals and lifecycle actions.
 * With `companyId`, the list is fixed to one company (company detail tab).
 */
export default function CompanySettlementTable({ companyId }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(PERMISSIONS.COMPANY_SETTLEMENT_MANAGE);
  const canCorrect = can(PERMISSIONS.COMPANY_SETTLEMENT_CORRECT);
  const { params, update, toggleSort } = useListParams({
    sortBy: 'settlementMonth',
    sortDir: 'desc',
  });
  const companies = useOptions('companies', { includeInactive: true, enabled: !companyId });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [reverting, setReverting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query_ = { ...params, ...(companyId && { companyId }) };
  const filters = { companyId: query_.companyId, month: query_.month, status: query_.status };
  const query = useQuery({
    queryKey: ['company-settlements', 'list', query_],
    queryFn: () => get('/company-settlements', query_),
    placeholderData: keepPreviousData,
  });

  const done = (message, close) => () => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ['company-settlements'] });
    close(null);
  };
  const revert = useMutation({
    mutationFn: ({ id, reason }) => post(`/company-settlements/${id}/revert`, { reason }),
    onSuccess: done('Reverted to PENDING', setReverting),
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }) => del(`/company-settlements/${id}`, { reason }),
    onSuccess: done('Pending settlement deleted', setDeleting),
    onError: (err) => toast.error(err.message),
  });

  const columns = [
    {
      key: 'settlementMonth',
      header: 'Month',
      sortable: true,
      className: 'font-medium text-slate-900',
      render: (s) => formatMonth(s.settlementMonth),
    },
    ...(companyId
      ? []
      : [
          {
            key: 'company',
            header: 'Company',
            render: (s) => (
              <Link to={`/companies/${s.company.id}`} className="text-brand-700 hover:underline">
                {s.company.name}
              </Link>
            ),
          },
        ]),
    {
      key: 'expectedAmount',
      header: 'Expected',
      align: 'right',
      sortable: true,
      render: (s) => formatINR(s.expectedAmount),
    },
    {
      key: 'receivedAmount',
      header: 'Received',
      align: 'right',
      sortable: true,
      render: (s) =>
        s.receivedAmount ? <span className="font-medium">{formatINR(s.receivedAmount)}</span> : '—',
    },
    {
      key: 'variance',
      header: 'Difference',
      align: 'right',
      render: (s) =>
        s.variance === null ? (
          '—'
        ) : (
          <span
            className={
              s.variance.startsWith('-')
                ? 'text-red-700'
                : s.variance === '0.00'
                  ? 'text-slate-500'
                  : 'text-emerald-700'
            }
          >
            {formatINR(s.variance)}
          </span>
        ),
    },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'receivedDate',
      header: 'Received on',
      sortable: true,
      render: (s) => formatDate(s.receivedDate),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (s) => (s.paymentMethod ? paymentMethodLabel(s.paymentMethod) : '—'),
    },
    { key: 'referenceNumber', header: 'Reference' },
  ];

  if (canManage || canCorrect) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (s) => (
        <div className="flex justify-end gap-1">
          {s.status === 'PENDING' && canManage && (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={CheckCircle2}
                onClick={() => setReceiving(s)}
              >
                Mark received
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Pencil}
                onClick={() => setEditing(s)}
                aria-label="Edit"
              />
            </>
          )}
          {s.status === 'PENDING' && canCorrect && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => setDeleting(s)}
              aria-label="Delete"
            />
          )}
          {s.status === 'RECEIVED' && canCorrect && (
            <>
              <Button size="sm" variant="ghost" icon={Wrench} onClick={() => setCorrecting(s)}>
                Correct
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={RotateCcw}
                onClick={() => setReverting(s)}
                aria-label="Revert to pending"
              />
            </>
          )}
        </div>
      ),
    });
  }

  const label = (s) => s && `${s.company.name}, ${formatMonth(s.settlementMonth)}`;

  return (
    <>
      <Summary filters={filters} />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          {!companyId && (
            <FilterSelect
              label="Company"
              value={params.companyId}
              onChange={(v) => update({ companyId: v })}
              options={(companies.data ?? []).map(toSelect.companies)}
            />
          )}
          <input
            type="month"
            aria-label="Month"
            className={`${inputClass} w-full sm:w-44`}
            value={params.month ?? ''}
            onChange={(e) => update({ month: e.target.value || undefined })}
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(v) => update({ status: v })}
            options={STATUS_OPTIONS}
          />
          {canManage && (
            <Button className="sm:ml-auto" icon={Plus} onClick={() => setCreating(true)}>
              New settlement
            </Button>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          sort={params}
          onSort={toggleSort}
          empty={
            <EmptyState
              title="No company settlements"
              description="Record the expected monthly amount to start."
            />
          }
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>

      <CreateSettlementModal
        open={creating}
        onClose={() => setCreating(false)}
        companyId={companyId}
      />
      <EditPendingModal settlement={editing} onClose={() => setEditing(null)} />
      <ReceiveModal settlement={receiving} onClose={() => setReceiving(null)} />
      <CorrectModal settlement={correcting} onClose={() => setCorrecting(null)} />
      <ConfirmDialog
        open={Boolean(reverting)}
        onClose={() => setReverting(null)}
        title="Revert to pending"
        message={`${label(reverting)} will return to PENDING and its receipt details will be cleared. It will no longer count as received. The previous values are kept in the audit log.`}
        confirmLabel="Revert"
        requireReason
        loading={revert.isPending}
        onConfirm={(reason) => revert.mutate({ id: reverting.id, reason })}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete pending settlement"
        message={`Delete the pending settlement for ${label(deleting)}? Only pending settlements can be deleted.`}
        confirmLabel="Delete"
        requireReason
        loading={remove.isPending}
        onConfirm={(reason) => remove.mutate({ id: deleting.id, reason })}
      />
    </>
  );
}
