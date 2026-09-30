import { keepPreviousData, useQuery } from '@tanstack/react-query';
import PageHeader from '../../components/PageHeader';
import Stat from '../../components/ui/Stat';
import { useListParams } from '../../hooks/useListParams';
import { get } from '../../lib/api';
import { formatINR } from '../../lib/format';
import DriverItemsTable from './DriverItemsTable';
import { DRIVER_EXPENSES, LV_EXPENSES, vehicleColumn } from './itemConfigs';

/** Per-category totals (ACTIVE items) for the current list filters. */
function CategoryTotals({ config, tone }) {
  const { params } = useListParams();
  const filters = Object.fromEntries(
    ['driverId', 'month', 'vehicleId', 'fromDate', 'toDate']
      .filter((k) => params[k])
      .map((k) => [k, params[k]]),
  );
  const { data } = useQuery({
    queryKey: [config.resource, 'totals', filters],
    queryFn: () => get(`/${config.resource}/totals`, filters),
    placeholderData: keepPreviousData,
  });
  const byType = Object.fromEntries((data ?? []).map((t) => [t.type, t.amount]));
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {config.types.map((t) => (
        <Stat key={t.value} label={t.label} value={formatINR(byType[t.value] ?? '0')} tone={tone} />
      ))}
    </div>
  );
}

export function LvExpensesPage() {
  return (
    <>
      <PageHeader
        title="LV Expenses"
        description="Fuel, toll, maintenance and EMI paid by LV on a driver's behalf. These are DEDUCTED from that driver's monthly settlement."
      />
      <CategoryTotals config={LV_EXPENSES} tone="warning" />
      <DriverItemsTable config={LV_EXPENSES} extraColumns={[vehicleColumn]} />
    </>
  );
}

export function DriverExpensesPage() {
  return (
    <>
      <PageHeader
        title="Driver Expenses"
        description="Expenses a driver paid personally. They are REIMBURSED, i.e. ADDED to the driver's monthly settlement."
      />
      <CategoryTotals config={DRIVER_EXPENSES} tone="positive" />
      <DriverItemsTable config={DRIVER_EXPENSES} extraColumns={[vehicleColumn]} />
    </>
  );
}
