import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { inputClass } from '../../components/ui/Field';
import { EmptyState, LoadingState } from '../../components/ui/States';
import Tabs from '../../components/ui/Tabs';
import { get } from '../../lib/api';
import ReportView from './ReportView';

function useAvailableReports() {
  return useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => get('/reports'),
    staleTime: 5 * 60_000,
  });
}

/**
 * A page made of one or more reports (tabs). Reports the user may not run are hidden;
 * the API enforces the same permission for viewing and exporting.
 */
export default function ReportsPage({ title, description, reportKeys }) {
  const { data, isLoading } = useAvailableReports();
  if (isLoading) return <LoadingState />;
  const available = reportKeys.map((k) => data.find((r) => r.key === k)).filter(Boolean);

  return (
    <>
      <PageHeader title={title} description={description} />
      {available.length === 0 ? (
        <EmptyState title="No reports available for your role" />
      ) : available.length === 1 ? (
        <ReportView reportKey={available[0].key} filters={available[0].filters} />
      ) : (
        <Tabs
          tabs={available.map((r) => ({
            key: r.key,
            label: r.title,
            content: <ReportView key={r.key} reportKey={r.key} filters={r.filters} />,
          }))}
        />
      )}
    </>
  );
}

/** Exports: pick any report the role may run, filter, and download CSV / Excel / PDF. */
export function ExportsPage() {
  const { data, isLoading } = useAvailableReports();
  const [key, setKey] = useState('');
  if (isLoading) return <LoadingState />;
  const selected = data.find((r) => r.key === key) ?? data[0];
  return (
    <>
      <PageHeader
        title="Exports"
        description="Download any report you have access to as CSV, Excel or PDF. Exports use live data and are recorded in the audit log."
      />
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Report
          <select
            className={`${inputClass} w-72`}
            value={selected?.key ?? ''}
            onChange={(e) => setKey(e.target.value)}
          >
            {data.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected && (
        <ReportView key={selected.key} reportKey={selected.key} filters={selected.filters} />
      )}
    </>
  );
}
