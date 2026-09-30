import { BUSINESS_TIMEZONE } from '../config/constants.js';

/**
 * Business dates are calendar dates (no time, no zone). They are carried as
 * "YYYY-MM-DD" strings in the API and stored in MySQL DATE columns. Prisma maps
 * DATE to a JS Date at 00:00 UTC, so all conversions here use UTC to stay exact.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(str) {
  const m = DATE_RE.exec(str ?? '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** "2026-09-14" -> Date(2026-09-14T00:00:00Z) for a Prisma DATE column. */
export function parseDateOnly(str) {
  if (!isValidDateString(str)) throw new Error(`Invalid date: ${str}`);
  return new Date(`${str}T00:00:00.000Z`);
}

/** Prisma DATE value -> "YYYY-MM-DD". */
export function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/** Settlement month for a business date: "2026-09-14" -> "2026-09". Pure string op. */
export function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

/** Today's date in the business timezone (not the server's). */
export function todayInBusinessTz(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(now);
}

/** "2026-04-01", -1 -> "2026-03-31" */
export function addDays(dateStr, days) {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** First and last calendar date of a settlement month. */
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start, end };
}
