import { Router } from 'express';
import { requireCsrfHeader } from '../middleware/csrf.js';
import authRoutes from '../modules/auth/auth.routes.js';
import rolesRoutes from '../modules/roles/roles.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
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

export default api;
