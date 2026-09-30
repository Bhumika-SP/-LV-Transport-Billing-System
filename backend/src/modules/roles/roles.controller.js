import { ok } from '../../utils/response.js';
import { listRolesWithPermissions } from './roles.service.js';

export async function list(_req, res) {
  ok(res, await listRolesWithPermissions());
}
