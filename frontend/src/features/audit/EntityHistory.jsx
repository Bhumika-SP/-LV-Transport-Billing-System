import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { get } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import AuditDetailModal from './AuditDetailModal';
import { actionTone } from './audit-labels';

/** Timeline of every audited change to one record (Auditor / Admin). */
export default function EntityHistory({ entityType, entityId }) {
  const [open, setOpen] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', 'history', entityType, entityId],
    queryFn: () => get(`/audit/history/${entityType}/${entityId}`),
  });
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data.length) return <EmptyState title="No recorded changes" />;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <ol className="divide-y divide-slate-100">
        {data.map((log) => (
          <li key={log.id}>
            <button
              type="button"
              onClick={() => setOpen(log)}
              className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
            >
              <Badge tone={actionTone(log.action)}>{log.action}</Badge>
              <span className="text-slate-700">{log.user?.name ?? 'System'}</span>
              {log.reason && (
                <span className="min-w-0 flex-1 truncate text-slate-500">“{log.reason}”</span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {formatDateTime(log.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <AuditDetailModal log={open} onClose={() => setOpen(null)} />
    </div>
  );
}
