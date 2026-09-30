import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  dateString,
  decimalString,
  idParam,
  monthString,
  optionalDate,
  optionalId,
  optionalText,
  reasonText,
  requiredText,
} from '../../validation/common.js';
import { optionalGstin } from '../../validation/fields.js';
import * as c from './gst.controller.js';

const rate = decimalString({ max: '100' });
const hsnSac = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'HSN/SAC must be 4–8 digits');
const stateCode = z
  .string()
  .trim()
  .regex(/^\d{2}$/, 'Use the 2-digit state code');

const taxRateSchema = z.object({
  hsnSac,
  description: requiredText(255),
  gstRate: rate,
  cessRate: rate.default('0'),
  effectiveFrom: dateString,
  effectiveTo: optionalDate,
});
const recordBase = {
  direction: z.enum(['OUTWARD', 'INWARD']),
  companyId: optionalId,
  counterpartyName: requiredText(150),
  counterpartyGstin: optionalGstin,
  invoiceNumber: requiredText(50),
  invoiceDate: dateString,
  taxPeriod: monthString.optional(),
  hsnSac,
  description: optionalText(255),
  taxableValue: decimalString({ allowZero: false }),
  taxRate: rate,
  cessRate: rate.default('0'),
  supplyType: z.enum(['INTRA_STATE', 'INTER_STATE']),
  placeOfSupply: stateCode,
  reverseCharge: z.boolean().default(false),
  taxRateConfigId: optionalId,
  notes: optionalText(2000),
};
const filters = {
  direction: z.enum(['OUTWARD', 'INWARD']).optional(),
  companyId: optionalId,
  status: z.enum(['ACTIVE', 'VOID']).optional(),
  hsnSac: z.string().trim().max(10).optional(),
  taxPeriod: monthString.optional(),
  fromPeriod: monthString.optional(),
  toPeriod: monthString.optional(),
  search: z.string().trim().max(100).optional(),
};
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  ...filters,
});
const summaryQuery = z.object(filters);

const view = requirePermission(PERMISSIONS.GST_VIEW);
const manage = requirePermission(PERMISSIONS.GST_MANAGE);
const taxConfig = requirePermission(PERMISSIONS.TAX_CONFIG_MANAGE);

const router = Router();
router.use(authenticate);

router.get(
  '/tax-rates',
  view,
  validate({
    query: z.object({
      includeInactive: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    }),
  }),
  c.listTaxRates,
);
router.post('/tax-rates', taxConfig, validate({ body: taxRateSchema }), c.createTaxRate);
router.patch(
  '/tax-rates/:id',
  taxConfig,
  validate({
    params: idParam,
    body: taxRateSchema.extend({ status: z.enum(['ACTIVE', 'INACTIVE']) }).partial(),
  }),
  c.updateTaxRate,
);

router.get('/records', view, validate({ query: listQuery }), c.listRecords);
router.post('/records/preview', manage, validate({ body: z.object(recordBase) }), c.preview);
router.post('/records', manage, validate({ body: z.object(recordBase) }), c.createRecord);
router.get('/records/:id', view, validate({ params: idParam }), c.getRecord);
router.post(
  '/records/:id/void',
  manage,
  validate({ params: idParam, body: z.object({ reason: reasonText }) }),
  c.voidRecord,
);

router.get('/summary', view, validate({ query: summaryQuery }), c.summary);
router.get('/hsn-summary', view, validate({ query: summaryQuery }), c.hsnSummary);
router.get('/gstr1', view, validate({ query: summaryQuery }), c.gstr1);
router.get('/gstr3b', view, validate({ query: summaryQuery }), c.gstr3b);
router.get('/reconciliation', view, validate({ query: summaryQuery }), c.reconciliation);

export default router;
