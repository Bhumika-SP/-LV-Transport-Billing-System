import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';

/**
 * Pure trip calculations (spec §16–17). The ONLY place these formulas exist; manual
 * entry, preview, recalculation and bulk import all call these functions.
 */

const KM_RE = /^\d{1,10}(\.\d{1,2})?$/;

function parseKm(value, path, label, errors) {
  if (value === null || value === undefined || String(value).trim() === '') {
    errors.push({ path, message: `${label} is required` });
    return null;
  }
  const str = String(value).trim();
  if (str.startsWith('-')) {
    errors.push({ path, message: `${label} cannot be negative` });
    return null;
  }
  if (!KM_RE.test(str)) {
    errors.push({ path, message: `${label} must be a number with up to 2 decimals` });
    return null;
  }
  return new Decimal(str);
}

/**
 * Resolve total KM from the chosen method.
 *   START_END: totalKm = endKm − startKm, endKm must be ≥ startKm
 *   DIRECT:    totalKm as given (start/end are not stored)
 * Returns { ok: true, km: { startKm, endKm, totalKm, kmSource } } or { ok: false, errors }.
 */
export function resolveKm({ kmSource, startKm, endKm, totalKm }) {
  const errors = [];
  if (kmSource === 'START_END') {
    const start = parseKm(startKm, 'startKm', 'Start KM', errors);
    const end = parseKm(endKm, 'endKm', 'End KM', errors);
    if (start && end && end.lt(start)) {
      errors.push({ path: 'endKm', message: 'End KM cannot be less than Start KM' });
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true, km: { kmSource, startKm: start, endKm: end, totalKm: end.minus(start) } };
  }
  if (kmSource === 'DIRECT') {
    const total = parseKm(totalKm, 'totalKm', 'Total KM', errors);
    if (errors.length) return { ok: false, errors };
    return { ok: true, km: { kmSource, startKm: null, endKm: null, totalKm: total } };
  }
  return {
    ok: false,
    errors: [{ path: 'kmSource', message: 'KM method must be START_END or DIRECT' }],
  };
}

/** TRIP EARNINGS = TOTAL KM × RATE PER KM, rounded half-up to paise. */
export function calculateTripEarnings(totalKm, ratePerKm) {
  return roundMoney(toDecimal(totalKm).times(toDecimal(ratePerKm)));
}
