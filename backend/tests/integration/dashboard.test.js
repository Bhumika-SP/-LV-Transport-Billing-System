import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { addDays, todayInBusinessTz } from '../../src/utils/dates.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeCompany, makeDriver, makeVehicle, makeVehicleType } from '../helpers/fixtures.js';

const app = createApp();

describe('role-aware dashboard (spec §44)', () => {
  let as;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    await makeCompany();
    await makeVehicle((await makeVehicleType()).id, {
      insuranceExpiryDate: new Date(`${addDays(todayInBusinessTz(), 10)}T00:00:00Z`),
    });
    await makeDriver({
      licenseExpiryDate: new Date(`${addDays(todayInBusinessTz(), -1)}T00:00:00Z`),
    });
  });
  afterAll(() => prisma.$disconnect());

  it('Admin sees every section', async () => {
    const d = (await as.admin.get('/api/dashboard')).body.data;
    for (const k of [
      'counts',
      'companyReceipts',
      'settlements',
      'payments',
      'profit',
      'imports',
      'expenses',
      'documentAlerts',
      'auditAlerts',
    ]) {
      expect(d).toHaveProperty(k);
    }
    expect(d.counts).toMatchObject({ companies: 1, drivers: 1, vehicles: 1 });
    expect(d.profit.totals).toHaveProperty('lvProfit');
  });

  it('Biller gets operations but never LV profit or audit alerts', async () => {
    const d = (await as.biller.get('/api/dashboard')).body.data;
    expect(d.role).toBe('BILLER');
    expect(d).toHaveProperty('counts');
    expect(d).toHaveProperty('imports');
    expect(d).toHaveProperty('expenses');
    expect(d).not.toHaveProperty('profit');
    expect(d).not.toHaveProperty('auditAlerts');
  });

  it('Auditor gets finance, profit and audit alerts', async () => {
    const d = (await as.auditor.get('/api/dashboard')).body.data;
    for (const k of ['profit', 'companyReceipts', 'payments', 'expenses', 'auditAlerts'])
      expect(d).toHaveProperty(k);
  });

  it('document expiry alerts flag expired and soon-expiring documents', async () => {
    const d = (await as.admin.get('/api/dashboard')).body.data;
    const kinds = d.documentAlerts.map((a) => [a.kind, a.expired]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['LICENSE', true],
        ['INSURANCE', false],
      ]),
    );
  });

  it('failed logins show up as an audit alert', async () => {
    await as.admin
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'wrong-password' });
    const d = (await as.admin.get('/api/dashboard')).body.data;
    expect(d.auditAlerts.failedLoginsLast24h).toBe(1);
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });
});
