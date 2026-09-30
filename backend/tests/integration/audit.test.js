import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { todayInBusinessTz, addDays } from '../../src/utils/dates.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';

const app = createApp();

describe('audit trail (spec §55–57)', () => {
  let as;
  let driverId;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    const d = await as.biller
      .post('/api/drivers')
      .send({ fullName: 'Ravi Kumar', phone: '9876543210' });
    driverId = d.body.data.id;
    await as.biller.patch(`/api/drivers/${driverId}`).send({ fullName: 'Ravi K' });
  });
  afterAll(() => prisma.$disconnect());

  it('Admin and Auditor can read the trail; Biller cannot', async () => {
    expect((await as.biller.get('/api/audit')).status).toBe(403);
    expect((await as.admin.get('/api/audit')).status).toBe(200);
    const res = await as.auditor.get('/api/audit');
    expect(res.status).toBe(200);
    // Newest first, with the acting user.
    expect(res.body.data[0].id).toBeGreaterThan(res.body.data.at(-1).id);
    expect(res.body.data.find((l) => l.action === 'UPDATE').user).toMatchObject({
      email: expect.stringContaining('biller'),
      role: { code: 'BILLER' },
    });
  });

  it('filters by action list, user, record and date', async () => {
    const logins = (await as.auditor.get('/api/audit').query({ action: 'LOGIN,LOGIN_FAILED' }))
      .body;
    expect(logins.data.length).toBe(3);
    expect(logins.data.every((l) => l.action === 'LOGIN')).toBe(true);
    expect((await as.auditor.get('/api/audit').query({ action: 'NOPE' })).status).toBe(400);

    const billerId = (await prisma.user.findFirst({ where: { email: { contains: 'biller' } } })).id;
    const byUser = (await as.auditor.get('/api/audit').query({ userId: billerId })).body.data;
    expect(byUser.every((l) => l.userId === billerId)).toBe(true);

    const record = (
      await as.auditor.get('/api/audit').query({ entityType: 'Driver', entityId: String(driverId) })
    ).body.data;
    expect(record.map((l) => l.action)).toEqual(['UPDATE', 'CREATE']);

    const today = todayInBusinessTz();
    expect(
      (await as.auditor.get('/api/audit').query({ fromDate: today })).body.meta.total,
    ).toBeGreaterThan(0);
    expect(
      (await as.auditor.get('/api/audit').query({ toDate: addDays(today, -1) })).body.meta.total,
    ).toBe(0);
  });

  it('entity history is chronological and includes before/after values', async () => {
    const h = (await as.auditor.get(`/api/audit/history/Driver/${driverId}`)).body.data;
    expect(h.map((l) => l.action)).toEqual(['CREATE', 'UPDATE']);
    expect(h[1].previousValue.fullName).toBe('Ravi Kumar');
    expect(h[1].newValue.fullName).toBe('Ravi K');
    const one = await as.auditor.get(`/api/audit/${h[1].id}`);
    expect(one.body.data.id).toBe(h[1].id);
    expect((await as.auditor.get('/api/audit/999999')).status).toBe(404);
  });

  it('meta lists every action code and the record types present', async () => {
    const meta = (await as.auditor.get('/api/audit/meta')).body.data;
    expect(meta.actions).toContain('FINALIZE');
    expect(meta.entityTypes).toEqual(expect.arrayContaining(['Driver', 'User']));
    expect(meta.users.length).toBe(3);
  });

  it('is append-only: no API to change it, and the database rejects UPDATE/DELETE', async () => {
    const [log] = (await as.admin.get('/api/audit')).body.data;
    expect((await as.admin.delete(`/api/audit/${log.id}`)).status).toBe(404);
    expect((await as.admin.patch(`/api/audit/${log.id}`).send({ reason: 'x' })).status).toBe(404);

    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { reason: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${log.id}`).rejects.toThrow(
      /append-only/,
    );
    expect((await prisma.auditLog.findUnique({ where: { id: log.id } })).reason).toBe(log.reason);
  });
});
