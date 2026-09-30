import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { dateString, idParam, optionalId } from '../../validation/common.js';
import { AUDIT_ACTIONS } from './audit.service.js';
import * as c from './audit.controller.js';

const ACTIONS = Object.values(AUDIT_ACTIONS);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  userId: optionalId,
  // One action or a comma-separated list, e.g. "APPROVE,FINALIZE".
  action: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.split(',').map((a) => a.trim()) : undefined))
    .refine((list) => !list || list.every((a) => ACTIONS.includes(a)), 'Unknown audit action'),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(64).optional(),
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
  search: z.string().trim().max(100).optional(),
});

const router = Router();
router.use(authenticate, requirePermission(PERMISSIONS.AUDIT_VIEW));
router.get('/', validate({ query: listQuery }), c.list);
router.get('/meta', c.meta);
router.get(
  '/history/:entityType/:entityId',
  validate({
    params: z.object({
      entityType: z.string().trim().min(1).max(50),
      entityId: z.string().trim().min(1).max(64),
    }),
  }),
  c.history,
);
router.get('/:id', validate({ params: idParam }), c.get);

export default router;
