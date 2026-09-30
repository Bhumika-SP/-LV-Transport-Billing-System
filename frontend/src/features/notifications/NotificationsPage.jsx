import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { useListParams } from '../../hooks/useListParams';
import { get } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useNotificationActions } from './useNotifications';

/** Notification center: the signed-in user's own notifications. */
export default function NotificationsPage() {
  const { params, update } = useListParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', 'list', params],
    queryFn: () => get('/notifications', params),
    placeholderData: keepPreviousData,
  });
  const { markRead, markAllRead } = useNotificationActions();

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Workflow events, imports, payment reversals and expiry reminders for your role"
        actions={
          <Button
            variant="secondary"
            icon={CheckCheck}
            onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
          >
            Mark all read
          </Button>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <FilterSelect
            label="Show"
            value={params.unreadOnly}
            onChange={(unreadOnly) => update({ unreadOnly })}
            options={[{ value: 'true', label: 'Unread only' }]}
          />
        </Toolbar>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : data.items.length === 0 ? (
          <EmptyState title="No notifications" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((n) => (
              <li
                key={n.id}
                className={`flex flex-wrap items-start gap-3 px-4 py-3 ${n.readAt ? '' : 'bg-brand-50/50'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {!n.readAt && (
                      <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />
                    )}
                    {n.title}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {n.link && (
                    <Link
                      to={n.link}
                      onClick={() => !n.readAt && markRead.mutate(n.id)}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Open
                    </Link>
                  )}
                  {!n.readAt && (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={data?.meta} onPageChange={(page) => update({ page })} />
      </div>
    </>
  );
}
