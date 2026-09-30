import { ok, paged } from '../../utils/response.js';
import { runScheduledChecks } from './events.js';
import * as service from './notifications.service.js';

export async function list(req, res) {
  paged(res, await service.listNotifications(req.user.id, req.valid.query));
}
export async function unreadCount(req, res) {
  ok(res, await service.unreadCount(req.user.id));
}
export async function read(req, res) {
  ok(res, await service.markRead(req.user.id, req.valid.params.id));
}
export async function readAll(req, res) {
  ok(res, await service.markAllRead(req.user.id));
}
export async function runChecks(_req, res) {
  ok(res, await runScheduledChecks());
}
