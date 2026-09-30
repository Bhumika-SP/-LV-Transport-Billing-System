/**
 * Helpers for date periods [start, end] where end = null means open-ended.
 * Dates are Prisma DATE values (JS Date at 00:00 UTC), so comparison is exact.
 */

/** Prisma `where` fragment matching rows whose period overlaps [start, end]. */
export function overlapWhere(start, end, { from = 'startDate', to = 'endDate' } = {}) {
  return {
    ...(end && { [from]: { lte: end } }),
    OR: [{ [to]: null }, { [to]: { gte: start } }],
  };
}

/** Prisma `where` fragment matching rows active on a given date. */
export function activeOnWhere(date, { from = 'startDate', to = 'endDate' } = {}) {
  return { [from]: { lte: date }, OR: [{ [to]: null }, { [to]: { gte: date } }] };
}

/** CURRENT / UPCOMING / ENDED relative to a business date. */
export function periodStatus(start, end, today) {
  if (start > today) return 'UPCOMING';
  if (end && end < today) return 'ENDED';
  return 'CURRENT';
}
