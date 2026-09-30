import { z } from 'zod';
import { SETTLEMENT_MONTH_REGEX } from '../config/constants.js';
import { isValidDateString } from '../utils/dates.js';

/** Shared Zod building blocks so every module validates the same way. */

export const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Trimmed string; empty string becomes null (for optional DB columns). */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined ? undefined : v || null));

export const requiredText = (max = 255) => z.string().trim().min(1, 'Required').max(max);

export const dateString = z
  .string()
  .trim()
  .refine(isValidDateString, 'Must be a valid date (YYYY-MM-DD)');

export const optionalDate = z
  .union([dateString, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const monthString = z
  .string()
  .trim()
  .regex(SETTLEMENT_MONTH_REGEX, 'Must be a month in YYYY-MM format');

/**
 * Non-negative decimal with at most 2 decimal places, carried as a string so no
 * floating-point value ever reaches a calculation. Accepts JSON numbers too.
 */
export const decimalString = ({ max = '9999999999999.99', allowZero = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine(
      (v) => /^\d{1,13}(\.\d{1,2})?$/.test(v),
      'Must be a non-negative amount with up to 2 decimals',
    )
    .refine((v) => Number(v) <= Number(max), `Must not exceed ${max}`)
    .refine((v) => allowZero || Number(v) > 0, 'Must be greater than zero');

export const statusEnum = z.enum(['ACTIVE', 'INACTIVE']);

/** Standard list query: pagination, sorting, free-text search. */
export const listQuery = (sortFields, defaultSort) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().trim().max(100).optional(),
    sortBy: z.enum(sortFields).default(defaultSort),
    sortDir: z.enum(['asc', 'desc']).default('asc'),
  });

export const optionalId = z.coerce.number().int().positive().optional();

/** Query for dropdown `/options` endpoints. */
export const optionsQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
