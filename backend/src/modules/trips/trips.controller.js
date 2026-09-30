import { created, ok, paged } from '../../utils/response.js';
import * as service from './trips.service.js';

export async function list(req, res) {
  paged(res, await service.listTrips(req.valid.query));
}

export async function summary(req, res) {
  ok(res, await service.summarizeTrips(req.valid.query));
}

export async function preview(req, res) {
  ok(res, await service.previewTrip(req.valid.body));
}

export async function get(req, res) {
  ok(res, await service.getTrip(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createTrip(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateTrip(req.valid.params.id, req.valid.body, req.user, req));
}

export async function cancel(req, res) {
  ok(res, await service.cancelTrip(req.valid.params.id, req.valid.body, req.user, req));
}

export async function recalculate(req, res) {
  ok(res, await service.recalculateTrip(req.valid.params.id, req.valid.body, req.user, req));
}

export async function bulkRecalculate(req, res) {
  ok(res, await service.bulkRecalculate(req.valid.body, req.user, req));
}
