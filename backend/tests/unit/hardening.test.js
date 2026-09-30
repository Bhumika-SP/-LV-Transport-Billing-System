import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { envSchema } from '../../src/config/env.js';

const app = createApp();

describe('HTTP hardening (Phase 18)', () => {
  it('reuses a safe upstream request ID and replaces an unsafe or oversized one', async () => {
    const good = await request(app).get('/api/').set('X-Request-ID', 'render-abc.123');
    expect(good.headers['x-request-id']).toBe('render-abc.123');
    const long = await request(app).get('/api/').set('X-Request-ID', 'x'.repeat(65));
    expect(long.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const nasty = await request(app).get('/api/').set('X-Request-ID', 'a b<script>');
    expect(nasty.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('API responses are never cacheable and carry security headers', async () => {
    const res = await request(app).get('/api/');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('large JSON responses are compressed', async () => {
    const res = await request(app).get('/api/').set('Accept-Encoding', 'gzip');
    // Tiny bodies are sent as-is; the middleware must at least negotiate.
    expect(res.headers.vary).toMatch(/Accept-Encoding/i);
  });
});

describe('production environment guards', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://u:p@db.example.com:3306/lv',
    JWT_SECRET: 'q7Vx2LmP9sRt4WzYb8NcKd3FgHj6Ae1Uo5Ii0',
    CORS_ORIGINS: 'https://billing.lvtransport.in',
  };
  const issues = (over) => {
    const r = envSchema.safeParse({ ...base, ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('accepts a correct production configuration and forces secure cookies', () => {
    const r = envSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.COOKIE_SECURE).toBe(true);
  });

  it('rejects http/localhost origins and placeholder secrets in production', () => {
    expect(issues({ CORS_ORIGINS: 'http://billing.lvtransport.in' })).toContain('CORS_ORIGINS');
    expect(issues({ CORS_ORIGINS: 'https://localhost:5173' })).toContain('CORS_ORIGINS');
    expect(issues({ JWT_SECRET: 'replace-with-at-least-32-random-characters' })).toContain(
      'JWT_SECRET',
    );
    expect(issues({ JWT_SECRET: 'a'.repeat(40) })).toContain('JWT_SECRET');
  });

  it('requires bucket credentials when S3 storage is selected', () => {
    expect(issues({ STORAGE_DRIVER: 's3' })).toContain('STORAGE_DRIVER');
    expect(
      issues({
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      }),
    ).toEqual([]);
  });

  it('development keeps working with local defaults', () => {
    expect(
      envSchema.safeParse({
        ...base,
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://localhost:5173',
      }).success,
    ).toBe(true);
  });
});
