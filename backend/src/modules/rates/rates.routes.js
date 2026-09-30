import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import * as controller from './rates.controller.js';
import {
  cancelRateSchema,
  createRateSchema,
  listRatesQuery,
  resolveRateQuery,
} from './rates.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.MASTER_VIEW);
const manage = requirePermission(PERMISSIONS.RATE_MANAGE);

router.use(authenticate);

// Rates are append-only: there is deliberately no PATCH/DELETE.
router.get('/', view, validate({ query: listRatesQuery }), controller.list);
router.get('/resolve', view, validate({ query: resolveRateQuery }), controller.resolve);
router.post('/', manage, validate({ body: createRateSchema }), controller.create);
router.post(
  '/:id/cancel',
  manage,
  validate({ params: idParam, body: cancelRateSchema }),
  controller.cancel,
);

export default router;
