import { useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/PageHeader';
import Stat from '../../components/ui/Stat';
import { useListParams } from '../../hooks/useListParams';
import { get } from '../../lib/api';
import { formatINR, formatMonth } from '../../lib/format';
import SettlementTable from './SettlementTable';

function Summary() {
  const { params } = useListParams();
  const { data } = useQuery({
    queryKey: ['settlements', 'summary', params.month],
    queryFn: () => get('/settlements/summary', params.month ? { month: params.month } : {}),
  });
  const count = (s) => data?.byStatus?.[s]?.count ?? 0;
  const inProgress = count('DRAFT') + count('CALCULATED');
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="In preparation" value={inProgress} hint="Draft or calculated" tone="muted" />
      <Stat
        label="Awaiting admin"
        value={count('UNDER_REVIEW') + count('APPROVED')}
        hint="Under review or approved"
        tone="warning"
      />
      <Stat
        label="Finalized settlements"
        value={formatINR(data?.finalizedTotal)}
        hint={`${count('FINALIZED')} finalized${params.month ? ` · ${formatMonth(params.month)}` : ''}`}
        tone="positive"
      />
      <Stat
        label="Outstanding to pay"
        value={formatINR(data?.outstandingTotal)}
        hint="Finalized − valid payments"
      />
    </div>
  );
}

export default function SettlementsPage() {
  return (
    <>
      <PageHeader
        title="Driver Settlements"
        description="Monthly settlement per driver. Biller prepares and submits; Admin/Manager approves and finalizes."
      />
      <Summary />
      <SettlementTable />
    </>
  );
}
