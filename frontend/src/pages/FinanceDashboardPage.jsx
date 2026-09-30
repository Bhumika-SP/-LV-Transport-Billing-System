import PageHeader from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/ui/States';
import { useDashboard } from '../hooks/useDashboard';
import { FinanceSections } from './DashboardPage';

/** Finance-only view of the dashboard (Admin/Manager, Auditor/Finance). */
export default function FinanceDashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <>
      <PageHeader
        title="Finance Dashboard"
        description="Company receipts, driver settlements, payments outstanding, expenses and LV profit"
      />
      <FinanceSections d={data} />
    </>
  );
}
