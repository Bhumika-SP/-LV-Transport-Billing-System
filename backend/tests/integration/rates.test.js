import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { resolveRate } from '../../src/modules/rates/rates.service.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeVehicleType } from '../helpers/fixtures.js';

const app = createApp();

describe('vehicle type rate history (spec §14, scenario §78)', () => {
  let as;
  let sedan;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    sedan = await makeVehicleType({ name: 'Sedan' });
  });
  afterAll(() => prisma.$disconnect());

  const addRate = (agent, body) =>
    agent.post('/api/rates').send({ vehicleTypeId: sedan.id, ...body });

  it('₹18 until 31 Mar, ₹20 from 1 Apr: adding the new rate closes the old one', async () => {
    const r18 = await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    expect(r18.status).toBe(201);

    const r20 = await addRate(as.admin, { ratePerKm: 20, effectiveFrom: '2026-04-01' });
    expect(r20.status).toBe(201);
    expect(r20.body.data.closedPrevious).toMatchObject({
      id: r18.body.data.rate.id,
      ratePerKm: '18.00',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
    });

    expect((await resolveRate(sedan.id, '2026-03-20')).ratePerKm.toFixed(2)).toBe('18.00');
    expect((await resolveRate(sedan.id, '2026-03-31')).ratePerKm.toFixed(2)).toBe('18.00');
    expect((await resolveRate(sedan.id, '2026-04-01')).ratePerKm.toFixed(2)).toBe('20.00');
    expect((await resolveRate(sedan.id, '2026-04-10')).ratePerKm.toFixed(2)).toBe('20.00');
    expect(await resolveRate(sedan.id, '2025-12-31')).toBeNull();

    // The old rate row is preserved (never overwritten), and the closure was audited.
    const history = await as.auditor.get('/api/rates').query({ vehicleTypeId: sedan.id });
    expect(history.body.data.map((r) => r.ratePerKm)).toEqual(['20.00', '18.00']);
    const closure = await prisma.auditLog.findFirst({
      where: { entityType: 'VehicleTypeRate', action: 'UPDATE' },
    });
    expect(closure.reason).toMatch(/superseded/);
  });

  it('resolve endpoint returns the rate effective on a date', async () => {
    await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    await addRate(as.admin, { ratePerKm: '20', effectiveFrom: '2026-04-01' });
    const res = await as.biller
      .get('/api/rates/resolve')
      .query({ vehicleTypeId: sedan.id, date: '2026-03-20' });
    expect(res.body.data.ratePerKm).toBe('18.00');
  });

  it('rejects a bounded rate that overlaps an existing rate', async () => {
    await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    const res = await addRate(as.admin, {
      ratePerKm: '25',
      effectiveFrom: '2026-02-01',
      effectiveTo: '2026-02-28',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RATE_PERIOD_OVERLAP');
    // Nothing changed: the transaction rolled back.
    expect((await resolveRate(sedan.id, '2026-02-15')).ratePerKm.toFixed(2)).toBe('18.00');
  });

  it('rejects a new open-ended rate that starts on or before the current one', async () => {
    await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-04-01' });
    const res = await addRate(as.admin, { ratePerKm: '17', effectiveFrom: '2026-04-01' });
    expect(res.status).toBe(409);
    const earlier = await addRate(as.admin, { ratePerKm: '17', effectiveFrom: '2026-01-01' });
    expect(earlier.status).toBe(409);
  });

  it('allows a bounded historical rate that fills a gap', async () => {
    await addRate(as.admin, { ratePerKm: '20', effectiveFrom: '2026-04-01' });
    const res = await addRate(as.admin, {
      ratePerKm: '18',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
    });
    expect(res.status).toBe(201);
    expect((await resolveRate(sedan.id, '2026-02-01')).ratePerKm.toFixed(2)).toBe('18.00');
  });

  it('validates amount and period', async () => {
    const zero = await addRate(as.admin, { ratePerKm: '0', effectiveFrom: '2026-01-01' });
    expect(zero.status).toBe(400);
    const negative = await addRate(as.admin, { ratePerKm: '-5', effectiveFrom: '2026-01-01' });
    expect(negative.status).toBe(400);
    const backwards = await addRate(as.admin, {
      ratePerKm: '18',
      effectiveFrom: '2026-05-01',
      effectiveTo: '2026-04-01',
    });
    expect(backwards.status).toBe(400);
    expect(backwards.body.details[0].path).toBe('effectiveTo');
  });

  it('only Admin/Manager may add or cancel rates (backend-enforced)', async () => {
    expect(
      (await addRate(as.biller, { ratePerKm: '18', effectiveFrom: '2026-01-01' })).status,
    ).toBe(403);
    expect(
      (await addRate(as.auditor, { ratePerKm: '18', effectiveFrom: '2026-01-01' })).status,
    ).toBe(403);
    const r = await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    const cancel = await as.biller
      .post(`/api/rates/${r.body.data.rate.id}/cancel`)
      .send({ reason: 'typo' });
    expect(cancel.status).toBe(403);
  });

  it('there is no way to edit a rate in place', async () => {
    const r = await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    const res = await as.admin.patch(`/api/rates/${r.body.data.rate.id}`).send({ ratePerKm: '19' });
    expect(res.status).toBe(404);
  });

  it('cancelling requires a reason, keeps the row, and stops it resolving', async () => {
    const r = await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2026-01-01' });
    const id = r.body.data.rate.id;
    expect((await as.admin.post(`/api/rates/${id}/cancel`).send({})).status).toBe(400);

    const res = await as.admin.post(`/api/rates/${id}/cancel`).send({ reason: 'Entered in error' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Entered in error' });
    expect(await resolveRate(sedan.id, '2026-02-01')).toBeNull();
    expect(await prisma.vehicleTypeRate.count()).toBe(1);

    // A cancelled period no longer blocks a corrected rate.
    const fixed = await addRate(as.admin, { ratePerKm: '18.50', effectiveFrom: '2026-01-01' });
    expect(fixed.status).toBe(201);
  });

  it('concurrent rate creation cannot produce overlapping active rates', async () => {
    const results = await Promise.all(
      ['2026-01-01', '2026-01-01', '2026-01-01'].map((from) =>
        addRate(as.admin, { ratePerKm: '18', effectiveFrom: from, effectiveTo: '2026-12-31' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.vehicleTypeRate.count({ where: { status: 'ACTIVE' } })).toBe(1);
  });

  it('vehicle type list shows the current rate', async () => {
    await addRate(as.admin, { ratePerKm: '18', effectiveFrom: '2020-01-01' });
    const res = await as.biller.get('/api/vehicle-types');
    expect(res.body.data[0].currentRate.ratePerKm).toBe('18.00');
  });
});
