import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { monthString, optionalId } from '../../validation/common.js';
import * as controller from './profit.controller.js';

const query = z.object({
  month: monthString.optional(),
  fromMonth: monthString.optional(),
  toMonth: monthString.optional(),
  companyId: optionalId,
});

const router = Router();
router.use(authenticate, requirePermission(PERMISSIONS.PROFIT_VIEW));
router.get('/monthly', validate({ query }), controller.monthly);
router.get('/companies', validate({ query }), controller.companies);
router.get('/overall', controller.overall);

export default router;
