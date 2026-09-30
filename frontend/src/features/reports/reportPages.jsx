import ReportsPage from './ReportsPage';

/** Nav report pages (spec §45, §51) → the reports they show. */
const page = (title, description, reportKeys) =>
  function ReportPage() {
    return <ReportsPage title={title} description={description} reportKeys={reportKeys} />;
  };

export const DriverReportsPage = page(
  'Driver Reports',
  'Earnings, reconciliation, advances and deductions per driver',
  ['driver-earnings', 'driver-reconciliation', 'advances', 'deductions'],
);
export const TripReportsPage = page('Trip Reports', 'Trips and import history', [
  'trips',
  'imports',
]);
export const ExpenseReportsPage = page(
  'Expense Reports',
  'Fuel, toll, maintenance, EMI and driver-paid expenses',
  ['expenses'],
);
export const SettlementReportsPage = page('Settlement Reports', 'Driver and company settlements', [
  'driver-settlements',
  'company-settlements',
]);
export const PaymentReportsPage = page(
  'Payment Reports',
  'Driver payments and outstanding amounts',
  ['driver-payments', 'payment-outstanding'],
);
export const ProfitReportsPage = page(
  'Profit Reports',
  'LV profit = actual amount received − finalized driver settlements',
  ['company-profit', 'monthly-profit'],
);
export const ReconciliationPage = page(
  'Reconciliation',
  'Company: expected, actual received, finalized driver settlement, LV profit. Driver: every settlement component, payments and outstanding.',
  ['company-reconciliation', 'driver-reconciliation'],
);
