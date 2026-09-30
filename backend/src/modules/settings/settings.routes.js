import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './settings.controller.js';

const router = Router();

router.use(authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE));

router.get('/', controller.list);
router.patch(
  '/:key',
  validate({
    params: z.object({ key: z.string().max(100) }),
    body: z.object({ value: z.union([z.boolean(), z.string(), z.number()]) }),
  }),
  controller.update,
);

export default router;
