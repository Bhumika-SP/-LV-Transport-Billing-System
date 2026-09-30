import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import * as controller from './trips.controller.js';
import {
  bulkRecalculateSchema,
  createTripSchema,
  listTripsQuery,
  previewTripSchema,
  reasonSchema,
  summaryTripsQuery,
  updateTripSchema,
} from './trips.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.TRIP_VIEW);
const manage = requirePermission(PERMISSIONS.TRIP_MANAGE);
const recalc = requirePermission(PERMISSIONS.TRIP_RECALCULATE);

router.use(authenticate);

router.get('/', view, validate({ query: listTripsQuery }), controller.list);
router.get('/summary', view, validate({ query: summaryTripsQuery }), controller.summary);
router.post('/preview', manage, validate({ body: previewTripSchema }), controller.preview);
router.post(
  '/recalculate',
  recalc,
  validate({ body: bulkRecalculateSchema }),
  controller.bulkRecalculate,
);
router.post('/', manage, validate({ body: createTripSchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: updateTripSchema }),
  controller.update,
);
router.post(
  '/:id/cancel',
  manage,
  validate({ params: idParam, body: reasonSchema }),
  controller.cancel,
);
router.post(
  '/:id/recalculate',
  recalc,
  validate({ params: idParam, body: reasonSchema }),
  controller.recalculate,
);

export default router;
