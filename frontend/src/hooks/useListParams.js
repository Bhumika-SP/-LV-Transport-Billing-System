import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List state (page, search, sort, filters) kept in the URL so lists are linkable
 * and survive refresh/back navigation.
 */
export function useListParams({ sortBy, sortDir = 'asc', pageSize = 25 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const out = Object.fromEntries(searchParams.entries());
    delete out.tab;
    return {
      ...out,
      page: Number(out.page) || 1,
      pageSize: Number(out.pageSize) || pageSize,
      sortBy: out.sortBy || sortBy,
      sortDir: out.sortDir || sortDir,
    };
  }, [searchParams, sortBy, sortDir, pageSize]);

  /** Merge updates; any change other than page resets to page 1. */
  const update = useCallback(
    (changes) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggleSort = useCallback(
    (key) =>
      update({
        sortBy: key,
        sortDir: params.sortBy === key && params.sortDir === 'asc' ? 'desc' : 'asc',
      }),
    [params.sortBy, params.sortDir, update],
  );

  return { params, update, toggleSort };
}
