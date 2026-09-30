import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam, optionsQuery } from '../../validation/common.js';
import * as controller from './vehicles.controller.js';
import { createVehicleSchema, listVehiclesQuery, updateVehicleSchema } from './vehicles.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.MASTER_VIEW);
const manage = requirePermission(PERMISSIONS.VEHICLE_MANAGE);

router.use(authenticate);

router.get('/', view, validate({ query: listVehiclesQuery }), controller.list);
router.get('/options', view, validate({ query: optionsQuery }), controller.options);
router.post('/', manage, validate({ body: createVehicleSchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: updateVehicleSchema }),
  controller.update,
);
router.get('/:id/assignments', view, validate({ params: idParam }), controller.assignments);

export default router;
