import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/States';
import { get } from '../../lib/api';
import { formatINR, formatMonth } from '../../lib/format';

/**
 * Gross earnings per driver per month (spec §21), every component shown:
 * trip earnings + allowances + other earnings + positive adjustments = gross.
 * The total is computed by the server; this component only displays it.
 */
export default function GrossEarningsTable({ driverId, month, onMonthChange }) {
  const query = { ...(driverId ? { driverId } : { month }) };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['earnings-gross', query],
    queryFn: () => get('/earnings/gross', query),
    placeholderData: keepPreviousData,
  });

  const money = (key) => (r) => formatINR(r[key]);
  const columns = [
    driverId
      ? {
          key: 'settlementMonth',
          header: 'Month',
          render: (r) => formatMonth(r.settlementMonth),
          className: 'font-medium',
        }
      : {
          key: 'driver',
          header: 'Driver',
          render: (r) => (
            <Link
              className="font-medium text-brand-700 hover:underline"
              to={`/drivers/${r.driverId}?tab=earnings`}
            >
              {r.driver.fullName}
            </Link>
          ),
        },
    { key: 'tripCount', header: 'Trips', align: 'right' },
    { key: 'tripEarnings', header: 'Trip earnings', align: 'right', render: money('tripEarnings') },
    { key: 'allowances', header: '+ Allowances', align: 'right', render: money('allowances') },
    {
      key: 'otherEarnings',
      header: '+ Other earnings',
      align: 'right',
      render: money('otherEarnings'),
    },
    {
      key: 'positiveAdjustments',
      header: '+ Positive adj.',
      align: 'right',
      render: money('positiveAdjustments'),
    },
    {
      key: 'grossEarnings',
      header: '= Gross earnings',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.grossEarnings)}</span>,
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {!driverId && (
        <div className="flex items-center gap-3 border-b border-slate-200 p-3">
          <label htmlFor="gross-month" className="text-sm text-slate-600">
            Settlement month
          </label>
          <input
            id="gross-month"
            type="month"
            className={`${inputClass} w-44`}
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
          />
        </div>
      )}
      <DataTable
        columns={columns}
        rows={data}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        rowKey={(r) => `${r.driverId}-${r.settlementMonth}`}
        empty={<EmptyState title="No earnings for this period" />}
      />
    </div>
  );
}
