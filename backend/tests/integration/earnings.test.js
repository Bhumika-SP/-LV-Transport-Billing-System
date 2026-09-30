import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import {
  makeCompany,
  makeDriver,
  makeRate,
  makeVehicle,
  makeVehicleType,
} from '../helpers/fixtures.js';

const app = createApp();

describe('driver earnings (spec §21, Phase 7)', () => {
  let as;
  let ravi;
  let suresh;
  let company;
  let car;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    ravi = await makeDriver({ fullName: 'Ravi' });
    suresh = await makeDriver({ fullName: 'Suresh' });
    company = await makeCompany();
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    car = await makeVehicle(sedan.id);
  });
  afterAll(() => prisma.$disconnect());

  const earning = (agent, body) =>
    agent.post('/api/earnings').send({
      driverId: ravi.id,
      type: 'ALLOWANCE',
      amount: '1000',
      earningDate: '2026-09-10',
      description: 'Night allowance',
      ...body,
    });
  const adjustment = (agent, body) =>
    agent.post('/api/adjustments').send({
      driverId: ravi.id,
      type: 'POSITIVE_ADJUSTMENT',
      amount: '500',
      adjustmentDate: '2026-09-12',
      reason: 'Bonus for zero complaints',
      ...body,
    });
  const trip = (km, date = '2026-09-05', driverId = ravi.id) =>
    as.biller.post('/api/trips').send({
      companyId: company.id,
      driverId,
      vehicleId: car.id,
      tripDate: date,
      kmSource: 'DIRECT',
      totalKm: km,
    });

  it('records allowances and other earnings as separate line items', async () => {
    const a = await earning(as.biller);
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({
      type: 'ALLOWANCE',
      amount: '1000.00',
      earningDate: '2026-09-10',
      settlementMonth: '2026-09', // defaults to the date's month
      status: 'ACTIVE',
    });
    await earning(as.biller, {
      type: 'OTHER_EARNING',
      amount: '500',
      description: 'Festival incentive',
    });

    const list = await as.auditor.get('/api/earnings').query({ driverId: ravi.id });
    expect(list.body.data).toHaveLength(2);
    const totals = await as.auditor
      .get('/api/earnings/totals')
      .query({ driverId: ravi.id, month: '2026-09' });
    expect(totals.body.data).toEqual(
      expect.arrayContaining([
        { type: 'ALLOWANCE', count: 1, amount: '1000.00' },
        { type: 'OTHER_EARNING', count: 1, amount: '500.00' },
      ]),
    );
  });

  it('settlement month can be set explicitly (e.g. an item paid in the next cycle)', async () => {
    const r = await earning(as.biller, { earningDate: '2026-09-30', settlementMonth: '2026-10' });
    expect(r.body.data.settlementMonth).toBe('2026-10');
  });

  it('validates amount, description, type, driver and month', async () => {
    expect((await earning(as.biller, { amount: '0' })).status).toBe(400);
    expect((await earning(as.biller, { amount: '-10' })).status).toBe(400);
    expect((await earning(as.biller, { description: '' })).status).toBe(400);
    expect((await earning(as.biller, { type: 'BONUS' })).status).toBe(400);
    expect((await earning(as.biller, { settlementMonth: '2026-13' })).status).toBe(400);
    const bad = await earning(as.biller, { driverId: 999999 });
    expect(bad.body.code).toBe('INVALID_REFERENCE');
  });

  it('adjustments require a reason (no unexplained adjustments)', async () => {
    const r = await adjustment(as.biller, { reason: '' });
    expect(r.status).toBe(400);
    expect(r.body.details[0].path).toBe('reason');
    expect((await adjustment(as.biller)).status).toBe(201);
  });

  it('void keeps the item with a reason; it can only be voided once', async () => {
    const { body } = await earning(as.biller);
    expect((await as.biller.post(`/api/earnings/${body.data.id}/void`).send({})).status).toBe(400);
    const v = await as.biller
      .post(`/api/earnings/${body.data.id}/void`)
      .send({ reason: 'Entered twice' });
    expect(v.body.data).toMatchObject({ status: 'VOID', voidReason: 'Entered twice' });
    expect(
      (await as.biller.post(`/api/earnings/${body.data.id}/void`).send({ reason: 'again' })).status,
    ).toBe(409);
    expect(await prisma.driverEarning.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: 'DriverEarning' } })).toBe(2);
  });

  it('gross earnings per driver per month = trips + allowances + other earnings + positive adjustments', async () => {
    await trip('100'); // 2000
    await trip('50'); // 1000
    const cancelled = (await trip('999')).body.data.trip;
    await as.biller.post(`/api/trips/${cancelled.id}/cancel`).send({ reason: 'Wrong' });
    await earning(as.biller, { amount: '1000' });
    await earning(as.biller, { type: 'OTHER_EARNING', amount: '500', description: 'Incentive' });
    const voided = (await earning(as.biller, { amount: '99999' })).body.data;
    await as.biller.post(`/api/earnings/${voided.id}/void`).send({ reason: 'Typo' });
    await adjustment(as.biller, { amount: '250' });
    await adjustment(as.biller, {
      type: 'OTHER_DEDUCTION',
      amount: '777',
      reason: 'Previous overpayment',
    }); // not in gross
    await trip('10', '2026-09-06', suresh.id); // other driver: 200
    await earning(as.biller, { earningDate: '2026-08-31' }); // other month

    const res = await as.auditor.get('/api/earnings/gross').query({ month: '2026-09' });
    expect(res.status).toBe(200);
    const ravis = res.body.data.find((r) => r.driverId === ravi.id);
    expect(ravis).toMatchObject({
      settlementMonth: '2026-09',
      tripCount: 2,
      tripEarnings: '3000.00',
      allowances: '1000.00',
      otherEarnings: '500.00',
      positiveAdjustments: '250.00',
      grossEarnings: '4750.00',
      driver: { fullName: 'Ravi' },
    });
    expect(res.body.data.find((r) => r.driverId === suresh.id).grossEarnings).toBe('200.00');

    const history = await as.auditor.get('/api/earnings/gross').query({ driverId: ravi.id });
    expect(history.body.data.map((r) => [r.settlementMonth, r.grossEarnings])).toEqual([
      ['2026-09', '4750.00'],
      ['2026-08', '1000.00'],
    ]);
  });

  it('RBAC: auditor can view but not record or void', async () => {
    const { body } = await earning(as.biller);
    expect((await earning(as.auditor)).status).toBe(403);
    expect((await adjustment(as.auditor)).status).toBe(403);
    expect(
      (await as.auditor.post(`/api/earnings/${body.data.id}/void`).send({ reason: 'x y z' }))
        .status,
    ).toBe(403);
    expect((await as.auditor.get('/api/earnings')).status).toBe(200);
    expect((await as.auditor.get('/api/earnings/gross')).status).toBe(200);
  });
});
