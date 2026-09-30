import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  dateString,
  idParam,
  monthString,
  optionalId,
  optionalText,
  paymentMethod,
  reasonText,
} from '../../validation/common.js';
import { positiveAmount } from '../driver-items/driver-item.schemas.js';
import * as controller from './payments.controller.js';

const filters = {
  driverId: optionalId,
  settlementId: optionalId,
  month: monthString.optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']).optional(),
  status: z.enum(['VALID', 'REVERSED']).optional(),
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
};
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  ...filters,
});
const recordSchema = z.object({
  settlementId: z.coerce.number().int().positive(),
  amount: positiveAmount,
  paymentDate: dateString,
  paymentMethod,
  referenceNumber: optionalText(100),
  notes: optionalText(500),
  proofReference: optionalText(255),
});

const router = Router();
router.use(authenticate);

const view = requirePermission(PERMISSIONS.PAYMENT_VIEW);
router.get('/', view, validate({ query: listQuery }), controller.list);
router.get('/summary', view, validate({ query: z.object(filters) }), controller.summary);
router.post(
  '/',
  requirePermission(PERMISSIONS.PAYMENT_RECORD),
  validate({ body: recordSchema }),
  controller.record,
);
router.post(
  '/:id/reverse',
  requirePermission(PERMISSIONS.PAYMENT_REVERSE),
  validate({ params: idParam, body: z.object({ reason: reasonText }) }),
  controller.reverse,
);

export default router;
