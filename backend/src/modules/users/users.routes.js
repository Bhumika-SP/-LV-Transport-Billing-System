import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import * as controller from './users.controller.js';
import {
  createUserSchema,
  listUsersQuery,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schemas.js';

const router = Router();

router.use(authenticate, requirePermission(PERMISSIONS.USER_MANAGE));

router.get('/', validate({ query: listUsersQuery }), controller.list);
router.post('/', validate({ body: createUserSchema }), controller.create);
router.get('/:id', validate({ params: idParam }), controller.get);
router.patch('/:id', validate({ params: idParam, body: updateUserSchema }), controller.update);
router.post(
  '/:id/reset-password',
  validate({ params: idParam, body: resetPasswordSchema }),
  controller.resetPassword,
);

export default router;
