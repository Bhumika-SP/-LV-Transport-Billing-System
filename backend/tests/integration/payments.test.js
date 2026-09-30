import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { calculateOutstandingPayment } from '../../src/modules/payments/payments.service.js';
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

describe('driver payments (spec §32–33, scenario §77)', () => {
  let as;
  let ravi;
  let company;
  let car;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    company = await makeCompany();
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    car = await makeVehicle(sedan.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
  });
  afterAll(() => prisma.$disconnect());

  const post = (agent, url, body = {}) => agent.post(url).send(body);

  /** A FINALIZED settlement of exactly ₹1,35,000 (6,750 km × ₹20). */
  async function finalizedSettlement(km = '6750') {
    await post(as.biller, '/api/trips', {
      companyId: company.id,
      driverId: ravi.id,
      vehicleId: car.id,
      tripDate: '2026-09-10',
      kmSource: 'DIRECT',
      totalKm: km,
    });
    const s = (
      await post(as.biller, '/api/settlements', { driverId: ravi.id, settlementMonth: '2026-09' })
    ).body.data;
    await post(as.biller, `/api/settlements/${s.id}/submit`);
    await post(as.admin, `/api/settlements/${s.id}/approve`);
    return (await post(as.admin, `/api/settlements/${s.id}/finalize`)).body.data;
  }
  const pay = (agent, settlementId, amount, paymentMethod, extra = {}) =>
    post(agent, '/api/payments', {
      settlementId,
      amount,
      paymentMethod,
      paymentDate: '2026-09-30',
      ...extra,
    });

  it('scenario §77: 50,000 Cash + 50,000 Bank → 35,000 outstanding PARTIALLY_PAID; + 35,000 UPI → PAID', async () => {
    const s = await finalizedSettlement();
    expect(s).toMatchObject({ finalAmount: '135000.00', paymentStatus: 'UNPAID' });

    let r = await pay(as.biller, s.id, '50000', 'CASH');
    expect(r.status).toBe(201);
    expect(r.body.data.settlement).toMatchObject({
      paidAmount: '50000.00',
      paymentStatus: 'PARTIALLY_PAID',
    });

    r = await pay(as.biller, s.id, '50000', 'BANK_TRANSFER', { referenceNumber: 'UTR998' });
    expect(r.body.data.settlement).toMatchObject({
      paidAmount: '100000.00',
      paymentStatus: 'PARTIALLY_PAID',
    });
    let detail = (await as.auditor.get(`/api/settlements/${s.id}`)).body.data;
    expect(detail.outstandingAmount).toBe('35000.00');

    r = await pay(as.biller, s.id, '35000', 'UPI', { referenceNumber: 'UPI-77' });
    expect(r.body.data.settlement).toMatchObject({
      paidAmount: '135000.00',
      paymentStatus: 'PAID',
    });
    detail = (await as.auditor.get(`/api/settlements/${s.id}`)).body.data;
    expect(detail.outstandingAmount).toBe('0.00');
    expect(detail.payments.map((p) => [p.amount, p.paymentMethod])).toEqual([
      ['50000.00', 'CASH'],
      ['50000.00', 'BANK_TRANSFER'],
      ['35000.00', 'UPI'],
    ]);
  });

  it('refuses payments above the outstanding amount', async () => {
    const s = await finalizedSettlement();
    await pay(as.biller, s.id, '100000', 'CASH');
    const over = await pay(as.biller, s.id, '35000.01', 'CASH');
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');
    await pay(as.biller, s.id, '35000', 'CASH');
    expect((await pay(as.biller, s.id, '0.01', 'CASH')).body.code).toBe(
      'PAYMENT_EXCEEDS_OUTSTANDING',
    );
  });

  it('concurrent payments cannot overpay', async () => {
    const s = await finalizedSettlement('500'); // ₹10,000
    const results = await Promise.all(
      ['4000', '4000', '4000', '4000'].map((a) => pay(as.biller, s.id, a, 'UPI')),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const after = await prisma.driverSettlement.findUnique({ where: { id: s.id } });
    expect(after.paidAmount.toFixed(2)).toBe('8000.00');
  });

  it('only finalized settlements are payable; methods, amount and date validated', async () => {
    await post(as.biller, '/api/trips', {
      companyId: company.id,
      driverId: ravi.id,
      vehicleId: car.id,
      tripDate: '2026-09-10',
      kmSource: 'DIRECT',
      totalKm: '10',
    });
    const draft = (
      await post(as.biller, '/api/settlements', { driverId: ravi.id, settlementMonth: '2026-09' })
    ).body.data;
    expect((await pay(as.biller, draft.id, '1', 'CASH')).body.code).toBe(
      'SETTLEMENT_NOT_FINALIZED',
    );

    await post(as.biller, `/api/settlements/${draft.id}/submit`);
    await post(as.admin, `/api/settlements/${draft.id}/approve`);
    await post(as.admin, `/api/settlements/${draft.id}/finalize`);
    expect((await pay(as.biller, draft.id, '1', 'CRYPTO')).status).toBe(400);
    expect((await pay(as.biller, draft.id, '0', 'CASH')).status).toBe(400);
    expect(
      (await pay(as.biller, draft.id, '1', 'CASH', { paymentDate: '2099-01-01' })).status,
    ).toBe(400);
  });

  it('reversal is admin-only, needs a reason, keeps the record and restores the outstanding', async () => {
    const s = await finalizedSettlement();
    await pay(as.biller, s.id, '100000', 'CASH');
    const wrong = (await pay(as.biller, s.id, '35000', 'UPI')).body.data.payment;

    expect(
      (await post(as.biller, `/api/payments/${wrong.id}/reverse`, { reason: 'Wrong UPI' })).status,
    ).toBe(403);
    expect((await post(as.admin, `/api/payments/${wrong.id}/reverse`, {})).status).toBe(400);
    const r = await post(as.admin, `/api/payments/${wrong.id}/reverse`, {
      reason: 'Sent to wrong UPI ID',
    });
    expect(r.body.data.payment).toMatchObject({
      status: 'REVERSED',
      reversalReason: 'Sent to wrong UPI ID',
    });
    expect(r.body.data.settlement).toMatchObject({
      paidAmount: '100000.00',
      paymentStatus: 'PARTIALLY_PAID',
    });
    expect(await prisma.driverPayment.count()).toBe(2);
    expect(
      (await post(as.admin, `/api/payments/${wrong.id}/reverse`, { reason: 'again' })).body.code,
    ).toBe('ALREADY_REVERSED');

    const actions = (
      await prisma.auditLog.findMany({ where: { entityType: 'DriverPayment' } })
    ).map((a) => a.action);
    expect(actions.sort()).toEqual(['PAYMENT', 'PAYMENT', 'REVERSE']);
  });

  it('reopening keeps payments; re-finalizing below the amount already paid is refused', async () => {
    const s = await finalizedSettlement(); // 135000
    await pay(as.biller, s.id, '100000', 'CASH');
    await post(as.admin, `/api/settlements/${s.id}/reopen`, { reason: 'EMI was missed' });
    // No payments while reopened.
    expect((await pay(as.biller, s.id, '1', 'CASH')).body.code).toBe('SETTLEMENT_NOT_FINALIZED');

    await post(as.biller, '/api/lv-expenses', {
      driverId: ravi.id,
      vehicleId: car.id,
      category: 'EMI',
      amount: '40000',
      expenseDate: '2026-09-20',
      description: 'EMI',
    });
    await post(as.biller, `/api/settlements/${s.id}/calculate`);
    await post(as.biller, `/api/settlements/${s.id}/submit`);
    await post(as.admin, `/api/settlements/${s.id}/approve`);
    const fin = await post(as.admin, `/api/settlements/${s.id}/finalize`);
    expect(fin.body.code).toBe('PAID_EXCEEDS_FINAL'); // 95,000 < 1,00,000 already paid
  });

  it('list and summary by method; RBAC for auditor', async () => {
    const s = await finalizedSettlement();
    await pay(as.biller, s.id, '50000', 'CASH');
    await pay(as.biller, s.id, '50000', 'BANK_TRANSFER');
    expect((await pay(as.auditor, s.id, '1', 'CASH')).status).toBe(403);

    const list = await as.auditor
      .get('/api/payments')
      .query({ driverId: ravi.id, month: '2026-09' });
    expect(list.body.meta.total).toBe(2);
    const sum = (await as.auditor.get('/api/payments/summary')).body.data;
    expect(sum).toMatchObject({ count: 2, total: '100000.00' });
    expect(sum.byMethod.find((m) => m.method === 'CASH').amount).toBe('50000.00');
  });

  it('pure outstanding calculation', () => {
    const r = calculateOutstandingPayment('135000', ['50000', '50000']);
    expect([r.paid.toFixed(2), r.outstanding.toFixed(2), r.status]).toEqual([
      '100000.00',
      '35000.00',
      'PARTIALLY_PAID',
    ]);
    expect(calculateOutstandingPayment('135000', []).status).toBe('UNPAID');
    expect(calculateOutstandingPayment('0', []).status).toBe('PAID');
  });
});
