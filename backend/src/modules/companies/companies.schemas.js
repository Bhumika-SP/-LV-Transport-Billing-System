import { z } from 'zod';
import { listQuery, optionalText, requiredText, statusEnum } from '../../validation/common.js';
import {
  optionalCode,
  optionalEmail,
  optionalGstin,
  optionalPhone,
} from '../../validation/fields.js';

const fields = {
  name: requiredText(150),
  code: optionalCode,
  contactPerson: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(1000),
  gstin: optionalGstin,
  notes: optionalText(2000),
};

export const createCompanySchema = z.object({ ...fields, status: statusEnum.default('ACTIVE') });

export const updateCompanySchema = z
  .object({ ...fields, status: statusEnum })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listCompaniesQuery = listQuery(['name', 'code', 'createdAt', 'status'], 'name').extend(
  {
    status: statusEnum.optional(),
  },
);
