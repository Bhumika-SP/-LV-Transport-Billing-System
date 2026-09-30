import { created, ok, paged } from '../../utils/response.js';
import * as service from './vehicle-types.service.js';

export async function list(req, res) {
  paged(res, await service.listVehicleTypes(req.valid.query));
}

export async function options(req, res) {
  ok(res, await service.vehicleTypeOptions(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getVehicleType(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createVehicleType(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateVehicleType(req.valid.params.id, req.valid.body, req.user, req));
}
