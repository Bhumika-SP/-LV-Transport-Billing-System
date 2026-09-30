import { z } from 'zod';
import {
  listQuery,
  optionalDate,
  optionalText,
  optionalId,
  statusEnum,
} from '../../validation/common.js';
import { optionalField, registrationNumber } from '../../validation/fields.js';

export const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER'];

const currentYear = new Date().getFullYear();

const fields = {
  registrationNumber,
  vehicleTypeId: z.coerce.number().int().positive(),
  make: optionalText(50),
  model: optionalText(50),
  year: optionalField(
    z.coerce
      .number()
      .int()
      .min(1980)
      .max(currentYear + 1),
  ),
  fuelType: optionalField(z.enum(FUEL_TYPES)),
  insuranceProvider: optionalText(100),
  insurancePolicyNumber: optionalText(50),
  insuranceExpiryDate: optionalDate,
  fitnessCertificateNumber: optionalText(50),
  fitnessExpiryDate: optionalDate,
  permitNumber: optionalText(50),
  permitExpiryDate: optionalDate,
  notes: optionalText(2000),
};

export const createVehicleSchema = z.object({ ...fields, status: statusEnum.default('ACTIVE') });

export const updateVehicleSchema = z
  .object({ ...fields, status: statusEnum })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listVehiclesQuery = listQuery(
  ['registrationNumber', 'make', 'year', 'createdAt', 'status'],
  'registrationNumber',
).extend({
  status: statusEnum.optional(),
  vehicleTypeId: optionalId,
  companyId: optionalId,
});
