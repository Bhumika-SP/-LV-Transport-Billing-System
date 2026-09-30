import { z } from 'zod';
import {
  dateString,
  decimalString,
  monthString,
  optionalId,
  optionalText,
  paymentMethod,
} from '../../validation/common.js';

const positiveAmount = decimalString({ allowZero: false });
const reason = z.string().trim().min(3, 'A reason is required').max(500);

export const createCompanySettlementSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  settlementMonth: monthString,
  expectedAmount: positiveAmount,
  notes: optionalText(2000),
});

/** While PENDING: expected amount and notes. */
export const updatePendingSchema = z
  .object({ expectedAmount: positiveAmount, notes: optionalText(2000) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const receiveSchema = z.object({
  receivedAmount: positiveAmount,
  receivedDate: dateString,
  paymentMethod,
  referenceNumber: optionalText(100),
  notes: optionalText(2000),
});

/** Correcting a RECEIVED settlement (Admin): any receipt field, plus a mandatory reason. */
export const correctReceivedSchema = z
  .object({
    expectedAmount: positiveAmount.optional(),
    receivedAmount: positiveAmount.optional(),
    receivedDate: dateString.optional(),
    paymentMethod: paymentMethod.optional(),
    referenceNumber: optionalText(100),
    notes: optionalText(2000),
    reason,
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'reason'), 'Nothing to update');

export const reasonSchema = z.object({ reason });

export const listCompanySettlementsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(['settlementMonth', 'expectedAmount', 'receivedAmount', 'receivedDate', 'createdAt'])
    .default('settlementMonth'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  companyId: optionalId,
  status: z.enum(['PENDING', 'RECEIVED']).optional(),
  month: monthString.optional(),
  fromMonth: monthString.optional(),
  toMonth: monthString.optional(),
});

export const summaryQuery = listCompanySettlementsQuery.pick({
  companyId: true,
  month: true,
  fromMonth: true,
  toMonth: true,
});
