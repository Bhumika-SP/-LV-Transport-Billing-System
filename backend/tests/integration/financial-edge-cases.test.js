import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import {
  assignDriver,
  assignVehicle,
  makeCompany,
  makeDriver,
  makeRate,
  makeVehicle,
  makeVehicleType,
} from '../helpers/fixtures.js';

/**
 * Spec §81 "Testing principle": one place that exercises every financial edge case the
 * spec lists. Module suites test each feature in depth; this suite proves the list.
 */
const app = createApp();
const MONTH = '2026-08';

describe('financial edge cases (spec §81)', () => {
  let as;
  let company;
  let driver;
  let car;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    company = await makeCompany({ name: 'Infosys', code: 'INFY' });
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    car = await makeVehicle(sedan.id);
    driver = await makeDriver({ fullName: 'Ravi' });
    await assignVehicle(car.id, company.id, '2026-01-01');
    await assignDriver(driver.id, car.id, '2026-01-01');
  });
  afterAll(() => prisma.$disconnect());

  const trip = (body = {}) =>
    as.biller.post('/api/trips').send({
      companyId: company.id,
      driverId: driver.id,
      vehicleId: car.id,
      tripDate: `${MONTH}-10`,
      kmSource: 'DIRECT',
      totalKm: '100',
      ...body,
    });
  const earning = (amount, extra = {}) =>
    as.biller.post('/api/earnings').send({
      driverId: driver.id,
      type: 'ALLOWANCE',
      amount,
      earningDate: `${MONTH}-15`,
      description: 'Night allowance',
      ...extra,
    });
  const settle = async () => {
    const s = (
      await as.biller.post('/api/settlements').send({ driverId: driver.id, settlementMonth: MONTH })
    ).body.data;
    return s;
  };
  const finalize = async (id) => {
    await as.biller.post(`/api/settlements/${id}/submit`).send({});
    await as.admin.post(`/api/settlements/${id}/approve`).send({});
    return as.admin.post(`/api/settlements/${id}/finalize`).send({});
  };

  it('positive amounts: KM × rate, exact to the paisa', async () => {
    const r = await trip({ totalKm: '123.45' });
    expect(r.status).toBe(201);
    expect(r.body.data.trip.earnings).toBe('2469.00');
  });

  it('zero amounts: zero-KM trips price to ₹0.00; zero-value money entries are rejected', async () => {
    expect((await trip({ totalKm: '0' })).body.data.trip.earnings).toBe('0.00');
    const zero = await earning('0');
    expect(zero.status).toBe(400);
    expect(zero.body.details[0].path).toBe('amount');
  });

  it('large amounts: crore-scale values stay exact through the settlement', async () => {
    expect((await trip({ totalKm: '99999.99' })).body.data.trip.earnings).toBe('1999999.80');
    expect((await earning('99999999.99')).status).toBe(201);
    const s = await settle();
    expect(s.finalAmount).toBe('101999999.79');
    const tooBig = await earning('99999999999999.99');
    expect(tooBig.status).toBe(400);
  });

  it('invalid KM: negative, non-numeric, more than 2 decimals, end before start', async () => {
    for (const body of [
      { totalKm: '-5' },
      { totalKm: 'abc' },
      { totalKm: '10.123' },
      { kmSource: 'START_END', startKm: '500', endKm: '400', totalKm: undefined },
    ]) {
      const r = await trip(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.trip.count()).toBe(0);
  });

  it('missing / invalid rates: no rate on the trip date means no trip', async () => {
    // A business-rule failure (valid input, no rate configured) is 422, not 400.
    const r = await trip({ tripDate: '2025-12-31' });
    expect(r.status).toBe(422);
    expect(r.body.details[0].path).toBe('tripDate');
    const bad = await as.admin
      .post('/api/rates')
      .send({ vehicleTypeId: car.vehicleTypeId, ratePerKm: '-1', effectiveFrom: '2027-01-01' });
    expect(bad.status).toBe(400);
  });

  it('missing drivers and vehicles are rejected with field errors', async () => {
    const r = await trip({ driverId: 999999, vehicleId: 999998 });
    expect(r.status).toBe(400);
    expect(r.body.details.map((d) => d.path).sort()).toEqual(['driverId', 'vehicleId']);
  });

  it('duplicate settlements: one settlement per driver per month', async () => {
    await trip();
    await settle();
    const dup = await as.biller
      .post('/api/settlements')
      .send({ driverId: driver.id, settlementMonth: MONTH });
    expect(dup.status).toBe(409);
    expect(await prisma.driverSettlement.count()).toBe(1);
  });

  it('finalized settlement changes are blocked until a reasoned reopen', async () => {
    await trip();
    const s = await settle();
    expect((await finalize(s.id)).body.data.status).toBe('FINALIZED');

    const late = await earning('500');
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('SETTLEMENT_LOCKED');
    expect((await trip({ tripDate: `${MONTH}-20` })).body.code).toBe('SETTLEMENT_LOCKED');

    // Reopen: reason required, previous figures preserved as a revision.
    expect((await as.admin.post(`/api/settlements/${s.id}/reopen`).send({})).status).toBe(400);
    const reopened = await as.admin
      .post(`/api/settlements/${s.id}/reopen`)
      .send({ reason: 'Missed allowance' });
    expect(reopened.status).toBe(200);
    expect(await prisma.driverSettlementRevision.count({ where: { settlementId: s.id } })).toBe(1);
    expect((await earning('500')).status).toBe(201);
    const recalculated = (await as.biller.post(`/api/settlements/${s.id}/calculate`).send({})).body
      .data;
    expect(recalculated.finalAmount).toBe('2500.00');
  });

  it('partial and multiple payments track the outstanding balance; overpayment is refused', async () => {
    await trip({ totalKm: '500' }); // ₹10,000
    const s = await settle();
    await finalize(s.id);
    const pay = (amount, paymentMethod) =>
      as.biller.post('/api/payments').send({
        settlementId: s.id,
        amount,
        paymentDate: '2026-09-05',
        paymentMethod,
      });
    expect((await pay('4000', 'CASH')).status).toBe(201);
    expect((await pay('3000', 'UPI')).status).toBe(201);
    let cur = (await as.biller.get(`/api/settlements/${s.id}`)).body.data;
    expect(cur).toMatchObject({ paidAmount: '7000.00', paymentStatus: 'PARTIALLY_PAID' });
    const over = await pay('3000.01', 'BANK_TRANSFER');
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');
    expect((await pay('3000', 'BANK_TRANSFER')).status).toBe(201);
    cur = (await as.biller.get(`/api/settlements/${s.id}`)).body.data;
    expect(cur).toMatchObject({ paidAmount: '10000.00', paymentStatus: 'PAID' });
  });

  it('advance over-recovery is rejected', async () => {
    const adv = await as.biller.post('/api/advances').send({
      driverId: driver.id,
      amount: '1000',
      advanceDate: `${MONTH}-01`,
      reason: 'Festival advance',
      paymentMethod: 'CASH',
    });
    expect(adv.status).toBe(201);
    const over = await as.biller
      .post(`/api/advances/${adv.body.data.id}/recoveries`)
      .send({ amount: '1000.01', settlementMonth: MONTH });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('RECOVERY_EXCEEDS_OUTSTANDING');
  });

  it('pending company receipts never count as profit', async () => {
    await trip();
    const s = await settle();
    await finalize(s.id);
    const cs = (
      await as.biller
        .post('/api/company-settlements')
        .send({ companyId: company.id, settlementMonth: MONTH, expectedAmount: '5000' })
    ).body.data;
    const profit = async () =>
      (await as.auditor.get('/api/profit/monthly').query({ fromMonth: MONTH, toMonth: MONTH })).body
        .data;
    let p = await profit();
    // Pending: shown as expected, never as received or profit.
    expect(p.totals).toMatchObject({
      receivedAmount: '0.00',
      pendingExpected: '5000.00',
      finalizedSettlements: '2000.00',
      lvProfit: '-2000.00',
    });
    await as.biller.post(`/api/company-settlements/${cs.id}/receive`).send({
      receivedAmount: '5000',
      receivedDate: '2026-09-10',
      paymentMethod: 'BANK_TRANSFER',
    });
    p = await profit();
    expect(p.totals).toMatchObject({
      receivedAmount: '5000.00',
      pendingExpected: '0.00',
      lvProfit: '3000.00',
    });
  });

  it('permission violations: Auditor cannot move money, Biller cannot approve or finalize', async () => {
    await trip();
    const s = await settle();
    expect((await earning('100', {})).status).toBe(201);
    expect(
      (
        await as.auditor.post('/api/earnings').send({
          driverId: driver.id,
          type: 'ALLOWANCE',
          amount: '100',
          earningDate: `${MONTH}-15`,
          description: 'x',
        })
      ).status,
    ).toBe(403);
    await as.biller.post(`/api/settlements/${s.id}/calculate`).send({});
    await as.biller.post(`/api/settlements/${s.id}/submit`).send({});
    expect((await as.biller.post(`/api/settlements/${s.id}/approve`).send({})).status).toBe(403);
    expect((await as.auditor.post(`/api/settlements/${s.id}/approve`).send({})).status).toBe(403);
  });
});
