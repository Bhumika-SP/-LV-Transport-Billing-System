import { Router } from 'express';
import { ok } from '../utils/response.js';

/**
 * Root API router mounted at /api.
 * Feature modules (src/modules/<name>) register their routers here as each phase lands:
 *   /api/auth, /api/users, /api/companies, /api/drivers, /api/vehicles, ...
 */
const api = Router();

api.get('/', (_req, res) => ok(res, { name: 'LV Transport Billing API', version: '0.1.0' }));

export default api;
