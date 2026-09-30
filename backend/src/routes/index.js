import { Router } from 'express';
import { requireCsrfHeader } from '../middleware/csrf.js';
import assignmentsRoutes from '../modules/assignments/assignments.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import companiesRoutes from '../modules/companies/companies.routes.js';
import companySettlementsRoutes from '../modules/company-settlements/company-settlements.routes.js';
import advancesRoutes from '../modules/advances/advances.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import driversRoutes from '../modules/drivers/drivers.routes.js';
import { driverExpensesRouter, lvExpensesRouter } from '../modules/expenses/expenses.routes.js';
import { adjustmentsRouter, earningsRouter } from '../modules/earnings/earnings.routes.js';
import { importsRouter, templatesRouter } from '../modules/imports/imports.routes.js';
import paymentsRoutes from '../modules/payments/payments.routes.js';
import profitRoutes from '../modules/profit/profit.routes.js';
import ratesRoutes from '../modules/rates/rates.routes.js';
import reportsRoutes from '../modules/reports/reports.routes.js';
import rolesRoutes from '../modules/roles/roles.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import settlementsRoutes from '../modules/settlements/settlements.routes.js';
import tripsRoutes from '../modules/trips/trips.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import vehicleTypesRoutes from '../modules/vehicle-types/vehicle-types.routes.js';
import vehiclesRoutes from '../modules/vehicles/vehicles.routes.js';
import { ok } from '../utils/response.js';

/**
 * Root API router mounted at /api. Each feature module owns its router; every
 * protected route applies `authenticate` + `requirePermission` itself.
 */
const api = Router();

api.use(requireCsrfHeader);

api.get('/', (_req, res) => ok(res, { name: 'LV Transport Billing API', version: '0.1.0' }));

api.use('/auth', authRoutes);
api.use('/users', usersRoutes);
api.use('/roles', rolesRoutes);
api.use('/settings', settingsRoutes);

api.use('/companies', companiesRoutes);
api.use('/drivers', driversRoutes);
api.use('/vehicle-types', vehicleTypesRoutes);
api.use('/rates', ratesRoutes);
api.use('/vehicles', vehiclesRoutes);
api.use('/assignments', assignmentsRoutes);

api.use('/company-settlements', companySettlementsRoutes);
api.use('/trips', tripsRoutes);
api.use('/import-templates', templatesRouter);
api.use('/trip-imports', importsRouter);

api.use('/earnings', earningsRouter);
api.use('/adjustments', adjustmentsRouter);
api.use('/lv-expenses', lvExpensesRouter);
api.use('/driver-expenses', driverExpensesRouter);
api.use('/advances', advancesRoutes);
api.use('/settlements', settlementsRoutes);
api.use('/payments', paymentsRoutes);
api.use('/profit', profitRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/reports', reportsRoutes);

export default api;
