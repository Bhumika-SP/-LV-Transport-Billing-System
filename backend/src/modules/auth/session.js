import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const SESSION_COOKIE = 'lv_session';
const ISSUER = 'lv-billing-api';

export function signSession(user) {
  return jwt.sign({ tv: user.tokenVersion }, env.JWT_SECRET, {
    subject: String(user.id),
    issuer: ISSUER,
    expiresIn: Math.round(env.SESSION_HOURS * 3600),
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

export function setSessionCookie(res, user) {
  res.cookie(SESSION_COOKIE, signSession(user), {
    ...cookieOptions(),
    maxAge: env.SESSION_HOURS * 3600 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
