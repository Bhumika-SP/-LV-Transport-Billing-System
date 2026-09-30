import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Stat from '../../components/ui/Stat';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatINR, formatMonth } from '../../lib/format';
import { CompanyProfitChart, ProfitTrendChart, ReceivedVsSettledChart } from './ProfitCharts';

const FORMULA = 'LV Profit = Actual company amount RECEIVED − Total FINALIZED driver settlements';

const money = (key, bold) => ({
  key,
  align: 'right',
  render: (r) => <span className={bold ? 'font-semibold' : ''}>{formatINR(r[key])}</span>,
});
const profitCell = (r) => (
  <span
    className={`font-semibold ${r.lvProfit.startsWith('-') ? 'text-red-700' : 'text-emerald-700'}`}
  >
    {formatINR(r.lvProfit)}
  </span>
);

function Totals({ totals }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Stat
        label="Company amount received"
        value={formatINR(totals.receivedAmount)}
        hint={`Pending (not counted): ${formatINR(totals.pendingExpected)}`}
      />
      <Stat
        label="Total finalized driver settlement"
        value={formatINR(totals.finalizedSettlements)}
      />
      <Stat
        label="LV profit"
        value={formatINR(totals.lvProfit)}
        tone={totals.lvProfit.startsWith('-') ? 'warning' : 'positive'}
      />
    </div>
  );
}

function RangeFilters({ params, update, withCompany }) {
  const companies = useOptions('companies', { includeInactive: true, enabled: withCompany });
  return (
    <Toolbar>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        From
        <input
          type="month"
          className={`${inputClass} w-40`}
          value={params.fromMonth ?? ''}
          onChange={(e) => update({ fromMonth: e.target.value || undefined })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        To
        <input
          type="month"
          className={`${inputClass} w-40`}
          value={params.toMonth ?? ''}
          onChange={(e) => update({ toMonth: e.target.value || undefined })}
        />
      </label>
      {withCompany && (
        <FilterSelect
          label="Company"
          value={params.companyId}
          onChange={(v) => update({ companyId: v })}
          options={(companies.data ?? []).map(toSelect.companies)}
        />
      )}
    </Toolbar>
  );
}

function useProfit(path, query) {
  return useQuery({
    queryKey: ['profit', path, query],
    queryFn: () => get(`/profit/${path}`, query),
    placeholderData: keepPreviousData,
  });
}

const pick = (p, keys) => Object.fromEntries(keys.filter((k) => p[k]).map((k) => [k, p[k]]));

/** Monthly table + chart. `companyId` pins a company (company detail tab). */
export function MonthlyProfitView({ companyId }) {
  const { params, update } = useListParams();
  const query = {
    ...pick(params, ['fromMonth', 'toMonth', 'companyId']),
    ...(companyId && { companyId }),
  };
  const { data, isLoading, error, refetch } = useProfit('monthly', query);
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const incomplete = data.months.some((m) => m.unfinalizedSettlements > 0);

  return (
    <>
      <Totals totals={data.totals} />
      {incomplete && (
        <p className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Some months still have driver settlements that are not finalized; they are excluded until
          finalized.
        </p>
      )}
      <Card className="mb-4" title="Received vs finalized driver settlements">
        <div className="p-4">
          {data.months.length ? (
            <ReceivedVsSettledChart months={data.months} />
          ) : (
            <EmptyState title="No data" />
          )}
        </div>
      </Card>
      <div className="rounded-lg border border-slate-200 bg-white">
        <RangeFilters params={params} update={update} withCompany={!companyId} />
        <DataTable
          rows={data.months}
          rowKey={(r) => r.settlementMonth}
          empty={<EmptyState title="No profit data for this period" />}
          columns={[
            {
              key: 'settlementMonth',
              header: 'Month',
              render: (r) => formatMonth(r.settlementMonth),
              className: 'font-medium',
            },
            { ...money('receivedAmount'), header: 'Amount received' },
            { ...money('pendingExpected'), header: 'Pending (expected)' },
            { ...money('finalizedSettlements'), header: 'Finalized driver settlement' },
            { key: 'lvProfit', header: 'LV profit', align: 'right', render: profitCell },
            ...(companyId
              ? []
              : [
                  {
                    key: 'unfinalizedSettlements',
                    header: 'Not yet finalized',
                    align: 'right',
                    render: (r) => r.unfinalizedSettlements || '—',
                  },
                ]),
          ]}
        />
      </div>
    </>
  );
}

export function MonthlyProfitPage() {
  return (
    <>
      <PageHeader title="Monthly Profit" description={FORMULA} />
      <MonthlyProfitView />
    </>
  );
}

export function CompanyProfitPage() {
  const { params, update } = useListParams();
  const query = pick(params, ['fromMonth', 'toMonth']);
  const { data, isLoading, error, refetch } = useProfit('companies', query);

  return (
    <>
      <PageHeader
        title="Company Profit"
        description={`${FORMULA}. A driver who served several companies in a month is split by trip earnings.`}
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <Totals totals={data.totals} />
          <Card className="mb-4" title="LV profit by company">
            <div className="p-4">
              {data.companies.some((c) => c.company) ? (
                <CompanyProfitChart companies={data.companies} />
              ) : (
                <EmptyState title="No data" />
              )}
            </div>
          </Card>
          <div className="rounded-lg border border-slate-200 bg-white">
            <RangeFilters params={params} update={update} />
            <DataTable
              rows={data.companies}
              rowKey={(r) => r.companyId ?? 'unattributed'}
              empty={<EmptyState title="No profit data for this period" />}
              columns={[
                {
                  key: 'company',
                  header: 'Company',
                  className: 'font-medium',
                  render: (r) =>
                    r.company?.name ?? (
                      <span className="text-slate-500">Not attributable (no trips)</span>
                    ),
                },
                { ...money('receivedAmount'), header: 'Amount received' },
                { ...money('pendingExpected'), header: 'Pending (expected)' },
                { ...money('finalizedSettlements'), header: 'Finalized driver settlement' },
                { key: 'lvProfit', header: 'LV profit', align: 'right', render: profitCell },
              ]}
            />
          </div>
        </>
      )}
    </>
  );
}

export function OverallProfitPage() {
  const { data, isLoading, error, refetch } = useProfit('overall', {});
  return (
    <>
      <PageHeader title="Overall Profit" description={FORMULA} />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <Totals totals={data.totals} />
          <Card className="mb-4" title="LV profit by month">
            <div className="p-4">
              {data.trend.length ? (
                <ProfitTrendChart trend={data.trend} />
              ) : (
                <EmptyState title="No data" />
              )}
            </div>
          </Card>
          <Card title="By month">
            <DataTable
              rows={[...data.trend].reverse()}
              rowKey={(r) => r.settlementMonth}
              columns={[
                {
                  key: 'settlementMonth',
                  header: 'Month',
                  render: (r) => formatMonth(r.settlementMonth),
                  className: 'font-medium',
                },
                { ...money('receivedAmount'), header: 'Amount received' },
                { ...money('finalizedSettlements'), header: 'Finalized driver settlement' },
                { key: 'lvProfit', header: 'LV profit', align: 'right', render: profitCell },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
