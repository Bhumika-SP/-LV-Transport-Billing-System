import { ok } from '../../utils/response.js';
import * as service from './profit.service.js';

export async function monthly(req, res) {
  ok(res, await service.monthlyProfit(req.valid.query));
}
export async function companies(req, res) {
  ok(res, await service.companyProfit(req.valid.query));
}
export async function overall(_req, res) {
  ok(res, await service.overallProfit());
}
