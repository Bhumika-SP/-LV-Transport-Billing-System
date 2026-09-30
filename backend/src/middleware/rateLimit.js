import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Brute-force protection for POST /api/auth/login, keyed by client IP. */
export function loginRateLimiter({
  max = env.LOGIN_RATE_LIMIT_MAX,
  windowMinutes = env.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
} = {}) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError('Too many login attempts. Please try again later.', {
          status: 429,
          code: 'TOO_MANY_REQUESTS',
        }),
      ),
  });
}
