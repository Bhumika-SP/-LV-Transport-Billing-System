import { created, ok, paged } from '../../utils/response.js';
import * as service from './drivers.service.js';

export async function list(req, res) {
  paged(res, await service.listDrivers(req.valid.query));
}

export async function options(req, res) {
  ok(res, await service.driverOptions(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getDriver(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createDriver(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateDriver(req.valid.params.id, req.valid.body, req.user, req));
}

export async function assignments(req, res) {
  ok(res, await service.driverAssignments(req.valid.params.id));
}
