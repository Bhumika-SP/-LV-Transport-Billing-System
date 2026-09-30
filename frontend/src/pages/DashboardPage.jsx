import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { fetchHealth } from '../lib/api';

function StatusRow({ label, state, detail }) {
  const icon =
    state === 'loading' ? (
      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
    ) : state === 'up' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        {icon}
        {label}
      </div>
      <div className="text-sm text-slate-500">{detail}</div>
    </div>
  );
}

/**
 * Phase 1 dashboard: shows system connectivity only.
 * Role-aware financial dashboards (spec §44) are built in Phase 12.
 */
export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });

  const apiState = isLoading ? 'loading' : isError || !data ? 'down' : 'up';
  const dbState = isLoading ? 'loading' : data?.data?.database?.status === 'up' ? 'up' : 'down';

  return (
    <>
      <PageHeader title="Dashboard" description="System status" />
      <section className="max-w-xl rounded-lg border border-slate-200 bg-white px-5">
        <div className="divide-y divide-slate-100">
          <StatusRow
            label="API server"
            state={apiState}
            detail={apiState === 'up' ? 'Reachable' : apiState === 'down' ? 'Unreachable' : ''}
          />
          <StatusRow
            label="Database"
            state={dbState}
            detail={
              dbState === 'up'
                ? `Connected (${data.data.database.latencyMs} ms)`
                : dbState === 'down'
                  ? 'Not connected'
                  : ''
            }
          />
        </div>
      </section>
    </>
  );
}
