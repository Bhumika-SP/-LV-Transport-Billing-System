import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  idParam,
  listQuery,
  optionalText,
  optionsQuery,
  requiredText,
  statusEnum,
} from '../../validation/common.js';
import * as controller from './vehicle-types.controller.js';

const fields = { name: requiredText(50), description: optionalText(255) };
const createSchema = z.object({ ...fields, status: statusEnum.default('ACTIVE') });
const updateSchema = z
  .object({ ...fields, status: statusEnum })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const listSchema = listQuery(['name', 'createdAt', 'status'], 'name').extend({
  status: statusEnum.optional(),
});

const router = Router();
const view = requirePermission(PERMISSIONS.MASTER_VIEW);
const manage = requirePermission(PERMISSIONS.VEHICLE_MANAGE);

router.use(authenticate);

router.get('/', view, validate({ query: listSchema }), controller.list);
router.get('/options', view, validate({ query: optionsQuery }), controller.options);
router.post('/', manage, validate({ body: createSchema }), controller.create);
router.get('/:id', view, validate({ params: idParam }), controller.get);
router.patch('/:id', manage, validate({ params: idParam, body: updateSchema }), controller.update);

export default router;
