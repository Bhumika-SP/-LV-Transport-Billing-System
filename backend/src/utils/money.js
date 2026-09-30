import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;

/**
 * All financial arithmetic goes through decimal.js (Prisma.Decimal). Never use
 * JS numbers for money. Results are rounded half-up to 2 decimal places (paise).
 */
export function toDecimal(value) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(String(value));
}

export function roundMoney(value) {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values) {
  return roundMoney(values.reduce((acc, v) => acc.plus(toDecimal(v)), new Decimal(0)));
}

export { Decimal };
