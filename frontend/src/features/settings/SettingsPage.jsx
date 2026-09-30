import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { get, patch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none disabled:opacity-50 ${
        checked ? 'bg-brand-700' : 'bg-slate-300'
      }`}
    >
      <span
        className={`mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/** Admin-only configurable business rules. Every change is audited. */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => get('/settings'),
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }) => patch(`/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success('Setting saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const groups = [...new Set(data.map((s) => s.group))];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configurable business rules. Changes are recorded in the audit log."
      />
      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group} title={group}>
            <ul className="divide-y divide-slate-100">
              {data
                .filter((s) => s.group === group)
                .map((s) => (
                  <li key={s.key} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm text-slate-800">{s.description}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Default: {String(s.defaultValue)}
                        {s.updatedAt && ` · Changed ${formatDateTime(s.updatedAt)}`}
                      </p>
                    </div>
                    {s.type === 'string' && s.options && (
                      <select
                        aria-label={s.description}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={s.value}
                        disabled={mutation.isPending}
                        onChange={(e) => mutation.mutate({ key: s.key, value: e.target.value })}
                      >
                        {s.options.map((o) => (
                          <option key={o} value={o}>
                            {o.replace(/_/g, ' ').toLowerCase()}
                          </option>
                        ))}
                      </select>
                    )}
                    {s.type === 'string' && !s.options && (
                      <input
                        aria-label={s.description}
                        defaultValue={s.value}
                        maxLength={20}
                        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        onBlur={(e) =>
                          e.target.value !== s.value &&
                          mutation.mutate({ key: s.key, value: e.target.value.trim() })
                        }
                      />
                    )}
                    {s.type === 'boolean' && (
                      <Toggle
                        label={s.description}
                        checked={s.value}
                        disabled={mutation.isPending}
                        onChange={(value) => mutation.mutate({ key: s.key, value })}
                      />
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
