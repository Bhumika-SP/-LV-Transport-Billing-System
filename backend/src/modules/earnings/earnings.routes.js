import { Router } from 'express';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParam } from '../../validation/common.js';
import { itemRoutes } from '../driver-items/driver-item.routes.js';
import { voidSchema } from '../driver-items/driver-item.schemas.js';
import * as controller from './earnings.controller.js';
import {
  adjustmentTotalsQuery,
  createAdjustmentSchema,
  createEarningSchema,
  earningTotalsQuery,
  grossQuery,
  listAdjustmentsQuery,
  listEarningsQuery,
} from './earnings.schemas.js';
import { adjustmentsService, earningsService } from './earnings.service.js';

const view = requirePermission(PERMISSIONS.DRIVER_FINANCE_VIEW);

/** /api/earnings — allowances, other earnings, and the gross-earnings breakdown. */
export const earningsRouter = Router();
earningsRouter.use(authenticate);
earningsRouter.get('/gross', view, validate({ query: grossQuery }), controller.gross);
itemRoutes(earningsRouter, {
  service: earningsService,
  view,
  manage: requirePermission(PERMISSIONS.EARNING_MANAGE),
  listQuery: listEarningsQuery,
  totalsQuery: earningTotalsQuery,
  createSchema: createEarningSchema,
  validate,
  idParam,
  voidSchema,
});

/** /api/adjustments — positive adjustments and other deductions. */
export const adjustmentsRouter = Router();
adjustmentsRouter.use(authenticate);
itemRoutes(adjustmentsRouter, {
  service: adjustmentsService,
  view,
  manage: requirePermission(PERMISSIONS.ADJUSTMENT_MANAGE),
  listQuery: listAdjustmentsQuery,
  totalsQuery: adjustmentTotalsQuery,
  createSchema: createAdjustmentSchema,
  validate,
  idParam,
  voidSchema,
});
