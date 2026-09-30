import { created, ok, paged } from '../../utils/response.js';
import * as service from './users.service.js';

export async function list(req, res) {
  paged(res, await service.listUsers(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getUser(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createUser(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateUser(req.valid.params.id, req.valid.body, req.user, req));
}

export async function resetPassword(req, res) {
  await service.resetPassword(req.valid.params.id, req.valid.body, req.user, req);
  ok(res, null);
}
