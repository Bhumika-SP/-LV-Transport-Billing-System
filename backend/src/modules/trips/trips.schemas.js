import { z } from 'zod';
import {
  dateString,
  monthString,
  optionalId,
  optionalText,
  reasonText,
} from '../../validation/common.js';

/** KM values are passed through as strings; trip-calculations.resolveKm validates them. */
const kmValue = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) =>
    v === undefined ? undefined : v === null || v === '' ? null : String(v).trim(),
  );

const id = z.coerce.number().int().positive();

const tripFields = {
  companyId: id,
  driverId: id,
  vehicleId: id,
  tripDate: dateString,
  externalTripId: optionalText(100),
  tripReference: optionalText(100),
  pickup: optionalText(255),
  dropLocation: optionalText(255),
  kmSource: z.enum(['START_END', 'DIRECT'], { error: 'Choose how KM was obtained' }),
  startKm: kmValue,
  endKm: kmValue,
  totalKm: kmValue,
  notes: optionalText(2000),
};

export const createTripSchema = z.object(tripFields);

export const previewTripSchema = createTripSchema;

export const updateTripSchema = z
  .object(tripFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const reasonSchema = z.object({ reason: reasonText });

export const bulkRecalculateSchema = z
  .object({
    vehicleTypeId: id,
    fromDate: dateString,
    toDate: dateString,
    companyId: optionalId,
    reason: reasonText,
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: 'To date must be on or after from date',
    path: ['toDate'],
  });

const filters = {
  search: z.string().trim().max(100).optional(),
  companyId: optionalId,
  driverId: optionalId,
  vehicleId: optionalId,
  vehicleTypeId: optionalId,
  status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
  source: z.enum(['MANUAL', 'IMPORT']).optional(),
  month: monthString.optional(),
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
};

export const listTripsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['tripDate', 'totalKm', 'earnings', 'createdAt']).default('tripDate'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  ...filters,
});

export const summaryTripsQuery = z.object(filters);
