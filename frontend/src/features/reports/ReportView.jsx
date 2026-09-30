import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inputClass } from '../../components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatDate, formatINR, formatKm, formatMonth } from '../../lib/format';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const PAGE = 100;

const STATUS_OPTIONS = {
  trips: ['ACTIVE', 'CANCELLED'],
  'driver-settlements': ['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED'],
  'driver-payments': ['VALID', 'REVERSED'],
  expenses: ['ACTIVE', 'VOID'],
  advances: ['OPEN', 'RECOVERED', 'VOID'],
  'company-settlements': ['PENDING', 'RECEIVED'],
  imports: ['VALIDATED', 'IMPORTED', 'DISCARDED', 'FAILED'],
};
const label = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function cell(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (col.type === 'money') return formatINR(v);
  if (col.type === 'number') return formatKm(v);
  if (col.type === 'date') return formatDate(v);
  if (col.type === 'month') return formatMonth(v);
  return String(v);
}

function Filters({ reportKey, filters, values, set }) {
  const needs = (f) => filters.includes(f);
  const companies = useOptions('companies', { includeInactive: true, enabled: needs('companyId') });
  const drivers = useOptions('drivers', { includeInactive: true, enabled: needs('driverId') });
  const vehicles = useOptions('vehicles', { includeInactive: true, enabled: needs('vehicleId') });
  const input = (key, type, aria) => (
    <input
      type={type}
      aria-label={aria}
      className={`${inputClass} w-full sm:w-40`}
      value={values[key] ?? ''}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  return (
    <Toolbar>
      {needs('month') && input('month', 'month', 'Month')}
      {needs('fromMonth') && input('fromMonth', 'month', 'From month')}
      {needs('toMonth') && input('toMonth', 'month', 'To month')}
      {needs('fromDate') && input('fromDate', 'date', 'From date')}
      {needs('toDate') && input('toDate', 'date', 'To date')}
      {needs('companyId') && (
        <FilterSelect
          label="Company"
          value={values.companyId}
          onChange={(v) => set('companyId', v)}
          options={(companies.data ?? []).map(toSelect.companies)}
        />
      )}
      {needs('driverId') && (
        <FilterSelect
          label="Driver"
          value={values.driverId}
          onChange={(v) => set('driverId', v)}
          options={(drivers.data ?? []).map(toSelect.drivers)}
        />
      )}
      {needs('vehicleId') && (
        <FilterSelect
          label="Vehicle"
          value={values.vehicleId}
          onChange={(v) => set('vehicleId', v)}
          options={(vehicles.data ?? []).map(toSelect.vehicles)}
        />
      )}
      {needs('paidBy') && (
        <FilterSelect
          label="Paid by"
          value={values.paidBy}
          onChange={(v) => set('paidBy', v)}
          options={[
            { value: 'LV', label: 'LV (deducted)' },
            { value: 'DRIVER', label: 'Driver (reimbursed)' },
          ]}
        />
      )}
      {needs('category') && (
        <FilterSelect
          label="Category"
          value={values.category}
          onChange={(v) => set('category', v)}
          options={['FUEL', 'TOLL', 'MAINTENANCE', 'EMI', 'OTHER'].map((c) => ({
            value: c,
            label: label(c),
          }))}
        />
      )}
      {needs('status') && STATUS_OPTIONS[reportKey] && (
        <FilterSelect
          label="Status"
          value={values.status}
          onChange={(v) => set('status', v)}
          options={STATUS_OPTIONS[reportKey].map((s) => ({ value: s, label: label(s) }))}
        />
      )}
    </Toolbar>
  );
}

/** One report: filters (from its declaration), table with totals, exports with the same filters. */
export default function ReportView({ reportKey, filters }) {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const values = useMemo(
    () => Object.fromEntries(filters.filter((f) => params.get(f)).map((f) => [f, params.get(f)])),
    [filters, params],
  );
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reports', reportKey, values],
    queryFn: () => get(`/reports/${reportKey}`, values),
    placeholderData: keepPreviousData,
  });

  const exportUrl = (format) =>
    `${API_BASE}/reports/${reportKey}?${new URLSearchParams({ ...values, format })}`;
  const rows = data?.rows ?? [];
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Filters reportKey={reportKey} filters={filters} values={values} set={set} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm">
        <span className="text-slate-500">
          {data ? `${data.rowCount.toLocaleString('en-IN')} row(s)` : ''}{' '}
          {isFetching && !isLoading ? '· updating…' : ''}
        </span>
        <div className="flex gap-2">
          {[
            ['csv', 'CSV', FileDown],
            ['xlsx', 'Excel', FileSpreadsheet],
            ['pdf', 'PDF', FileText],
          ].map(([fmt, text, Icon]) => (
            <a
              key={fmt}
              href={exportUrl(fmt)}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {text}
            </a>
          ))}
        </div>
      </div>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState title="No rows for these filters" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {data.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-500 uppercase ${c.type === 'money' || c.type === 'number' ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((r, i) => (
                <tr key={i}>
                  {data.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 whitespace-nowrap ${c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}`}
                    >
                      {cell(c, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {Object.keys(data.totals).length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <tr>
                  {data.columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 whitespace-nowrap ${c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}`}
                    >
                      {i === 0
                        ? 'Total'
                        : data.totals[c.key] !== undefined
                          ? cell(c, data.totals[c.key])
                          : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-2 text-sm">
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="rounded border px-2 py-1 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
