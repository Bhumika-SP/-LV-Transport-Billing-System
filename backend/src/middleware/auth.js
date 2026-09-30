import { findUserForSession, toSessionUser } from '../modules/auth/auth.service.js';
import { SESSION_COOKIE, clearSessionCookie, verifySession } from '../modules/auth/session.js';
import { AppError } from '../utils/AppError.js';

/**
 * Require a valid session. The user is re-loaded from the database on every request
 * so deactivation, role changes and password resets take effect immediately.
 */
export async function authenticate(req, res, next) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    if (req.cookies?.[SESSION_COOKIE]) clearSessionCookie(res);
    throw AppError.unauthorized();
  }

  const user = await findUserForSession(session.userId);
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== session.tokenVersion) {
    clearSessionCookie(res);
    throw AppError.unauthorized(
      'Your session has expired. Please sign in again.',
      'SESSION_EXPIRED',
    );
  }

  req.user = toSessionUser(user);
  req.log = req.log?.child({ userId: user.id });
  next();
}

/** Require at least one of the given permission codes (backend RBAC). */
export function requirePermission(...codes) {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!codes.some((c) => req.user.permissions.includes(c))) {
      throw AppError.forbidden();
    }
    next();
  };
}

/** Convenience for services/controllers that need a conditional check. */
export function hasPermission(user, code) {
  return Boolean(user?.permissions?.includes(code));
}
