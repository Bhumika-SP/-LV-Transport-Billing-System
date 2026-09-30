import { created, ok, paged } from '../../utils/response.js';
import * as service from './advances.service.js';

export async function list(req, res) {
  paged(res, await service.listAdvances(req.valid.query));
}
export async function summary(req, res) {
  ok(res, await service.outstandingSummary(req.valid.query));
}
export async function recoveries(req, res) {
  ok(res, await service.listRecoveries(req.valid.query));
}
export async function get(req, res) {
  ok(res, await service.getAdvance(req.valid.params.id));
}
export async function create(req, res) {
  created(res, await service.createAdvance(req.valid.body, req.user, req));
}
export async function voidAdvance(req, res) {
  ok(res, await service.voidAdvance(req.valid.params.id, req.valid.body, req.user, req));
}
export async function recordRecovery(req, res) {
  ok(res, await service.recordRecovery(req.valid.params.id, req.valid.body, req.user, req));
}
export async function voidRecovery(req, res) {
  ok(res, await service.voidRecovery(req.valid.params.id, req.valid.body, req.user, req));
}
