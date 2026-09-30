import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { loginRateLimiter } from '../../src/middleware/rateLimit.js';

describe('login rate limiter', () => {
  it('returns 429 TOO_MANY_REQUESTS once the limit is exceeded', async () => {
    const app = express();
    app.post('/login', loginRateLimiter({ max: 3, windowMinutes: 1 }), (_req, res) =>
      res.json({ ok: true }),
    );
    app.use(errorHandler);

    for (let i = 0; i < 3; i++) expect((await request(app).post('/login')).status).toBe(200);
    const blocked = await request(app).post('/login');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });
});
