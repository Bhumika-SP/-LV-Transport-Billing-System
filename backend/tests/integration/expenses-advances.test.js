import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { calculateAdvanceBalance } from '../../src/modules/advances/advances.service.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeDriver, makeVehicle, makeVehicleType } from '../helpers/fixtures.js';

const app = createApp();

describe('expenses, advances and deductions (spec §22–26, Phase 8)', () => {
  let as;
  let ravi;
  let car;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    ravi = await makeDriver({ fullName: 'Ravi' });
    car = await makeVehicle((await makeVehicleType()).id);
  });
  afterAll(() => prisma.$disconnect());

  const expense = (agent, resource, body) =>
    agent.post(`/api/${resource}`).send({
      driverId: ravi.id,
      vehicleId: car.id,
      category: 'FUEL',
      amount: '2000',
      expenseDate: '2026-09-10',
      description: 'Diesel fill',
      ...body,
    });

  describe('expenses: two directions, never confused', () => {
    it('LV-paid and driver-paid are recorded separately with their payer', async () => {
      const lv = await expense(as.biller, 'lv-expenses', { amount: '5000' });
      expect(lv.status).toBe(201);
      expect(lv.body.data).toMatchObject({
        paidBy: 'LV',
        category: 'FUEL',
        amount: '5000.00',
        settlementMonth: '2026-09',
      });

      const drv = await expense(as.biller, 'driver-expenses');
      expect(drv.body.data).toMatchObject({ paidBy: 'DRIVER', amount: '2000.00' });

      // Each endpoint only sees its own direction.
      const lvList = await as.auditor.get('/api/lv-expenses');
      expect(lvList.body.data.map((e) => e.paidBy)).toEqual(['LV']);
      const drvList = await as.auditor.get('/api/driver-expenses');
      expect(drvList.body.data.map((e) => e.paidBy)).toEqual(['DRIVER']);
    });

    it('a client cannot smuggle paidBy into the other direction', async () => {
      const res = await expense(as.biller, 'driver-expenses', { paidBy: 'LV' });
      expect(res.body.data.paidBy).toBe('DRIVER');
    });

    it('enforces categories per payer (EMI only LV-paid; OTHER only driver-paid)', async () => {
      expect((await expense(as.biller, 'driver-expenses', { category: 'EMI' })).status).toBe(400);
      expect((await expense(as.biller, 'lv-expenses', { category: 'OTHER' })).status).toBe(400);
      for (const c of ['FUEL', 'TOLL', 'MAINTENANCE', 'EMI']) {
        expect((await expense(as.biller, 'lv-expenses', { category: c })).status).toBe(201);
      }
      expect((await expense(as.biller, 'driver-expenses', { category: 'OTHER' })).status).toBe(201);
    });

    it('requires driver, vehicle, amount > 0, date and description', async () => {
      expect((await expense(as.biller, 'lv-expenses', { vehicleId: 999999 })).body.code).toBe(
        'INVALID_REFERENCE',
      );
      expect((await expense(as.biller, 'lv-expenses', { vehicleId: undefined })).status).toBe(400);
      expect((await expense(as.biller, 'lv-expenses', { amount: '0' })).status).toBe(400);
      expect((await expense(as.biller, 'lv-expenses', { description: '' })).status).toBe(400);
      expect((await expense(as.biller, 'lv-expenses', { expenseDate: 'yesterday' })).status).toBe(
        400,
      );
    });

    it('totals by category per direction; voided expenses excluded', async () => {
      await expense(as.biller, 'lv-expenses', { category: 'FUEL', amount: '5000' });
      await expense(as.biller, 'lv-expenses', { category: 'TOLL', amount: '1000' });
      await expense(as.biller, 'lv-expenses', { category: 'MAINTENANCE', amount: '2000' });
      await expense(as.biller, 'lv-expenses', { category: 'EMI', amount: '3000' });
      const v = await expense(as.biller, 'lv-expenses', { category: 'FUEL', amount: '99999' });
      await as.biller
        .post(`/api/lv-expenses/${v.body.data.id}/void`)
        .send({ reason: 'Duplicate bill' });

      const totals = (
        await as.auditor
          .get('/api/lv-expenses/totals')
          .query({ driverId: ravi.id, month: '2026-09' })
      ).body.data;
      const byCat = Object.fromEntries(totals.map((t) => [t.type, t.amount]));
      expect(byCat).toEqual({
        FUEL: '5000.00',
        TOLL: '1000.00',
        MAINTENANCE: '2000.00',
        EMI: '3000.00',
      });

      const byVehicle = await as.auditor
        .get('/api/lv-expenses')
        .query({ vehicleId: car.id, type: 'EMI' });
      expect(byVehicle.body.data).toHaveLength(1);
    });

    it('an LV expense cannot be voided through the driver-expenses endpoint', async () => {
      const lv = await expense(as.biller, 'lv-expenses');
      const res = await as.biller
        .post(`/api/driver-expenses/${lv.body.data.id}/void`)
        .send({ reason: 'wrong door' });
      expect(res.status).toBe(404);
    });

    it('RBAC: auditor views but cannot record either direction', async () => {
      expect((await expense(as.auditor, 'lv-expenses')).status).toBe(403);
      expect((await expense(as.auditor, 'driver-expenses')).status).toBe(403);
      expect((await as.auditor.get('/api/lv-expenses')).status).toBe(200);
    });
  });

  describe('advances and partial recovery (spec §25, scenario §80)', () => {
    const newAdvance = (body) =>
      as.biller.post('/api/advances').send({
        driverId: ravi.id,
        amount: '20000',
        advanceDate: '2026-06-01',
        reason: 'Family emergency',
        paymentMethod: 'UPI',
        referenceNumber: 'UPI-123',
        ...body,
      });
    const recover = (id, amount, settlementMonth) =>
      as.biller.post(`/api/advances/${id}/recoveries`).send({ amount, settlementMonth });

    it('scenario §80: ₹20,000 recovered 8,000 → 7,000 → 5,000; balance tracked; over-recovery refused', async () => {
      const { body } = await newAdvance();
      expect(body.data).toMatchObject({
        amount: '20000.00',
        recoveredAmount: '0.00',
        outstandingAmount: '20000.00',
        status: 'OPEN',
      });
      const id = body.data.id;

      let r = await recover(id, '8000', '2026-07');
      expect(r.body.data).toMatchObject({
        recoveredAmount: '8000.00',
        outstandingAmount: '12000.00',
        status: 'OPEN',
      });

      r = await recover(id, '7000', '2026-08');
      expect(r.body.data).toMatchObject({
        recoveredAmount: '15000.00',
        outstandingAmount: '5000.00',
      });

      const over = await recover(id, '5000.01', '2026-09');
      expect(over.status).toBe(409);
      expect(over.body.code).toBe('RECOVERY_EXCEEDS_OUTSTANDING');

      r = await recover(id, '5000', '2026-09');
      expect(r.body.data).toMatchObject({
        recoveredAmount: '20000.00',
        outstandingAmount: '0.00',
        status: 'RECOVERED',
      });
      expect(r.body.data.recoveries.map((x) => [x.settlementMonth, x.amount])).toEqual([
        ['2026-07', '8000.00'],
        ['2026-08', '7000.00'],
        ['2026-09', '5000.00'],
      ]);

      const more = await recover(id, '1', '2026-10');
      expect(more.body.code).toBe('ADVANCE_NOT_OPEN');
    });

    it('concurrent recoveries cannot exceed the outstanding balance', async () => {
      const { body } = await newAdvance({ amount: '10000' });
      const results = await Promise.all(
        ['4000', '4000', '4000', '4000'].map((a) => recover(body.data.id, a, '2026-09')),
      );
      expect(results.filter((x) => x.status === 200)).toHaveLength(2);
      const advance = await prisma.driverAdvance.findUnique({ where: { id: body.data.id } });
      expect(advance.outstandingAmount.toFixed(2)).toBe('2000.00');
      expect(advance.recoveredAmount.plus(advance.outstandingAmount).toFixed(2)).toBe('10000.00');
    });

    it('voiding a recovery restores the balance; an advance with recoveries cannot be voided', async () => {
      const { body } = await newAdvance();
      const after = (await recover(body.data.id, '20000', '2026-07')).body.data;
      expect(after.status).toBe('RECOVERED');

      const blocked = await as.biller
        .post(`/api/advances/${body.data.id}/void`)
        .send({ reason: 'Entered wrongly' });
      expect(blocked.body.code).toBe('ADVANCE_HAS_RECOVERIES');

      const v = await as.biller
        .post(`/api/advances/recoveries/${after.recoveries[0].id}/void`)
        .send({ reason: 'Wrong month' });
      expect(v.body.data).toMatchObject({ outstandingAmount: '20000.00', status: 'OPEN' });

      const ok = await as.biller
        .post(`/api/advances/${body.data.id}/void`)
        .send({ reason: 'Entered wrongly' });
      expect(ok.body.data).toMatchObject({ status: 'VOID', outstandingAmount: '0.00' });
    });

    it('validates advances: payment method, future date, amount, reason', async () => {
      expect((await newAdvance({ paymentMethod: 'CRYPTO' })).status).toBe(400);
      expect((await newAdvance({ advanceDate: '2099-01-01' })).status).toBe(400);
      expect((await newAdvance({ amount: '0' })).status).toBe(400);
      expect((await newAdvance({ reason: '' })).status).toBe(400);
    });

    it('summary and per-month recoveries', async () => {
      const a = (await newAdvance({ amount: '20000' })).body.data;
      await newAdvance({ amount: '5000' });
      await recover(a.id, '8000', '2026-09');
      const s = (await as.auditor.get('/api/advances/summary').query({ driverId: ravi.id })).body
        .data;
      expect(s).toMatchObject({
        count: 2,
        advanced: '25000.00',
        recovered: '8000.00',
        outstanding: '17000.00',
      });
      const rec = (
        await as.auditor
          .get('/api/advances/recoveries')
          .query({ driverId: ravi.id, month: '2026-09' })
      ).body.data;
      expect(rec.map((x) => x.amount)).toEqual(['8000.00']);
    });

    it('pure balance calculation', () => {
      const b = calculateAdvanceBalance('20000', ['8000', '7000.50']);
      expect([b.recovered.toFixed(2), b.outstanding.toFixed(2), b.status]).toEqual([
        '15000.50',
        '4999.50',
        'OPEN',
      ]);
    });

    it('RBAC: auditor cannot record advances or recoveries', async () => {
      const a = (await newAdvance()).body.data;
      expect(
        (
          await as.auditor.post('/api/advances').send({
            driverId: ravi.id,
            amount: '1',
            advanceDate: '2026-06-01',
            reason: 'x y z',
            paymentMethod: 'CASH',
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await as.auditor
            .post(`/api/advances/${a.id}/recoveries`)
            .send({ amount: '1', settlementMonth: '2026-09' })
        ).status,
      ).toBe(403);
    });
  });

  describe('other deductions (spec §26)', () => {
    it('every deduction records amount, reason, driver, settlement period, creator and date', async () => {
      const res = await as.biller.post('/api/adjustments').send({
        driverId: ravi.id,
        type: 'OTHER_DEDUCTION',
        amount: '2000',
        adjustmentDate: '2026-09-15',
        settlementMonth: '2026-09',
        reason: 'Previous overpayment',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        type: 'OTHER_DEDUCTION',
        amount: '2000.00',
        reason: 'Previous overpayment',
        settlementMonth: '2026-09',
        adjustmentDate: '2026-09-15',
        createdBy: { name: 'Test Biller' },
      });
      const unexplained = await as.biller.post('/api/adjustments').send({
        driverId: ravi.id,
        type: 'OTHER_DEDUCTION',
        amount: '2000',
        adjustmentDate: '2026-09-15',
      });
      expect(unexplained.status).toBe(400);
    });
  });
});
