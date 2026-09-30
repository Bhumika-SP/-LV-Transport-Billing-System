import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { dateString, idParam, optionalId, optionalText } from '../../validation/common.js';
import { itemRoutes } from '../driver-items/driver-item.routes.js';
import {
  itemBase,
  itemListQuery,
  totalsQuery,
  voidSchema,
} from '../driver-items/driver-item.schemas.js';
import {
  CATEGORIES_BY_PAYER,
  driverExpensesService,
  lvExpensesService,
} from './expenses.service.js';

function expenseRouter({ paidBy, service, managePermission }) {
  const categories = CATEGORIES_BY_PAYER[paidBy];
  const router = Router();
  router.use(authenticate);
  itemRoutes(router, {
    service,
    view: requirePermission(PERMISSIONS.DRIVER_FINANCE_VIEW),
    manage: requirePermission(managePermission),
    listQuery: itemListQuery(categories, { vehicleId: optionalId }),
    totalsQuery: totalsQuery(categories, { vehicleId: optionalId }),
    createSchema: z.object({
      ...itemBase,
      vehicleId: z.coerce.number().int().positive(),
      category: z.enum(categories),
      expenseDate: dateString,
      description: z.string().trim().min(3, 'Describe the expense').max(500),
      receiptReference: optionalText(100),
    }),
    validate,
    idParam,
    voidSchema,
  });
  return router;
}

/** /api/lv-expenses */
export const lvExpensesRouter = expenseRouter({
  paidBy: 'LV',
  service: lvExpensesService,
  managePermission: PERMISSIONS.LV_EXPENSE_MANAGE,
});

/** /api/driver-expenses */
export const driverExpensesRouter = expenseRouter({
  paidBy: 'DRIVER',
  service: driverExpensesService,
  managePermission: PERMISSIONS.DRIVER_EXPENSE_MANAGE,
});
