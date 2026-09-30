import { created, ok, paged } from '../../utils/response.js';
import * as service from './vehicles.service.js';

export async function list(req, res) {
  paged(res, await service.listVehicles(req.valid.query));
}

export async function options(req, res) {
  ok(res, await service.vehicleOptions(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getVehicle(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createVehicle(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateVehicle(req.valid.params.id, req.valid.body, req.user, req));
}

export async function assignments(req, res) {
  ok(res, await service.vehicleAssignments(req.valid.params.id));
}
