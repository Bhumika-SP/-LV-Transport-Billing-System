import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam, monthString, optionalId, reasonText } from '../../validation/common.js';
import * as c from './settlements.controller.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['settlementMonth', 'finalAmount', 'updatedAt']).default('settlementMonth'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  month: monthString.optional(),
  driverId: optionalId,
  status: z.enum(['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
});
const createSchema = z.object({
  driverId: z.coerce.number().int().positive(),
  settlementMonth: monthString,
});
const reasonSchema = z.object({ reason: reasonText });
const optionalReason = z.object({ reason: reasonText.optional() });

const view = requirePermission(PERMISSIONS.SETTLEMENT_VIEW);
const prepare = requirePermission(PERMISSIONS.SETTLEMENT_PREPARE);
const approve = requirePermission(PERMISSIONS.SETTLEMENT_APPROVE);
const finalize = requirePermission(PERMISSIONS.SETTLEMENT_FINALIZE);
const reopen = requirePermission(PERMISSIONS.SETTLEMENT_REOPEN);
const byId = validate({ params: idParam });

const router = Router();
router.use(authenticate);

router.get('/', view, validate({ query: listQuery }), c.list);
router.get(
  '/summary',
  view,
  validate({ query: z.object({ month: monthString.optional() }) }),
  c.summary,
);
router.post('/', prepare, validate({ body: createSchema }), c.create);
router.post(
  '/prepare',
  prepare,
  validate({ body: z.object({ settlementMonth: monthString }) }),
  c.prepareMonth,
);
router.get('/:id', view, byId, c.get);

// Workflow — each step checks both the permission and the current status (server-side).
router.post('/:id/calculate', prepare, byId, c.calculate);
router.post('/:id/submit', prepare, byId, c.submit);
router.post(
  '/:id/withdraw',
  prepare,
  validate({ params: idParam, body: optionalReason }),
  c.withdraw,
);
router.post('/:id/approve', approve, byId, c.approve);
router.post('/:id/reject', approve, validate({ params: idParam, body: reasonSchema }), c.reject);
router.post('/:id/finalize', finalize, byId, c.finalize);
router.post('/:id/reopen', reopen, validate({ params: idParam, body: reasonSchema }), c.reopen);

export default router;
