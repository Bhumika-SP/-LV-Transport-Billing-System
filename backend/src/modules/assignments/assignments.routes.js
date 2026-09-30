import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import { controllerFor } from './assignments.controller.js';
import {
  createDriverAssignmentSchema,
  createVehicleAssignmentSchema,
  listDriverAssignmentsQuery,
  listVehicleAssignmentsQuery,
  updateAssignmentSchema,
} from './assignments.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.MASTER_VIEW);
const manage = requirePermission(PERMISSIONS.ASSIGNMENT_MANAGE);

router.use(authenticate);

const kinds = [
  ['vehicles', 'vehicle', createVehicleAssignmentSchema, listVehicleAssignmentsQuery],
  ['drivers', 'driver', createDriverAssignmentSchema, listDriverAssignmentsQuery],
];

// /api/assignments/vehicles  (vehicle → company)
// /api/assignments/drivers   (driver → vehicle)
for (const [path, kind, createSchema, listSchema] of kinds) {
  const c = controllerFor(kind);
  router.get(`/${path}`, view, validate({ query: listSchema }), c.list);
  router.post(`/${path}`, manage, validate({ body: createSchema }), c.create);
  router.patch(
    `/${path}/:id`,
    manage,
    validate({ params: idParam, body: updateAssignmentSchema }),
    c.update,
  );
}

export default router;
