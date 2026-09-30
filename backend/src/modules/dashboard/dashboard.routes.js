import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { ok } from '../../utils/response.js';
import { getDashboard } from './dashboard.service.js';

/** GET /api/dashboard — sections filtered by the caller's permissions (see service). */
const router = Router();
router.get('/', authenticate, async (req, res) => ok(res, await getDashboard(req.user)));

export default router;
