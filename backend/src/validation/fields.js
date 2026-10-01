import { z } from 'zod';

/** Reusable field validators for Indian business data. Empty strings become null. */

/** '' -> null (clear the field); undefined stays undefined (field not sent). */
const emptyToNull = (v) => (v === '' ? null : v);

const optional = (schema) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? emptyToNull(v.trim()) : emptyToNull(v)),
    schema.nullable().optional(),
  );

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,14}$/, 'Enter a valid phone number')
  // Stored without spaces or hyphens: 9000000004, +918041167000.
  .transform((v) => v.replace(/[\s-]/g, ''));

export const optionalPhone = optional(phone);

export const optionalEmail = optional(z.string().email('Enter a valid email').max(191));

/** GSTIN: 2-digit state code, PAN (10), entity number, 'Z', checksum. */
export const optionalGstin = optional(
  z
    .string()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN'),
);

export const optionalIfsc = optional(
  z
    .string()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character IFSC'),
);

export const optionalUpi = optional(
  z.string().regex(/^[\w.-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/, 'Enter a valid UPI ID (name@bank)'),
);

export const optionalBankAccount = optional(
  z.string().regex(/^[0-9]{6,20}$/, 'Account number must be 6–20 digits'),
);

/** Upper-case short code: letters, digits, hyphen. */
export const optionalCode = optional(
  z
    .string()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Use 2–20 letters, digits or hyphens'),
);

/** Vehicle registration, normalized to upper-case without spaces or hyphens. */
export function normalizeRegistration(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

export const registrationNumber = z
  .string()
  .transform(normalizeRegistration)
  .pipe(z.string().regex(/^[A-Z0-9]{4,15}$/, 'Enter a valid registration number'));

export { optional as optionalField };
