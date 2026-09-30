import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { useListParams } from '../../hooks/useListParams';
import { get } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import AuditDetailModal from './AuditDetailModal';
import { AUDIT_PRESETS, actionTone } from './audit-labels';

/** Read-only audit trail with filters, investigation presets and a diff viewer (spec §55–57). */
export default function AuditLogsPage() {
  const { params, update } = useListParams();
  const [open, setOpen] = useState(null);
  const meta = useQuery({ queryKey: ['audit', 'meta'], queryFn: () => get('/audit/meta') });
  const list = useQuery({
    queryKey: ['audit', 'list', params],
    queryFn: () => get('/audit', params),
    placeholderData: keepPreviousData,
  });
  const preset = AUDIT_PRESETS.find((p) => p.action === (params.action ?? '')) ?? null;

  const columns = [
    { key: 'createdAt', header: 'When', render: (l) => formatDateTime(l.createdAt) },
    { key: 'user', header: 'User', render: (l) => l.user?.name ?? 'System' },
    {
      key: 'action',
      header: 'Action',
      render: (l) => <Badge tone={actionTone(l.action)}>{l.action}</Badge>,
    },
    {
      key: 'entity',
      header: 'Record',
      render: (l) => (
        <button
          type="button"
          className="text-brand-700 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            update({
              entityType: l.entityType,
              entityId: l.entityId ?? undefined,
              action: undefined,
            });
          }}
          title="Show this record's full history"
        >
          {l.entityType}
          {l.entityId ? ` #${l.entityId}` : ''}
        </button>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      className: 'whitespace-normal max-w-sm',
      render: (l) => l.reason ?? '',
    },
    { key: 'ip', header: 'IP' },
  ];

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Every login, change, approval, payment, import and export. The trail is append-only and cannot be edited."
      />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {AUDIT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => update({ action: p.action || undefined })}
            aria-pressed={preset === p}
            className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${
              preset === p
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Reason, IP or request ID"
          />
          <FilterSelect
            label="User"
            value={params.userId}
            onChange={(userId) => update({ userId })}
            options={(meta.data?.users ?? []).map((u) => ({ value: String(u.id), label: u.name }))}
          />
          <FilterSelect
            label="Action"
            value={preset ? undefined : params.action}
            onChange={(action) => update({ action })}
            options={(meta.data?.actions ?? []).map((a) => ({ value: a, label: a }))}
          />
          <FilterSelect
            label="Record type"
            value={params.entityType}
            onChange={(entityType) => update({ entityType, entityId: undefined })}
            options={(meta.data?.entityTypes ?? []).map((t) => ({ value: t, label: t }))}
          />
          {params.entityType && (
            <input
              aria-label="Record ID"
              placeholder="Record ID"
              className={`${inputClass} w-full sm:w-28`}
              value={params.entityId ?? ''}
              onChange={(e) => update({ entityId: e.target.value || undefined })}
            />
          )}
          <input
            type="date"
            aria-label="From date"
            className={`${inputClass} w-full sm:w-40`}
            value={params.fromDate ?? ''}
            onChange={(e) => update({ fromDate: e.target.value || undefined })}
          />
          <input
            type="date"
            aria-label="To date"
            className={`${inputClass} w-full sm:w-40`}
            value={params.toDate ?? ''}
            onChange={(e) => update({ toDate: e.target.value || undefined })}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          onRowClick={setOpen}
          empty={<EmptyState title="No audit records match these filters" />}
        />
        <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <AuditDetailModal log={open} onClose={() => setOpen(null)} />
    </>
  );
}
