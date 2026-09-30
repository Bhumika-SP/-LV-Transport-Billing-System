import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine((v) => v.startsWith('mysql://'), 'DATABASE_URL must be a mysql:// URL'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Authentication
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    SESSION_HOURS: z.coerce.number().positive().max(24).default(8),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_SECURE: booleanString,
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  })
  .transform((e) => ({
    ...e,
    // Secure cookies by default in production; SameSite=None always requires Secure.
    COOKIE_SECURE: e.COOKIE_SECURE ?? (e.NODE_ENV === 'production' || e.COOKIE_SAMESITE === 'none'),
  }))
  .refine((e) => e.COOKIE_SAMESITE !== 'none' || e.COOKIE_SECURE, {
    message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true',
    path: ['COOKIE_SECURE'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on env, so report configuration errors directly and stop.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
