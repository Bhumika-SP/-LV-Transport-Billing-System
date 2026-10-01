import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from './States';

/**
 * columns: [{ key, header, render?(row), sortable?, align?: 'right', className? }]
 * sort:    { sortBy, sortDir } — server-side sorting; onSort(key) toggles.
 * important: true on a column shows its values in bold green (the key fields of a list).
 * selection / onSelectionChange: optional Set of selected row keys; adds a checkbox column.
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
  selection,
  onSelectionChange,
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows?.length) return empty ?? <EmptyState />;

  const keys = rows.map(rowKey);
  const allSelected = selection && keys.every((k) => selection.has(k));
  const toggleAll = () => onSelectionChange(allSelected ? new Set() : new Set(keys));
  const toggleOne = (k) => {
    const next = new Set(selection);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onSelectionChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {selection && (
              <th scope="col" className="w-10 py-2.5 pr-0 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                />
              </th>
            )}
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
              className={`transition-colors hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''} ${
                selection?.has(rowKey(row)) ? 'bg-brand-50/50' : ''
              }`}
            >
              {selection && (
                <td className="w-10 py-2.5 pr-0 pl-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    checked={selection.has(rowKey(row))}
                    onChange={() => toggleOne(rowKey(row))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                  />
                </td>
              )}
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 whitespace-nowrap ${
                    col.important
                      ? 'font-semibold text-emerald-700 [&_a]:font-semibold [&_a]:text-emerald-700 [&_span]:font-semibold'
                      : 'text-slate-700'
                  } ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${
                    col.className ?? ''
                  }`}
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
