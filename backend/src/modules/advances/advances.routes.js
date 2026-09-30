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
import * as controller from './advances.controller.js';

const createSchema = z.object({
  driverId: z.coerce.number().int().positive(),
  amount: positiveAmount,
  advanceDate: dateString,
  reason: reasonText,
  paymentMethod,
  referenceNumber: optionalText(100),
});
const recoverySchema = z.object({
  amount: positiveAmount,
  settlementMonth: monthString,
  recoveryDate: dateString.optional(),
  notes: optionalText(500),
});
const reasonSchema = z.object({ reason: reasonText });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  driverId: optionalId,
  status: z.enum(['OPEN', 'RECOVERED', 'VOID']).optional(),
});

const router = Router();
const view = requirePermission(PERMISSIONS.DRIVER_FINANCE_VIEW);
const manage = requirePermission(PERMISSIONS.ADVANCE_MANAGE);

router.use(authenticate);
router.get('/', view, validate({ query: listQuery }), controller.list);
router.get(
  '/summary',
  view,
  validate({ query: z.object({ driverId: optionalId }) }),
  controller.summary,
);
router.get(
  '/recoveries',
  view,
  validate({ query: z.object({ driverId: optionalId, month: monthString.optional() }) }),
  controller.recoveries,
);
router.post('/', manage, validate({ body: createSchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);
router.post(
  '/:id/void',
  manage,
  validate({ params: idParam, body: reasonSchema }),
  controller.voidAdvance,
);
router.post(
  '/:id/recoveries',
  manage,
  validate({ params: idParam, body: recoverySchema }),
  controller.recordRecovery,
);
router.post(
  '/recoveries/:id/void',
  manage,
  validate({ params: idParam, body: reasonSchema }),
  controller.voidRecovery,
);

export default router;
