import { ok } from '../../utils/response.js';
import * as service from './settings.service.js';

export async function list(_req, res) {
  ok(res, await service.listSettings());
}

export async function update(req, res) {
  ok(res, await service.updateSetting(req.valid.params.key, req.valid.body.value, req.user, req));
}
