import { z } from 'zod';
import {
  dateString,
  decimalString,
  monthString,
  optionalId,
  reasonText,
} from '../../validation/common.js';

/** Shared validation pieces for driver financial line items. */

export const positiveAmount = decimalString({ allowZero: false });

export const itemBase = {
  driverId: z.coerce.number().int().positive(),
  amount: positiveAmount,
  settlementMonth: monthString.optional(),
};

export const voidSchema = z.object({ reason: reasonText });

export const itemListQuery = (types, extra = {}) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
    driverId: optionalId,
    month: monthString.optional(),
    type: z.enum(types).optional(),
    status: z.enum(['ACTIVE', 'VOID']).optional(),
    fromDate: dateString.optional(),
    toDate: dateString.optional(),
    ...extra,
  });

export const totalsQuery = (types, extra = {}) =>
  itemListQuery(types, extra).omit({ page: true, pageSize: true, sortBy: true, sortDir: true });
