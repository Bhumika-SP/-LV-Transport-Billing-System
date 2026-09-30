import { created, ok, paged } from '../../utils/response.js';
import * as service from './company-settlements.service.js';

export async function list(req, res) {
  paged(res, await service.listCompanySettlements(req.valid.query));
}

export async function summary(req, res) {
  ok(res, await service.summarizeCompanySettlements(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getCompanySettlement(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createCompanySettlement(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updatePending(req.valid.params.id, req.valid.body, req.user, req));
}

export async function receive(req, res) {
  ok(res, await service.markReceived(req.valid.params.id, req.valid.body, req.user, req));
}

export async function correct(req, res) {
  ok(res, await service.correctReceived(req.valid.params.id, req.valid.body, req.user, req));
}

export async function revert(req, res) {
  ok(res, await service.revertToPending(req.valid.params.id, req.valid.body, req.user, req));
}

export async function remove(req, res) {
  await service.deletePending(req.valid.params.id, req.valid.body, req.user, req);
  ok(res, null);
}
