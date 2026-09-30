import { serialize } from './serialize.js';

/** Consistent success envelope: { success: true, data, meta? } */
export function ok(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data: serialize(data) };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data) {
  return ok(res, data, { status: 201 });
}

/** Paginated list envelope. */
export function paged(res, { items, total, page, pageSize }) {
  return ok(res, items, {
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
