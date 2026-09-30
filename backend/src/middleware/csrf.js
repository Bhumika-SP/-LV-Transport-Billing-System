import { AppError } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated APIs: state-changing requests must carry
 * `X-Requested-With: XMLHttpRequest`. Browsers cannot add custom headers to
 * cross-site requests without a CORS preflight, which our CORS allow-list rejects.
 * This complements SameSite cookies.
 */
export function requireCsrfHeader(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || req.get('x-requested-with') === 'XMLHttpRequest') {
    return next();
  }
  throw AppError.forbidden('Missing required request header', 'CSRF_HEADER_MISSING');
}
