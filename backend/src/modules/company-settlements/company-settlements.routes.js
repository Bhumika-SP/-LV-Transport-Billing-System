import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import * as controller from './company-settlements.controller.js';
import {
  correctReceivedSchema,
  createCompanySettlementSchema,
  listCompanySettlementsQuery,
  reasonSchema,
  receiveSchema,
  summaryQuery,
  updatePendingSchema,
} from './company-settlements.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.COMPANY_SETTLEMENT_VIEW);
const manage = requirePermission(PERMISSIONS.COMPANY_SETTLEMENT_MANAGE);
const correct = requirePermission(PERMISSIONS.COMPANY_SETTLEMENT_CORRECT);

router.use(authenticate);

router.get('/', view, validate({ query: listCompanySettlementsQuery }), controller.list);
router.get('/summary', view, validate({ query: summaryQuery }), controller.summary);
router.post('/', manage, validate({ body: createCompanySettlementSchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);

// PENDING only
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: updatePendingSchema }),
  controller.update,
);
router.post(
  '/:id/receive',
  manage,
  validate({ params: idParam, body: receiveSchema }),
  controller.receive,
);

// Admin corrections (mandatory reason, audited)
router.post(
  '/:id/correct',
  correct,
  validate({ params: idParam, body: correctReceivedSchema }),
  controller.correct,
);
router.post(
  '/:id/revert',
  correct,
  validate({ params: idParam, body: reasonSchema }),
  controller.revert,
);
router.delete(
  '/:id',
  correct,
  validate({ params: idParam, body: reasonSchema }),
  controller.remove,
);

export default router;
