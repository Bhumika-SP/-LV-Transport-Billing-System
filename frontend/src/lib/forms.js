import { z } from 'zod';

/** Convert an API entity into form values: null -> '' so inputs are controlled. */
export function toFormValues(entity, names) {
  return Object.fromEntries(names.map((n) => [n, entity?.[n] == null ? '' : String(entity[n])]));
}

/** Client-side validators mirroring the API (the API remains authoritative). */
export const v = {
  required: (label = 'This field') => z.string().trim().min(1, `${label} is required`),
  optional: () => z.string().trim().optional(),
  optionalMatch: (re, message) =>
    z
      .string()
      .trim()
      .optional()
      .refine((s) => !s || re.test(s), message),
  optionalEmail: () =>
    z
      .string()
      .trim()
      .optional()
      .refine((s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Enter a valid email'),
  phone: () =>
    z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s-]{6,14}$/, 'Enter a valid phone number'),
  optionalPhone: () =>
    z
      .string()
      .trim()
      .optional()
      .refine((s) => !s || /^\+?[0-9][0-9\s-]{6,14}$/.test(s), 'Enter a valid phone number'),
  amount: (label = 'Amount') =>
    z
      .string()
      .trim()
      .regex(/^\d{1,13}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimals`),
};

export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

/** Spec §20: the only payment methods allowed in V1. */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
];

export const paymentMethodLabel = (value) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? '—';
