import { ok, paged } from '../../utils/response.js';
import * as service from './audit-query.service.js';

export async function list(req, res) {
  paged(res, await service.listAuditLogs(req.valid.query));
}
export async function meta(_req, res) {
  ok(res, await service.auditMeta());
}
export async function get(req, res) {
  ok(res, await service.getAuditLog(req.valid.params.id));
}
export async function history(req, res) {
  const { entityType, entityId } = req.valid.params;
  ok(res, await service.entityHistory(entityType, entityId));
}
