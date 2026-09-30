import { z } from 'zod';
import { optionalId, requiredText } from '../../validation/common.js';
import {
  DATE_FORMATS,
  DRIVER_MATCH_FIELDS,
  DUPLICATE_KEY_FIELDS,
  TARGET_FIELDS,
} from './import-fields.js';

const id = z.coerce.number().int().positive();

const mappings = z
  .object(
    Object.fromEntries(
      Object.keys(TARGET_FIELDS).map((f) => [
        f,
        z
          .string()
          .trim()
          .max(150)
          .optional()
          .nullable()
          .transform((v) => v || undefined),
      ]),
    ),
  )
  .strict();

const templateFields = {
  name: requiredText(100),
  dateFormat: z.enum(DATE_FORMATS),
  kmMode: z.enum(['START_END', 'DIRECT']),
  driverMatchField: z.enum(DRIVER_MATCH_FIELDS).default('CODE'),
  duplicateKey: z
    .array(z.enum(DUPLICATE_KEY_FIELDS))
    .min(1, 'Choose at least one duplicate-key field')
    .refine((a) => new Set(a).size === a.length, 'Fields must be unique'),
  keepUnmapped: z.boolean().default(true),
  mappings,
};

export const createTemplateSchema = z.object({ companyId: id, ...templateFields });

export const updateTemplateSchema = z
  .object({ ...templateFields, status: z.enum(['ACTIVE', 'INACTIVE']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listTemplatesQuery = z.object({
  companyId: optionalId,
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Multipart fields that accompany the uploaded file. */
export const createImportFields = z.object({ companyId: id, templateId: id });

export const confirmImportSchema = z.object({ includeWarnings: z.boolean().default(true) });

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
};

export const listImportsQuery = z.object({
  ...page,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  companyId: optionalId,
  status: z.enum(['VALIDATED', 'IMPORTED', 'DISCARDED', 'FAILED']).optional(),
});

export const listRowsQuery = z.object({
  ...page,
  status: z.enum(['VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'IMPORTED']).optional(),
});

export const errorReportQuery = z.object({
  includeWarnings: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
