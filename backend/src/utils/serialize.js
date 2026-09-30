import { Prisma } from '@prisma/client';

/**
 * Field naming convention (see docs/ARCHITECTURE.md):
 *   *At                          -> timestamp, serialized as full ISO string (UTC)
 *   *Date, effectiveFrom/To      -> business calendar date, serialized as YYYY-MM-DD
 */
const DATE_ONLY_KEY = /(Date|From|To)$/;

/**
 * Convert Prisma results into the API wire format:
 *   Decimal -> "1234.50" (always 2 dp, never a JS number)
 *   Date    -> "YYYY-MM-DD" for date-only fields, ISO string for timestamps
 */
export function serialize(value, key = '') {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) {
    return DATE_ONLY_KEY.test(key) ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => serialize(v, key));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v, k);
    return out;
  }
  return value;
}
