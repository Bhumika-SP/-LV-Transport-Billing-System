import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const SESSION_COOKIE = 'lv_session';
const ISSUER = 'lv-billing-api';

export function signSession(user, hours = env.SESSION_HOURS) {
  return jwt.sign({ tv: user.tokenVersion }, env.JWT_SECRET, {
    subject: String(user.id),
    issuer: ISSUER,
    expiresIn: Math.round(hours * 3600),
    algorithm: 'HS256',
  });
}

/** Returns { userId, tokenVersion } or null if the token is missing/invalid/expired. */
export function verifySession(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
    return { userId: Number(payload.sub), tokenVersion: payload.tv };
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
  };
}

/** `remember` (login's "Remember me") uses REMEMBER_SESSION_DAYS instead of SESSION_HOURS. */
export function setSessionCookie(res, user, { remember = false } = {}) {
  const hours = remember ? env.REMEMBER_SESSION_DAYS * 24 : env.SESSION_HOURS;
  res.cookie(SESSION_COOKIE, signSession(user, hours), {
    ...cookieOptions(),
    maxAge: hours * 3600 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
