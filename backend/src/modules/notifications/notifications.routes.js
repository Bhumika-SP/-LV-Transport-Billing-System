import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import * as c from './notifications.controller.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const router = Router();
router.use(authenticate);
router.get('/', validate({ query: listQuery }), c.list);
router.get('/unread-count', c.unreadCount);
router.post('/read-all', c.readAll);
router.post('/run-checks', requirePermission(PERMISSIONS.SETTINGS_MANAGE), c.runChecks);
router.post('/:id/read', validate({ params: idParam }), c.read);

export default router;
