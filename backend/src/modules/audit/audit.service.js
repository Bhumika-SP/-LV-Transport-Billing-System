import { prisma } from '../../lib/prisma.js';
import { serialize } from '../../utils/serialize.js';

/** Stable action names stored in audit_logs.action. */
export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  RECEIVE: 'RECEIVE',
  REVERT: 'REVERT',
  CANCEL: 'CANCEL',
  DELETE: 'DELETE',
  RECALCULATE: 'RECALCULATE',
});

const SENSITIVE_KEYS = new Set(['passwordHash', 'password', 'tokenVersion']);

function clean(value) {
  if (value === null || value === undefined) return undefined;
  const plain = serialize(value);
  if (typeof plain !== 'object' || Array.isArray(plain)) return plain;
  return Object.fromEntries(Object.entries(plain).filter(([k]) => !SENSITIVE_KEYS.has(k)));
}

/** Request metadata captured with each audit record. */
export function auditMeta(req) {
  return {
    ip: req?.ip ?? null,
    userAgent: req?.get?.('user-agent')?.slice(0, 255) ?? null,
    requestId: req?.id ? String(req.id) : null,
  };
}

/**
 * Append an audit record. Pass a transaction client as `db` so the audit row commits
 * or rolls back together with the change it describes.
 * Audit rows are append-only: there is no update or delete API.
 */
export function recordAudit(
  db,
  { userId, action, entityType, entityId, previousValue, newValue, reason, req },
) {
  return (db ?? prisma).auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType,
      entityId: entityId === undefined || entityId === null ? null : String(entityId),
      previousValue: clean(previousValue),
      newValue: clean(newValue),
      reason: reason ?? null,
      ...auditMeta(req),
    },
  });
}
