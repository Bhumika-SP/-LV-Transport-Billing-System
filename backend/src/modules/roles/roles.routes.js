import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import * as controller from './roles.controller.js';

const router = Router();

// Roles and the permission matrix are read-only in V1; they are defined in code
// (src/config/permissions.js) and synced by the seed.
router.get('/', authenticate, requirePermission(PERMISSIONS.ROLE_VIEW), controller.list);

export default router;
