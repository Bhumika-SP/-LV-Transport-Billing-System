import { z } from 'zod';
import { dateString, optionalDate, optionalId, optionalText } from '../../validation/common.js';

const id = z.coerce.number().int().positive();

export const createVehicleAssignmentSchema = z.object({
  vehicleId: id,
  companyId: id,
  startDate: dateString,
  endDate: optionalDate,
  notes: optionalText(255),
});

export const createDriverAssignmentSchema = z.object({
  driverId: id,
  vehicleId: id,
  startDate: dateString,
  endDate: optionalDate,
  notes: optionalText(255),
});

export const updateAssignmentSchema = z
  .object({ startDate: dateString, endDate: optionalDate, notes: optionalText(255) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const listBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['startDate', 'endDate', 'createdAt']).default('startDate'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  current: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
};

export const listVehicleAssignmentsQuery = z.object({
  ...listBase,
  vehicleId: optionalId,
  companyId: optionalId,
});

export const listDriverAssignmentsQuery = z.object({
  ...listBase,
  driverId: optionalId,
  vehicleId: optionalId,
});
