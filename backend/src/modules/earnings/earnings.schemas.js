import { z } from 'zod';
import { dateString, monthString, optionalId, reasonText } from '../../validation/common.js';
import { itemBase, itemListQuery, totalsQuery } from '../driver-items/driver-item.schemas.js';

export const EARNING_TYPES = ['ALLOWANCE', 'OTHER_EARNING'];
export const ADJUSTMENT_TYPES = ['POSITIVE_ADJUSTMENT', 'OTHER_DEDUCTION'];

export const createEarningSchema = z.object({
  ...itemBase,
  type: z.enum(EARNING_TYPES),
  earningDate: dateString,
  description: z.string().trim().min(3, 'Describe what this earning is for').max(500),
});

export const createAdjustmentSchema = z.object({
  ...itemBase,
  type: z.enum(ADJUSTMENT_TYPES),
  adjustmentDate: dateString,
  // Spec §26: no unexplained financial adjustments.
  reason: reasonText,
});

export const listEarningsQuery = itemListQuery(EARNING_TYPES);
export const earningTotalsQuery = totalsQuery(EARNING_TYPES);
export const listAdjustmentsQuery = itemListQuery(ADJUSTMENT_TYPES);
export const adjustmentTotalsQuery = totalsQuery(ADJUSTMENT_TYPES);

export const grossQuery = z.object({
  month: monthString.optional(),
  fromMonth: monthString.optional(),
  toMonth: monthString.optional(),
  driverId: optionalId,
});
