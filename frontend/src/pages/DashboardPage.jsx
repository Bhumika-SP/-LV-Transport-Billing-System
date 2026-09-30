import { AlertTriangle, ArrowRight, CalendarClock, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import PageHeader from '../components/PageHeader';
import Card from '../components/ui/Card';
import Stat from '../components/ui/Stat';
import { ErrorState, LoadingState } from '../components/ui/States';
import { ProfitTrendChart } from '../features/profit/ProfitCharts';
import { useDashboard } from '../hooks/useDashboard';
import { formatDate, formatINR, formatKm, formatMonth } from '../lib/format';

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

function Section({ title, to, children }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        {to && (
          <Link to={to} className="flex items-center gap-1 text-sm text-brand-700 hover:underline">
            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4';

function ActionItem({ to, count, label, tone = 'amber' }) {
  if (!count) return null;
  const colors = {
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
    blue: 'bg-blue-50 text-blue-800',
  };
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm hover:opacity-90 ${colors[tone]}`}
    >
      <span>
        <span className="font-semibold">{count}</span> {label}
      </span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function ActionsNeeded({ d }) {
  const items = [
    d.settlements && (
      <ActionItem
        key="rev"
        to="/settlements?status=UNDER_REVIEW"
        count={d.settlements.awaitingApproval}
        label="settlement(s) awaiting approval"
      />
    ),
    d.settlements && (
      <ActionItem
        key="fin"
        to="/settlements?status=APPROVED"
        count={d.settlements.awaitingFinalization}
        label="approved settlement(s) awaiting finalization"
      />
    ),
    d.settlements && (
      <ActionItem
        key="neg"
        to="/settlements"
        count={d.settlements.negativeDrafts}
        label="draft settlement(s) with a negative total"
        tone="red"
      />
    ),
    d.imports && (
      <ActionItem
        key="imp"
        to="/imports?tab=history&status=VALIDATED"
        count={d.imports.pendingConfirmation}
        label="import(s) validated but not confirmed"
        tone="blue"
      />
    ),
    d.imports && (
      <ActionItem
        key="impf"
        to="/imports?tab=history&status=FAILED"
        count={d.imports.failedLast30Days}
        label="failed import(s) in the last 30 days"
        tone="red"
      />
    ),
    d.companyReceipts && (
      <ActionItem
        key="cs"
        to="/company-settlements?status=PENDING"
        count={d.companyReceipts.overduePending}
        label="company settlement(s) from past months still pending"
      />
    ),
    d.payments && (
      <ActionItem
        key="pay"
        to="/settlements?paymentStatus=PARTIALLY_PAID"
        count={d.payments.settlementsWithOutstanding}
        label="finalized settlement(s) with money still to pay"
        tone="blue"
      />
    ),
  ].filter(Boolean);
  if (!items.some((i) => i.props.count)) return null;
  return (
    <Section title="Needs attention">
      <div className="grid gap-2 md:grid-cols-2">{items}</div>
    </Section>
  );
}

function DocumentAlerts({ alerts }) {
  if (!alerts?.length) return null;
  const labels = {
    LICENSE: 'Driving licence',
    INSURANCE: 'Insurance',
    FITNESS: 'Fitness certificate',
    PERMIT: 'Permit',
  };
  return (
    <Section title="Document expiry (next 30 days)">
      <Card>
        <ul className="divide-y divide-slate-100 text-sm">
          {alerts.slice(0, 8).map((a) => (
            <li
              key={`${a.entityType}-${a.entityId}-${a.kind}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="flex items-center gap-2">
                <CalendarClock
                  className={`h-4 w-4 ${a.expired ? 'text-red-600' : 'text-amber-600'}`}
                  aria-hidden="true"
                />
                <Link
                  className="text-brand-700 hover:underline"
                  to={`/${a.entityType === 'DRIVER' ? 'drivers' : 'vehicles'}/${a.entityId}`}
                >
                  {a.name}
                </Link>
                <span className="text-slate-500">{labels[a.kind]}</span>
              </span>
              <span className={a.expired ? 'font-medium text-red-700' : 'text-slate-600'}>
                {a.expired ? 'Expired ' : 'Expires '}
                {formatDate(a.date)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/** Financial sections shared by the main dashboard and the Finance Dashboard. */
export function FinanceSections({ d }) {
  return (
    <>
      {d.profit && (
        <Section title="LV profit (last 6 months)" to="/profit/monthly">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Company amount received"
              value={formatINR(d.profit.totals.receivedAmount)}
              hint={`Pending, not counted: ${formatINR(d.profit.totals.pendingExpected)}`}
            />
            <Stat
              label="Finalized driver settlement"
              value={formatINR(d.profit.totals.finalizedSettlements)}
            />
            <Stat
              label="LV profit"
              value={formatINR(d.profit.totals.lvProfit)}
              tone={d.profit.totals.lvProfit.startsWith('-') ? 'warning' : 'positive'}
            />
          </div>
          {d.profit.trend.length > 1 && (
            <Card>
              <div className="p-4">
                <ProfitTrendChart trend={d.profit.trend} />
              </div>
            </Card>
          )}
        </Section>
      )}
      {d.companyReceipts && (
        <Section
          title={`Company receipts · ${formatMonth(d.companyReceipts.month)}`}
          to="/company-settlements"
        >
          <div className={grid}>
            <Stat
              label="Expected this month"
              value={formatINR(d.companyReceipts.current.expectedTotal)}
              tone="muted"
            />
            <Stat
              label="Received this month"
              value={formatINR(d.companyReceipts.current.receivedTotal)}
              tone="positive"
            />
            <Stat
              label="Pending this month"
              value={formatINR(d.companyReceipts.current.pendingTotal)}
              tone="warning"
            />
            <Stat
              label={`Received ${formatMonth(d.companyReceipts.previousMonth)}`}
              value={formatINR(d.companyReceipts.previous.receivedTotal)}
              tone="muted"
            />
          </div>
        </Section>
      )}
      {(d.settlements || d.payments) && (
        <Section title="Driver settlements & payments" to="/settlements">
          <div className={grid}>
            {d.settlements && (
              <>
                <Stat
                  label={`Finalized · ${formatMonth(d.settlements.month)}`}
                  value={formatINR(d.settlements.byStatus.FINALIZED?.finalAmount)}
                  hint={`${d.settlements.byStatus.FINALIZED?.count ?? 0} settlement(s)`}
                />
                <Stat
                  label="Awaiting approval / finalization"
                  value={d.settlements.awaitingApproval + d.settlements.awaitingFinalization}
                  tone="warning"
                />
              </>
            )}
            {d.payments && (
              <>
                <Stat
                  label="Outstanding to drivers"
                  value={formatINR(d.payments.outstanding)}
                  hint={`${d.payments.settlementsWithOutstanding} settlement(s)`}
                  tone="warning"
                />
                <Stat
                  label="Paid this month"
                  value={formatINR(d.payments.paidThisMonth)}
                  hint={`${d.payments.paymentsThisMonth} payment(s)`}
                  tone="positive"
                />
              </>
            )}
          </div>
        </Section>
      )}
      {d.expenses && (
        <Section title={`Expenses · ${formatMonth(d.expenses.month)}`} to="/lv-expenses">
          <div className={grid}>
            <Stat
              label="LV-paid (deducted from drivers)"
              value={formatINR(d.expenses.lvPaidTotal)}
            />
            <Stat
              label="Fuel / Toll"
              value={`${formatINR(d.expenses.lvPaidByCategory.FUEL ?? '0')} / ${formatINR(d.expenses.lvPaidByCategory.TOLL ?? '0')}`}
              tone="muted"
            />
            <Stat label="Driver-paid (reimbursed)" value={formatINR(d.expenses.driverPaidTotal)} />
            <Stat label="Expense entries" value={n(d.expenses.entries)} tone="muted" />
          </div>
        </Section>
      )}
    </>
  );
}

function AuditAlerts({ a }) {
  if (!a || !(a.failedLoginsLast24h || a.reopensLast30Days || a.paymentReversalsLast30Days))
    return null;
  return (
    <Section title="Audit alerts" to="/audit">
      <div className="flex flex-wrap gap-3 text-sm">
        {a.failedLoginsLast24h > 0 && (
          <span className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-red-800">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" /> {a.failedLoginsLast24h} failed
            login(s) in 24h
          </span>
        )}
        {a.reopensLast30Days > 0 && (
          <span className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {a.reopensLast30Days}{' '}
            settlement reopen(s) in 30 days
          </span>
        )}
        {a.paymentReversalsLast30Days > 0 && (
          <span className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {a.paymentReversalsLast30Days}{' '}
            payment reversal(s) in 30 days
          </span>
        )}
      </div>
    </Section>
  );
}

/** Role-aware dashboard (spec §44): the server returns only what the role may see. */
export default function DashboardPage() {
  const { user } = useAuth();
  const { data: d, isLoading, error, refetch } = useDashboard();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const operationsFirst = d.role === 'BILLER';
  const operations = (
    <>
      {d.counts && (
        <Section title={`Operations · ${formatMonth(d.month)}`}>
          <div className={grid}>
            <Stat label="Active companies" value={n(d.counts.companies)} />
            <Stat label="Active drivers" value={n(d.counts.drivers)} />
            <Stat label="Active vehicles" value={n(d.counts.vehicles)} />
            <Stat
              label="Trips this month"
              value={n(d.counts.tripsThisMonth)}
              hint={`${formatKm(d.counts.kmThisMonth)} km · ${formatINR(d.counts.tripEarningsThisMonth)}`}
            />
          </div>
        </Section>
      )}
      <DocumentAlerts alerts={d.documentAlerts} />
    </>
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`${user.role.name} · ${formatDate(d.today)}`}
      />
      <ActionsNeeded d={d} />
      {operationsFirst ? (
        <>
          {operations}
          <FinanceSections d={d} />
        </>
      ) : (
        <>
          <FinanceSections d={d} />
          {operations}
        </>
      )}
      <AuditAlerts a={d.auditAlerts} />
    </>
  );
}
