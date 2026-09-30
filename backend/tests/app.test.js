import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {},
  checkDatabase: vi.fn(),
}));

const { checkDatabase } = await import('../src/lib/prisma.js');
const { createApp } = await import('../src/app.js');

describe('foundation', () => {
  let app;
  beforeEach(() => {
    app = createApp();
    vi.mocked(checkDatabase).mockReset();
  });

  it('GET /health returns 200 when the database is reachable', async () => {
    vi.mocked(checkDatabase).mockResolvedValue({ latencyMs: 2 });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.status).toBe('up');
  });

  it('GET /health returns 503 when the database is down', async () => {
    vi.mocked(checkDatabase).mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'DATABASE_UNAVAILABLE' });
    expect(res.body.data.database.status).toBe('down');
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'ROUTE_NOT_FOUND' });
  });

  it('malformed JSON returns INVALID_JSON, not a stack trace', async () => {
    const res = await request(app)
      .post('/api')
      .set('Content-Type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
  });

  it('responses carry a request id and no x-powered-by header', async () => {
    const res = await request(app).get('/api');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
