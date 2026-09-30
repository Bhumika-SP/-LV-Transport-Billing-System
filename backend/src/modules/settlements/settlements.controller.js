import { created, ok, paged } from '../../utils/response.js';
import * as service from './settlements.service.js';

const id = (req) => req.valid.params.id;

export async function list(req, res) {
  paged(res, await service.listSettlements(req.valid.query));
}
export async function summary(req, res) {
  ok(res, await service.monthSummary(req.valid.query));
}
export async function get(req, res) {
  ok(res, await service.getSettlement(id(req)));
}
export async function create(req, res) {
  created(res, await service.createSettlement(req.valid.body, req.user, req));
}
export async function prepareMonth(req, res) {
  ok(res, await service.prepareMonth(req.valid.body, req.user, req));
}
export async function calculate(req, res) {
  ok(res, await service.calculateSettlement(id(req), req.user, req));
}
export async function submit(req, res) {
  ok(res, await service.submitSettlement(id(req), req.user, req));
}
export async function withdraw(req, res) {
  ok(res, await service.returnToDraft(id(req), req.valid.body, req.user, req, { reject: false }));
}
export async function approve(req, res) {
  ok(res, await service.approveSettlement(id(req), req.user, req));
}
export async function reject(req, res) {
  ok(res, await service.returnToDraft(id(req), req.valid.body, req.user, req, { reject: true }));
}
export async function finalize(req, res) {
  ok(res, await service.finalizeSettlement(id(req), req.user, req));
}
export async function reopen(req, res) {
  ok(res, await service.reopenSettlement(id(req), req.valid.body, req.user, req));
}
