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

const app = createApp();
const MONTH = '2026-09';

describe('driver settlement engine (spec §27–31, scenario §76)', () => {
  let as;
  let ravi;
  let suresh;
  let infosys;
  let car;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    car = await makeVehicle(sedan.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
    suresh = await makeDriver({ fullName: 'Suresh' });
    await assignVehicle(car.id, infosys.id, '2026-01-01');
    await assignDriver(ravi.id, car.id, '2026-01-01');
  });
  afterAll(() => prisma.$disconnect());

  const post = (agent, url, body = {}) => agent.post(url).send(body);
  const trip = (km, day = '10', driverId = ravi.id) =>
    post(as.biller, '/api/trips', {
      companyId: infosys.id,
      driverId,
      vehicleId: car.id,
      tripDate: `${MONTH}-${day}`,
      kmSource: 'DIRECT',
      totalKm: km,
    });
  const earning = (type, amount) =>
    post(as.biller, '/api/earnings', {
      driverId: ravi.id,
      type,
      amount,
      earningDate: `${MONTH}-20`,
      description: `${type} test`,
    });
  const adjustment = (type, amount) =>
    post(as.biller, '/api/adjustments', {
      driverId: ravi.id,
      type,
      amount,
      adjustmentDate: `${MONTH}-20`,
      reason: `${type} test`,
    });
  const expense = (resource, category, amount) =>
    post(as.biller, `/api/${resource}`, {
      driverId: ravi.id,
      vehicleId: car.id,
      category,
      amount,
      expenseDate: `${MONTH}-15`,
      description: `${category} test`,
    });

  /** Exactly the inputs of spec §76 for Driver 1. */
  async function scenario76() {
    await trip('5000', '05'); // 5000 × 20 = 100000
    await trip('2500', '06'); // 2500 × 20 = 50000  → trip earnings 150000
    await earning('ALLOWANCE', '5000');
    await earning('OTHER_EARNING', '2000');
    await adjustment('POSITIVE_ADJUSTMENT', '1000');
    await expense('driver-expenses', 'FUEL', '3000'); // reimbursement
    await expense('lv-expenses', 'FUEL', '5000');
    await expense('lv-expenses', 'TOLL', '2000');
    await expense('lv-expenses', 'MAINTENANCE', '3000');
    await expense('lv-expenses', 'EMI', '10000');
    const adv = await post(as.biller, '/api/advances', {
      driverId: ravi.id,
      amount: '20000',
      advanceDate: '2026-06-01',
      reason: 'Advance',
      paymentMethod: 'CASH',
    });
    await post(as.biller, `/api/advances/${adv.body.data.id}/recoveries`, {
      amount: '5000',
      settlementMonth: MONTH,
    });
    await adjustment('OTHER_DEDUCTION', '1000');
  }

  const create = () =>
    post(as.biller, '/api/settlements', { driverId: ravi.id, settlementMonth: MONTH });

  it('scenario §76: the backend calculates exactly ₹1,35,000 with every component and item', async () => {
    await scenario76();
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'CALCULATED',
      tripEarnings: '150000.00',
      allowances: '5000.00',
      otherEarnings: '2000.00',
      positiveAdjustments: '1000.00',
      reimbursements: '3000.00',
      fuel: '5000.00',
      toll: '2000.00',
      maintenance: '3000.00',
      emi: '10000.00',
      advanceRecovery: '5000.00',
      otherDeductions: '1000.00',
      grossEarnings: '158000.00',
      totalAdditions: '161000.00',
      totalDeductions: '26000.00',
      finalAmount: '135000.00',
      itemCount: 12,
    });

    const detail = (await as.auditor.get(`/api/settlements/${res.body.data.id}`)).body.data;
    expect(detail.isStale).toBe(false);
    const byComponent = (c) => detail.items.filter((i) => i.component === c);
    expect(byComponent('TRIP_EARNINGS').map((i) => i.amount)).toEqual(['100000.00', '50000.00']);
    expect(byComponent('REIMBURSEMENT')[0]).toMatchObject({
      direction: 'ADD',
      sourceType: 'EXPENSE',
      amount: '3000.00',
    });
    expect(byComponent('EMI')[0]).toMatchObject({ direction: 'DEDUCT', amount: '10000.00' });
    expect(byComponent('ADVANCE_RECOVERY')[0]).toMatchObject({
      direction: 'DEDUCT',
      sourceType: 'ADVANCE_RECOVERY',
    });
    expect(detail.components.map((c) => c.key)).toContain('otherDeductions');
  });

  it('excludes cancelled trips, voided items, other drivers and other months', async () => {
    await trip('100'); // 2000
    const t = (await trip('9999')).body.data.trip;
    await post(as.biller, `/api/trips/${t.id}/cancel`, { reason: 'Duplicate' });
    const e = (await earning('ALLOWANCE', '9999')).body.data;
    await post(as.biller, `/api/earnings/${e.id}/void`, { reason: 'Typo' });
    await trip('50', '11', suresh.id);
    await post(as.biller, '/api/earnings', {
      driverId: ravi.id,
      type: 'ALLOWANCE',
      amount: '777',
      earningDate: '2026-08-31',
      description: 'August',
    });

    const res = await create();
    expect(res.body.data).toMatchObject({
      tripEarnings: '2000.00',
      allowances: '0.00',
      finalAmount: '2000.00',
      itemCount: 1,
    });
  });

  it('full workflow: biller prepares and submits; only admin approves and finalizes', async () => {
    await scenario76();
    const id = (await create()).body.data.id;

    expect((await post(as.biller, `/api/settlements/${id}/approve`)).status).toBe(403);
    expect((await post(as.biller, `/api/settlements/${id}/finalize`)).status).toBe(403);
    expect((await post(as.auditor, `/api/settlements/${id}/submit`)).status).toBe(403);

    // Invalid transitions are refused regardless of role.
    const early = await post(as.admin, `/api/settlements/${id}/finalize`);
    expect(early.body.code).toBe('INVALID_SETTLEMENT_TRANSITION');

    expect((await post(as.biller, `/api/settlements/${id}/submit`)).body.data.status).toBe(
      'UNDER_REVIEW',
    );
    expect((await post(as.biller, `/api/settlements/${id}/approve`)).status).toBe(403);
    expect((await post(as.admin, `/api/settlements/${id}/approve`)).body.data.status).toBe(
      'APPROVED',
    );
    const fin = await post(as.admin, `/api/settlements/${id}/finalize`);
    expect(fin.body.data).toMatchObject({
      status: 'FINALIZED',
      paymentStatus: 'UNPAID',
      finalAmount: '135000.00',
    });

    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: 'DriverSettlement' },
        orderBy: { id: 'asc' },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(['CREATE', 'SUBMIT', 'APPROVE', 'FINALIZE']);
  });

  it('changing data after calculation makes the settlement DRAFT; stale ones cannot be submitted', async () => {
    await trip('100');
    const id = (await create()).body.data.id;
    await earning('ALLOWANCE', '500'); // data changes after calculation

    let s = (await as.auditor.get(`/api/settlements/${id}`)).body.data;
    expect(s.status).toBe('DRAFT');
    const submit = await post(as.biller, `/api/settlements/${id}/submit`);
    expect(submit.body.code).toBe('INVALID_SETTLEMENT_TRANSITION');

    const recalculated = await post(as.biller, `/api/settlements/${id}/calculate`);
    expect(recalculated.body.data).toMatchObject({ status: 'CALCULATED', finalAmount: '2500.00' });
    s = (await as.auditor.get(`/api/settlements/${id}`)).body.data;
    expect(s.isStale).toBe(false);
  });

  it('data is locked while under review / approved / finalized (all sources, including import)', async () => {
    await trip('100');
    const id = (await create()).body.data.id;
    await post(as.biller, `/api/settlements/${id}/submit`);

    const underReview = await earning('ALLOWANCE', '1');
    expect(underReview.status).toBe(409);
    expect(underReview.body.code).toBe('SETTLEMENT_IN_REVIEW');

    await post(as.admin, `/api/settlements/${id}/approve`);
    await post(as.admin, `/api/settlements/${id}/finalize`);

    const checks = [
      await trip('10', '12'),
      await earning('ALLOWANCE', '1'),
      await adjustment('OTHER_DEDUCTION', '1'),
      await expense('lv-expenses', 'FUEL', '1'),
      await expense('driver-expenses', 'FUEL', '1'),
    ];
    for (const r of checks) expect(r.body.code).toBe('SETTLEMENT_LOCKED');

    const existingTrip = await prisma.trip.findFirst({ where: { driverId: ravi.id } });
    expect(
      (await post(as.biller, `/api/trips/${existingTrip.id}/cancel`, { reason: 'try' })).body.code,
    ).toBe('SETTLEMENT_LOCKED');
    expect(
      (await as.biller.patch(`/api/trips/${existingTrip.id}`).send({ totalKm: '5' })).body.code,
    ).toBe('SETTLEMENT_LOCKED');

    // Other months and other drivers are unaffected.
    expect((await trip('10', '12', suresh.id)).status).toBe(201);
    expect(
      (
        await post(as.biller, '/api/earnings', {
          driverId: ravi.id,
          type: 'ALLOWANCE',
          amount: '1',
          earningDate: '2026-08-10',
          description: 'August',
        })
      ).status,
    ).toBe(201);

    // Import rows for the locked month are rejected at validation.
    const template = await post(as.biller, '/api/import-templates', {
      companyId: infosys.id,
      name: 'T',
      dateFormat: 'YYYY-MM-DD',
      kmMode: 'DIRECT',
      driverMatchField: 'NAME',
      duplicateKey: ['tripDate', 'vehicle', 'driver'],
      mappings: { driver: 'Driver', vehicle: 'Vehicle', tripDate: 'Date', totalKm: 'KM' },
    });
    const csv = Buffer.from(
      `Driver,Vehicle,Date,KM\nRavi,${car.registrationNumber},${MONTH}-20,10\n`,
    );
    const batch = await as.biller
      .post('/api/trip-imports')
      .field('companyId', String(infosys.id))
      .field('templateId', String(template.body.data.id))
      .attach('file', csv, 'x.csv');
    expect(batch.body.data.errorRows).toBe(1);
    const rows = (await as.biller.get(`/api/trip-imports/${batch.body.data.id}/rows`)).body.data;
    expect(rows[0].messages[0].message).toMatch(/settlement is finalized/);
  });

  it('reopen: admin only, reason required, finalized state preserved, full cycle required again', async () => {
    await trip('100');
    const id = (await create()).body.data.id;
    for (const [who, step] of [
      ['biller', 'submit'],
      ['admin', 'approve'],
      ['admin', 'finalize'],
    ]) {
      await post(as[who], `/api/settlements/${id}/${step}`);
    }

    expect(
      (await post(as.biller, `/api/settlements/${id}/reopen`, { reason: 'Missed allowance' }))
        .status,
    ).toBe(403);
    expect((await post(as.admin, `/api/settlements/${id}/reopen`, {})).status).toBe(400);

    const reopened = await post(as.admin, `/api/settlements/${id}/reopen`, {
      reason: 'Missed night allowance',
    });
    expect(reopened.body.data).toMatchObject({
      status: 'DRAFT',
      version: 2,
      reopenCount: 1,
      paymentStatus: null,
    });

    const detail = (await as.auditor.get(`/api/settlements/${id}`)).body.data;
    expect(detail.revisions).toHaveLength(1);
    expect(detail.revisions[0]).toMatchObject({
      version: 1,
      reason: 'Missed night allowance',
      reopenedBy: { name: 'Test Admin' },
    });
    expect(detail.revisions[0].snapshot.settlement).toMatchObject({
      status: 'FINALIZED',
      finalAmount: '2000.00',
    });
    expect(detail.revisions[0].snapshot.items).toHaveLength(1);

    // Data can change again; the cycle must be repeated before finalizing.
    expect((await earning('ALLOWANCE', '500')).status).toBe(201);
    expect((await post(as.admin, `/api/settlements/${id}/finalize`)).body.code).toBe(
      'INVALID_SETTLEMENT_TRANSITION',
    );
    await post(as.biller, `/api/settlements/${id}/calculate`);
    await post(as.biller, `/api/settlements/${id}/submit`);
    await post(as.admin, `/api/settlements/${id}/approve`);
    const refinal = await post(as.admin, `/api/settlements/${id}/finalize`);
    expect(refinal.body.data).toMatchObject({
      status: 'FINALIZED',
      finalAmount: '2500.00',
      version: 2,
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'REOPEN', reason: 'Missed night allowance' },
      }),
    ).toBe(1);
  });

  it('admin can reject a settlement back to draft with a reason; biller can withdraw', async () => {
    await trip('100');
    const id = (await create()).body.data.id;
    await post(as.biller, `/api/settlements/${id}/submit`);
    expect((await post(as.admin, `/api/settlements/${id}/reject`, {})).status).toBe(400);
    const r = await post(as.admin, `/api/settlements/${id}/reject`, { reason: 'EMI missing' });
    expect(r.body.data.status).toBe('DRAFT');

    await post(as.biller, `/api/settlements/${id}/calculate`);
    await post(as.biller, `/api/settlements/${id}/submit`);
    const w = await post(as.biller, `/api/settlements/${id}/withdraw`);
    expect(w.body.data.status).toBe('DRAFT');
  });

  it('a negative settlement cannot be finalized (carry forward instead)', async () => {
    await trip('10'); // 200
    await expense('lv-expenses', 'EMI', '3000');
    const id = (await create()).body.data.id;
    expect((await as.auditor.get(`/api/settlements/${id}`)).body.data.finalAmount).toBe('-2800.00');
    await post(as.biller, `/api/settlements/${id}/submit`);
    await post(as.admin, `/api/settlements/${id}/approve`);
    const fin = await post(as.admin, `/api/settlements/${id}/finalize`);
    expect(fin.body.code).toBe('NEGATIVE_SETTLEMENT');
  });

  it('one settlement per driver per month; no future months', async () => {
    await trip('10');
    expect((await create()).status).toBe(201);
    const dup = await create();
    expect(dup.status).toBe(409);
    expect(dup.body.details[0].path).toBe('settlementMonth');
    const future = await post(as.biller, '/api/settlements', {
      driverId: ravi.id,
      settlementMonth: '2099-01',
    });
    expect(future.status).toBe(400);
  });

  it('prepare month: creates calculated drafts for every driver with activity', async () => {
    await trip('100');
    await trip('50', '11', suresh.id);
    const lonely = await makeDriver({ fullName: 'No activity' });
    const res = await post(as.biller, '/api/settlements/prepare', { settlementMonth: MONTH });
    expect(res.body.data).toEqual({ created: 2, recalculated: 0, skipped: 0 });
    const again = await post(as.biller, '/api/settlements/prepare', { settlementMonth: MONTH });
    expect(again.body.data).toEqual({ created: 0, recalculated: 2, skipped: 0 });
    expect(await prisma.driverSettlement.count({ where: { driverId: lonely.id } })).toBe(0);

    const list = await as.auditor.get('/api/settlements').query({ month: MONTH });
    expect(list.body.data.map((s) => s.finalAmount).sort()).toEqual(['1000.00', '2000.00']);
  });
});
