import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useNotificationActions, useUnreadCount } from './useNotifications';

/** Header bell: unread badge, latest notifications, mark read. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = useUnreadCount();
  const latest = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: () => get('/notifications', { pageSize: 8 }),
    enabled: open,
  });
  const { markRead, markAllRead } = useNotificationActions();
  const count = unread.data?.count ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = (n) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        title="Notifications"
        className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-menu absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {count > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {latest.isLoading && <li className="px-3 py-4 text-sm text-slate-500">Loading…</li>}
            {latest.data?.items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-500">You're all caught up</li>
            )}
            {latest.data?.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={`block w-full px-3 py-2.5 text-left hover:bg-slate-50 ${n.readAt ? '' : 'bg-brand-50/60'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {!n.readAt && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-brand-600"
                        aria-label="Unread"
                      />
                    )}
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">
                    {n.message}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    {formatDateTime(n.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-brand-700 hover:bg-slate-50"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
