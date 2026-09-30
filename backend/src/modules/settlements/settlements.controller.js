import { created, ok, paged } from '../../utils/response.js';
import { settlementEvent } from '../notifications/events.js';
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
  const s = await service.submitSettlement(id(req), req.user, req);
  await settlementEvent('SUBMITTED', s, req.user);
  ok(res, s);
}
export async function withdraw(req, res) {
  ok(res, await service.returnToDraft(id(req), req.valid.body, req.user, req, { reject: false }));
}
export async function approve(req, res) {
  const s = await service.approveSettlement(id(req), req.user, req);
  await settlementEvent('APPROVED', s, req.user);
  ok(res, s);
}
export async function reject(req, res) {
  const s = await service.returnToDraft(id(req), req.valid.body, req.user, req, { reject: true });
  await settlementEvent('REJECTED', s, req.user, req.valid.body.reason);
  ok(res, s);
}
export async function finalize(req, res) {
  const s = await service.finalizeSettlement(id(req), req.user, req);
  await settlementEvent('FINALIZED', s, req.user);
  ok(res, s);
}
export async function reopen(req, res) {
  const s = await service.reopenSettlement(id(req), req.valid.body, req.user, req);
  await settlementEvent('REOPENED', s, req.user, req.valid.body.reason);
  ok(res, s);
}
