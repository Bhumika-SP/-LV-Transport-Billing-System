import { ok } from '../../utils/response.js';
import * as authService from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './session.js';

export async function login(req, res) {
  const user = await authService.login(req.valid.body, req);
  setSessionCookie(res, user, { remember: req.valid.body.rememberMe });
  ok(res, authService.toSessionUser(user));
}

export async function logout(req, res) {
  await authService.logout(req.user, req);
  clearSessionCookie(res);
  ok(res, null);
}

export function me(req, res) {
  ok(res, req.user);
}

export async function changePassword(req, res) {
  const updated = await authService.changePassword(req.user.id, req.valid.body, req);
  // Re-issue this session's cookie with the new token version; other sessions are invalidated.
  setSessionCookie(res, updated);
  ok(res, null);
}
