import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';

const app = createApp();

describe('RBAC — users and roles (backend-enforced)', () => {
  let users;
  let as;
  beforeEach(async () => {
    users = await seedBase();
    as = await loginAll(app);
  });
  afterAll(() => prisma.$disconnect());

  it.each([
    ['get', '/api/users'],
    ['post', '/api/users'],
    ['get', '/api/roles'],
  ])('%s %s: 401 without a session', async (method, url) => {
    const res = await request(app)[method](url).set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(401);
  });

  it.each(['biller', 'auditor'])('%s cannot list, create or modify users', async (who) => {
    expect((await as[who].get('/api/users')).status).toBe(403);
    expect(
      (
        await as[who].post('/api/users').send({
          name: 'Hacker',
          email: 'h@test.local',
          roleCode: 'ADMIN',
          password: 'long-enough-pass',
        })
      ).status,
    ).toBe(403);
    expect(
      (await as[who].patch(`/api/users/${users.biller.id}`).send({ roleCode: 'ADMIN' })).status,
    ).toBe(403);
    expect((await as[who].get('/api/roles')).status).toBe(403);
  });

  it('admin lists users with search, filter and pagination', async () => {
    const res = await as.admin.get('/api/users').query({ search: 'bill', pageSize: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('biller@test.local');
    expect(res.body.data[0].passwordHash).toBeUndefined();
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });

    const byRole = await as.admin.get('/api/users').query({ role: 'AUDITOR' });
    expect(byRole.body.data.map((u) => u.email)).toEqual(['auditor@test.local']);
  });

  it('admin creates a user; duplicate email is rejected', async () => {
    const body = {
      name: 'New Biller',
      email: 'new@test.local',
      roleCode: 'BILLER',
      password: 'long-enough-pass',
    };
    const res = await as.admin.post('/api/users').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.role.code).toBe('BILLER');

    const dup = await as.admin.post('/api/users').send({ ...body, email: 'NEW@test.local' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak passwords', async () => {
    const res = await as.admin
      .post('/api/users')
      .send({ name: 'X', email: 'x@test.local', roleCode: 'BILLER', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('role change is audited with previous and new values and takes effect immediately', async () => {
    const res = await as.admin.patch(`/api/users/${users.auditor.id}`).send({ roleCode: 'BILLER' });
    expect(res.status).toBe(200);

    const log = await prisma.auditLog.findFirst({ where: { action: 'ROLE_CHANGE' } });
    expect(log).toMatchObject({ userId: users.admin.id, entityId: String(users.auditor.id) });
    expect(log.previousValue.role.code).toBe('AUDITOR');
    expect(log.newValue.role.code).toBe('BILLER');

    // Permissions are re-read per request: the same session now has biller rights.
    const me = await as.auditor.get('/api/auth/me');
    expect(me.body.data.role.code).toBe('BILLER');
  });

  it('deactivation revokes the user’s sessions', async () => {
    await as.admin.patch(`/api/users/${users.biller.id}`).send({ status: 'INACTIVE' });
    expect((await as.biller.get('/api/auth/me')).status).toBe(401);
  });

  it('admin cannot demote or deactivate themselves', async () => {
    const res = await as.admin.patch(`/api/users/${users.admin.id}`).send({ roleCode: 'BILLER' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_MODIFICATION_NOT_ALLOWED');
  });

  it('an admin can demote another admin while at least one active admin remains', async () => {
    const second = await as.admin.post('/api/users').send({
      name: 'Admin Two',
      email: 'admin2@test.local',
      roleCode: 'ADMIN',
      password: 'long-enough-pass',
    });
    const res = await as.admin
      .patch(`/api/users/${second.body.data.id}`)
      .send({ roleCode: 'BILLER' });
    expect(res.status).toBe(200);
    const count = await prisma.user.count({ where: { status: 'ACTIVE', role: { code: 'ADMIN' } } });
    expect(count).toBe(1);
  });

  it('admin reset-password revokes the target’s sessions', async () => {
    const res = await as.admin
      .post(`/api/users/${users.biller.id}/reset-password`)
      .send({ password: 'reset-password-123' });
    expect(res.status).toBe(200);
    expect((await as.biller.get('/api/auth/me')).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET' } })).toBe(1);
  });

  it('admin sees the three roles and the permission matrix', async () => {
    const res = await as.admin.get('/api/roles');
    expect(res.status).toBe(200);
    expect(res.body.data.roles.map((r) => r.code)).toEqual(['ADMIN', 'BILLER', 'AUDITOR']);
    const biller = res.body.data.roles.find((r) => r.code === 'BILLER');
    expect(biller.permissions).not.toContain('user.manage');
    expect(biller.permissions).not.toContain('rate.manage');
  });
});
