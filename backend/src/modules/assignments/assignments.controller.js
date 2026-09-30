import { created, ok, paged } from '../../utils/response.js';
import * as service from './assignments.service.js';

/** Controllers bound to one assignment kind ('vehicle' | 'driver'). */
export function controllerFor(kind) {
  return {
    async list(req, res) {
      paged(res, await service.listAssignments(kind, req.valid.query));
    },
    async create(req, res) {
      created(res, await service.createAssignment(kind, req.valid.body, req.user, req));
    },
    async update(req, res) {
      ok(
        res,
        await service.updateAssignment(kind, req.valid.params.id, req.valid.body, req.user, req),
      );
    },
  };
}
