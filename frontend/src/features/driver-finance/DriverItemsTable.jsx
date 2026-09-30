import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get, post } from '../../lib/api';
import { formatDate, formatINR, formatMonth } from '../../lib/format';
import DriverItemFormModal from './DriverItemFormModal';

/**
 * List of driver line items for one resource (earnings, adjustments, driver-expenses…)
 * with filters, add and void. `fixed` pins filters (e.g. { driverId } on a driver page,
 * { type: 'OTHER_DEDUCTION' } for a deductions view).
 */
export default function DriverItemsTable({
  config,
  fixed = {},
  extraColumns = [],
  extraFilters = null,
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can(config.managePermission);
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const { params, update, toggleSort } = useListParams({ sortBy: 'date', sortDir: 'desc' });
  const drivers = useOptions('drivers', { includeInactive: true, enabled: !fixed.driverId });
  const query_ = { ...params, ...fixed };

  const list = useQuery({
    queryKey: [config.resource, 'list', query_],
    queryFn: () => get(`/${config.resource}`, query_),
    placeholderData: keepPreviousData,
  });

  const voidItem = useMutation({
    mutationFn: ({ id, reason }) => post(`/${config.resource}/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Voided');
      queryClient.invalidateQueries({ queryKey: [config.resource] });
      queryClient.invalidateQueries({ queryKey: ['earnings-gross'] });
      setVoiding(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const typeLabel = (t) => config.types.find((x) => x.value === t)?.label ?? t;
  const columns = [
    { key: 'date', header: 'Date', sortable: true, render: (i) => formatDate(i[config.dateField]) },
    ...(fixed.driverId
      ? []
      : [
          {
            key: 'driver',
            header: 'Driver',
            render: (i) => (
              <Link className="text-brand-700 hover:underline" to={`/drivers/${i.driver.id}`}>
                {i.driver.fullName}
              </Link>
            ),
          },
        ]),
    ...(config.types.length > 1 && !fixed.type
      ? [
          {
            key: 'type',
            header: 'Type',
            render: (i) => <Badge tone={config.typeTone?.(i) ?? 'gray'}>{typeLabel(i.type)}</Badge>,
          },
        ]
      : []),
    ...extraColumns,
    {
      key: 'settlementMonth',
      header: 'Settlement month',
      render: (i) => formatMonth(i.settlementMonth),
    },
    {
      key: 'text',
      header: config.textLabel,
      className: 'whitespace-normal max-w-sm',
      render: (i) =>
        i.status === 'VOID'
          ? `${i[config.textField]} — voided: ${i.voidReason}`
          : i[config.textField],
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      render: (i) => (
        <span className={i.status === 'VOID' ? 'text-slate-400 line-through' : 'font-medium'}>
          {config.sign?.(i) === '-' ? '−' : ''}
          {formatINR(i.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <StatusBadge status={i.status === 'VOID' ? 'CANCELLED' : 'ACTIVE'} />,
    },
    { key: 'createdBy', header: 'Recorded by', render: (i) => i.createdBy?.name ?? '—' },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (i) =>
        i.status === 'ACTIVE' && (
          <Button size="sm" variant="ghost" icon={Ban} onClick={() => setVoiding(i)}>
            Void
          </Button>
        ),
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Toolbar>
        {!fixed.driverId && (
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
        {config.types.length > 1 && !fixed.type && (
          <FilterSelect
            label="Type"
            value={params.type}
            onChange={(v) => update({ type: v })}
            options={config.types}
          />
        )}
        {extraFilters?.(params, update)}
        <FilterSelect
          label="Status"
          value={params.status}
          onChange={(v) => update({ status: v })}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'VOID', label: 'Void' },
          ]}
        />
        {canManage && (
          <Button className="sm:ml-auto" icon={Plus} onClick={() => setAdding(true)}>
            {config.addLabel}
          </Button>
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
        empty={<EmptyState title={config.emptyTitle ?? 'Nothing recorded'} />}
      />
      <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />

      <DriverItemFormModal
        open={adding}
        onClose={() => setAdding(false)}
        config={config}
        driverId={fixed.driverId}
        defaultType={fixed.type}
      />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title="Void entry"
        message={`Void ${formatINR(voiding?.amount)} (${voiding && typeLabel(voiding.type)}) for ${voiding?.driver.fullName}? It stays in history but no longer counts in the settlement.`}
        confirmLabel="Void"
        requireReason
        loading={voidItem.isPending}
        onConfirm={(reason) => voidItem.mutate({ id: voiding.id, reason })}
      />
    </div>
  );
}
