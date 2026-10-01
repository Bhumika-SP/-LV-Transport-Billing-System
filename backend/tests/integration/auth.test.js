import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signSession } from '../../src/modules/auth/session.js';
import { loginAs, newAgent } from '../helpers/auth.js';
import { TEST_PASSWORD, prisma, seedBase } from '../helpers/db.js';

const app = createApp();

describe('authentication', () => {
  let users;
  beforeEach(async () => {
    users = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it('logs in, sets an HTTP-only session cookie and returns permissions', async () => {
    const res = await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'ADMIN@test.local', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'admin@test.local', role: { code: 'ADMIN' } });
    expect(res.body.data.permissions).toContain('user.manage');
    expect(res.body.data.passwordHash).toBeUndefined();

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^lv_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('"Remember me" keeps the session for REMEMBER_SESSION_DAYS instead of SESSION_HOURS', async () => {
    const maxAge = async (rememberMe) => {
      const res = await newAgent(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.local', password: TEST_PASSWORD, rememberMe });
      expect(res.status).toBe(200);
      return Number(/Max-Age=(\d+)/i.exec(res.headers['set-cookie'][0])[1]);
    };
    expect(await maxAge(false)).toBe(8 * 3600);
    expect(await maxAge(true)).toBe(7 * 24 * 3600);
  });

  it('rejects a wrong password and an unknown email with the same response', async () => {
    const wrong = await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'nope-nope-nope' });
    const unknown = await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'nope-nope-nope' });

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('validates the login body', async () => {
    const res = await newAgent(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('refuses login for an inactive account', async () => {
    await prisma.user.update({ where: { id: users.biller.id }, data: { status: 'INACTIVE' } });
    const res = await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'biller@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('GET /auth/me requires a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me returns the current user', async () => {
    const agent = await loginAs(app, 'auditor');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.role.code).toBe('AUDITOR');
  });

  it('rejects a tampered or foreign-signed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'lv_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.forged');
    expect(res.status).toBe(401);
  });

  it('logout clears the cookie and ends the session', async () => {
    const agent = await loginAs(app, 'biller');
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'][0]).toMatch(/lv_session=;/);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('revokes existing sessions when the token version changes', async () => {
    const token = signSession(users.biller);
    await prisma.user.update({
      where: { id: users.biller.id },
      data: { tokenVersion: { increment: 1 } },
    });
    const res = await request(app).get('/api/auth/me').set('Cookie', `lv_session=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('change-password requires the current password and keeps this session', async () => {
    const agent = await loginAs(app, 'biller');
    const bad = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'wrong-password', newPassword: 'A-brand-new-pass-1' });
    expect(bad.body.code).toBe('INVALID_CURRENT_PASSWORD');

    const good = await agent
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'A-brand-new-pass-1' });
    expect(good.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const relogin = await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'biller@test.local', password: 'A-brand-new-pass-1' });
    expect(relogin.status).toBe(200);
  });

  it('audits successful and failed logins and logout', async () => {
    const agent = await loginAs(app, 'admin');
    await newAgent(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong-password' });
    await agent.post('/api/auth/logout');

    const actions = (
      await prisma.auditLog.findMany({ where: { userId: users.admin.id }, orderBy: { id: 'asc' } })
    ).map((a) => a.action);
    expect(actions).toEqual(['LOGIN', 'LOGIN_FAILED', 'LOGOUT']);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_HEADER_MISSING');
  });
});
