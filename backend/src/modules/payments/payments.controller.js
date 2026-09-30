import { created, ok, paged } from '../../utils/response.js';
import * as service from './payments.service.js';

export async function list(req, res) {
  paged(res, await service.listPayments(req.valid.query));
}
export async function summary(req, res) {
  ok(res, await service.paymentSummary(req.valid.query));
}
export async function record(req, res) {
  const { settlementId, ...data } = req.valid.body;
  created(res, await service.recordPayment(settlementId, data, req.user, req));
}
export async function reverse(req, res) {
  ok(res, await service.reversePayment(req.valid.params.id, req.valid.body, req.user, req));
}
