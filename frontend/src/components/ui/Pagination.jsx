import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page numbers around the current page, with gaps shown as null. */
function pageWindow(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const list = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((x, y) => x - y);
  return list.flatMap((n, i) => (i > 0 && n - list[i - 1] > 1 ? [null, n] : [n]));
}

export default function Pagination({ meta, onPageChange, onPageSizeChange, noun = 'results' }) {
  if (!meta || meta.total === 0) return null;
  const { page, pageSize, total, totalPages } = meta;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pageButton =
    'flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <div className="flex items-center gap-3">
        <span>
          Showing {from} to {to} of {total} {noun}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white py-1 pr-6 pl-2 text-sm text-slate-700"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          className={`${pageButton} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pageWindow(page, totalPages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`${pageButton} ${
                n === page
                  ? 'border-transparent bg-gradient-to-r from-brand-600 to-brand-800 font-medium text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className={`${pageButton} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
