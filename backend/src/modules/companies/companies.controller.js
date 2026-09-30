import { created, ok, paged } from '../../utils/response.js';
import * as service from './companies.service.js';

export async function list(req, res) {
  paged(res, await service.listCompanies(req.valid.query));
}

export async function options(req, res) {
  ok(res, await service.companyOptions(req.valid.query));
}

export async function get(req, res) {
  ok(res, await service.getCompany(req.valid.params.id));
}

export async function create(req, res) {
  created(res, await service.createCompany(req.valid.body, req.user, req));
}

export async function update(req, res) {
  ok(res, await service.updateCompany(req.valid.params.id, req.valid.body, req.user, req));
}

export async function vehicles(req, res) {
  ok(res, await service.companyVehicles(req.valid.params.id));
}

export async function drivers(req, res) {
  ok(res, await service.companyDrivers(req.valid.params.id));
}
