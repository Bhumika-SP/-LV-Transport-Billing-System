import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Tabs from '../../components/ui/Tabs';
import { currentMonth } from '../../lib/format';
import DriverItemsTable from './DriverItemsTable';
import GrossEarningsTable from './GrossEarningsTable';
import { EARNINGS, POSITIVE_ADJUSTMENTS } from './itemConfigs';

export default function EarningsPage() {
  const [params, setParams] = useSearchParams();
  const grossMonth = params.get('grossMonth') ?? currentMonth();

  return (
    <>
      <PageHeader
        title="Driver Earnings"
        description="Gross earnings = trip earnings + allowances + other earnings + positive adjustments"
      />
      <Tabs
        tabs={[
          {
            key: 'gross',
            label: 'Monthly gross earnings',
            content: (
              <GrossEarningsTable
                month={grossMonth}
                onMonthChange={(m) => {
                  const next = new URLSearchParams(params);
                  next.set('grossMonth', m);
                  setParams(next, { replace: true });
                }}
              />
            ),
          },
          {
            key: 'earnings',
            label: 'Allowances & other earnings',
            content: <DriverItemsTable config={EARNINGS} />,
          },
          {
            key: 'adjustments',
            label: 'Positive adjustments',
            content: (
              <DriverItemsTable
                config={POSITIVE_ADJUSTMENTS}
                fixed={{ type: 'POSITIVE_ADJUSTMENT' }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
