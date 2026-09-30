import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam, optionsQuery } from '../../validation/common.js';
import * as controller from './companies.controller.js';
import {
  createCompanySchema,
  listCompaniesQuery,
  updateCompanySchema,
} from './companies.schemas.js';

const router = Router();
const view = requirePermission(PERMISSIONS.MASTER_VIEW);
const manage = requirePermission(PERMISSIONS.COMPANY_MANAGE);

router.use(authenticate);

router.get('/', view, validate({ query: listCompaniesQuery }), controller.list);
router.get('/options', view, validate({ query: optionsQuery }), controller.options);
router.post('/', manage, validate({ body: createCompanySchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);
router.patch(
  '/:id',
  manage,
  validate({ params: idParam, body: updateCompanySchema }),
  controller.update,
);
router.get('/:id/vehicles', view, validate({ params: idParam }), controller.vehicles);
router.get('/:id/drivers', view, validate({ params: idParam }), controller.drivers);

export default router;
