import { z } from 'zod';
import { dateString, decimalString, optionalDate, optionalText } from '../../validation/common.js';

export const createRateSchema = z
  .object({
    vehicleTypeId: z.coerce.number().int().positive(),
    ratePerKm: decimalString({ max: '99999999.99', allowZero: false }),
    effectiveFrom: dateString,
    effectiveTo: optionalDate,
    notes: optionalText(255),
  })
  .refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    message: 'Effective to must be on or after effective from',
    path: ['effectiveTo'],
  });

export const cancelRateSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(255),
});

export const listRatesQuery = z.object({
  vehicleTypeId: z.coerce.number().int().positive(),
});

export const resolveRateQuery = z.object({
  vehicleTypeId: z.coerce.number().int().positive(),
  date: dateString,
});
