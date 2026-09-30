import { isValidDateString } from '../../utils/dates.js';

/**
 * System fields an import column can map to (spec §39). Which KM fields are required
 * depends on the template's KM mode.
 */
export const TARGET_FIELDS = {
  driver: { label: 'Driver', required: true },
  vehicle: { label: 'Vehicle registration', required: true },
  tripDate: { label: 'Trip date', required: true },
  externalTripId: { label: 'External trip ID' },
  tripReference: { label: 'Trip reference' },
  pickup: { label: 'Pickup' },
  dropLocation: { label: 'Drop' },
  startKm: { label: 'Start KM', requiredFor: 'START_END' },
  endKm: { label: 'End KM', requiredFor: 'START_END' },
  totalKm: { label: 'Total KM', requiredFor: 'DIRECT' },
  notes: { label: 'Notes' },
};

/** Fields that may form the configurable duplicate key (spec §41). Company is implicit. */
export const DUPLICATE_KEY_FIELDS = [
  'externalTripId',
  'tripDate',
  'vehicle',
  'driver',
  'tripReference',
  'startKm',
  'totalKm',
];

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD-MMM-YYYY',
];

export const DRIVER_MATCH_FIELDS = ['CODE', 'LICENSE', 'PHONE', 'NAME'];

export function requiredFields(kmMode) {
  return Object.entries(TARGET_FIELDS)
    .filter(([, f]) => f.required || f.requiredFor === kmMode)
    .map(([k]) => k);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * Normalize a date cell to "YYYY-MM-DD", or null if it cannot be read.
 * - JS Date (Excel date cell): its UTC calendar date is used (Excel dates carry no zone).
 * - Number: Excel serial date.
 * - String: parsed strictly with the template's format.
 */
export function parseImportDate(value, format) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'number') {
    if (value < 1 || value > 100000) return null;
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const s = String(value).trim();
  // ISO dates are unambiguous, so they are accepted whatever the template format. This
  // also covers Excel date cells, which are stored as YYYY-MM-DD in the batch rows.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidDateString(s) ? s : null;
  let y;
  let m;
  let d;
  let match;
  switch (format) {
    case 'YYYY-MM-DD':
      match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
      if (match) [, y, m, d] = match;
      break;
    case 'MM/DD/YYYY':
      match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      if (match) [, m, d, y] = match;
      break;
    case 'DD-MMM-YYYY':
      match = /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/.exec(s);
      if (match) {
        [, d, , y] = match;
        const idx = MONTHS.indexOf(match[2].toUpperCase());
        m = idx >= 0 ? idx + 1 : null;
      }
      break;
    default: {
      // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
      const sep = format[2] === '.' ? '\\.' : format[2];
      match = new RegExp(`^(\\d{1,2})${sep}(\\d{1,2})${sep}(\\d{4})$`).exec(s);
      if (match) [, d, m, y] = match;
    }
  }
  if (!match || !m) return null;
  const iso = `${y}-${pad(Number(m))}-${pad(Number(d))}`;
  return isValidDateString(iso) ? iso : null;
}

/** Text cell → trimmed string or null. */
export function cleanText(value) {
  if (value === null || value === undefined) return null;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  return s === '' ? null : s;
}

/** Numeric cell → plain decimal string ("12,500.5" → "12500.5"); validation happens later. */
export function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'invalid';
  return String(value).trim().replace(/,/g, '');
}
