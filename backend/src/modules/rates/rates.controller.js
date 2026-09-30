import { created, ok } from '../../utils/response.js';
import * as service from './rates.service.js';

export async function list(req, res) {
  ok(res, await service.listRates(req.valid.query.vehicleTypeId));
}

export async function resolve(req, res) {
  const { vehicleTypeId, date } = req.valid.query;
  ok(res, await service.resolveRate(vehicleTypeId, date));
}

export async function create(req, res) {
  created(res, await service.createRate(req.valid.body, req.user, req));
}

export async function cancel(req, res) {
  ok(res, await service.cancelRate(req.valid.params.id, req.valid.body, req.user, req));
}
