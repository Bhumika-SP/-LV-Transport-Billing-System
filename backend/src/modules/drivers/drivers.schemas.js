import { z } from 'zod';
import {
  listQuery,
  optionalDate,
  optionalText,
  requiredText,
  statusEnum,
} from '../../validation/common.js';
import {
  optionalBankAccount,
  optionalCode,
  optionalField,
  optionalIfsc,
  optionalPhone,
  optionalUpi,
  phone,
} from '../../validation/fields.js';

const fields = {
  fullName: requiredText(100),
  driverCode: optionalCode,
  phone,
  alternatePhone: optionalPhone,
  address: optionalText(1000),
  joiningDate: optionalDate,
  licenseNumber: optionalField(
    z
      .string()
      .toUpperCase()
      .regex(/^[A-Z0-9 -]{6,30}$/, 'Enter a valid licence number'),
  ),
  licenseExpiryDate: optionalDate,
  bankAccountName: optionalText(100),
  bankAccountNumber: optionalBankAccount,
  bankIfsc: optionalIfsc,
  bankName: optionalText(100),
  upiId: optionalUpi,
  notes: optionalText(2000),
};

export const createDriverSchema = z.object({ ...fields, status: statusEnum.default('ACTIVE') });

export const updateDriverSchema = z
  .object({ ...fields, status: statusEnum })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listDriversQuery = listQuery(
  ['fullName', 'driverCode', 'joiningDate', 'licenseExpiryDate', 'createdAt', 'status'],
  'fullName',
).extend({
  status: statusEnum.optional(),
  licenceStatus: z.enum(['valid', 'expiring', 'expired', 'none']).optional(),
  assigned: z.enum(['yes', 'no']).optional(),
  joinedFrom: optionalDate,
  joinedTo: optionalDate,
});
