import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './States';

/**
 * columns: [{ key, header, render?(row), sortable?, align?: 'right', className? }]
 * sort:    { sortBy, sortDir } — server-side sorting; onSort(key) toggles.
 */
export default function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  sort,
  onSort,
  onRowClick,
  empty,
  rowKey = (row) => row.id,
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows?.length) return empty ?? <EmptyState />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => {
              const active = sort?.sortBy === col.key;
              const SortIcon = !active ? ArrowUpDown : sort.sortDir === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={`px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
                    >
                      {col.header}
                      <SortIcon className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2.5 whitespace-nowrap text-slate-700 ${
                    col.align === 'right' ? 'text-right tabular-nums' : ''
                  } ${col.className ?? ''}`}
                >
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
