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

describe('trips: KM × historical vehicle-type rate (spec §15–17, scenario §78)', () => {
  let as;
  let infosys;
  let wipro;
  let sedan;
  let car;
  let ravi;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    wipro = await makeCompany({ name: 'Wipro', code: 'WIPRO' });
    sedan = await makeVehicleType({ name: 'Sedan' });
    await makeRate(sedan.id, '18.00', '2026-01-01', '2026-03-31');
    await makeRate(sedan.id, '20.00', '2026-04-01');
    car = await makeVehicle(sedan.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
    await assignVehicle(car.id, infosys.id, '2026-01-01');
    await assignDriver(ravi.id, car.id, '2026-01-01');
  });
  afterAll(() => prisma.$disconnect());

  const trip = (overrides = {}) => ({
    companyId: infosys.id,
    driverId: ravi.id,
    vehicleId: car.id,
    tripDate: '2026-03-20',
    kmSource: 'DIRECT',
    totalKm: '100',
    ...overrides,
  });
  const create = (agent, overrides) => agent.post('/api/trips').send(trip(overrides));

  it('scenario §78: March 100 km × ₹18 = ₹1,800; April 100 km × ₹20 = ₹2,000', async () => {
    const march = await create(as.biller, { tripDate: '2026-03-20' });
    expect(march.status).toBe(201);
    expect(march.body.data.trip).toMatchObject({
      tripDate: '2026-03-20',
      settlementMonth: '2026-03',
      totalKm: '100.00',
      ratePerKm: '18.00',
      earnings: '1800.00',
      kmSource: 'DIRECT',
      source: 'MANUAL',
      vehicleType: { name: 'Sedan' },
    });
    expect(march.body.data.warnings).toEqual([]);

    const april = await create(as.biller, { tripDate: '2026-04-10' });
    expect(april.body.data.trip).toMatchObject({ ratePerKm: '20.00', earnings: '2000.00' });
  });

  it('scenario §78: introducing a new rate does NOT change the March trip', async () => {
    const march = (await create(as.biller, { tripDate: '2026-03-20' })).body.data.trip;
    const april = (await create(as.biller, { tripDate: '2026-04-10' })).body.data.trip;

    // "Updating the current rate": a new rate from 1 May supersedes ₹20.
    const r = await as.admin
      .post('/api/rates')
      .send({ vehicleTypeId: sedan.id, ratePerKm: '25', effectiveFrom: '2026-05-01' });
    expect(r.status).toBe(201);

    const m = await as.auditor.get(`/api/trips/${march.id}`);
    expect(m.body.data).toMatchObject({ ratePerKm: '18.00', earnings: '1800.00' });
    const a = await as.auditor.get(`/api/trips/${april.id}`);
    expect(a.body.data).toMatchObject({ ratePerKm: '20.00', earnings: '2000.00' });

    // A May trip uses the new rate.
    const may = await create(as.biller, { tripDate: '2026-05-02' });
    expect(may.body.data.trip.earnings).toBe('2500.00');
  });

  it('START_END: total = end − start, stored with its source', async () => {
    const res = await create(as.biller, {
      tripDate: '2026-04-10',
      kmSource: 'START_END',
      startKm: '12500',
      endKm: '12650',
      totalKm: undefined,
    });
    expect(res.body.data.trip).toMatchObject({
      kmSource: 'START_END',
      startKm: '12500.00',
      endKm: '12650.00',
      totalKm: '150.00',
      earnings: '3000.00',
    });
  });

  it('rejects invalid KM with field-level errors', async () => {
    const backwards = await create(as.biller, {
      kmSource: 'START_END',
      startKm: '12650',
      endKm: '12500',
    });
    expect(backwards.status).toBe(400);
    expect(backwards.body.details).toEqual([
      { path: 'endKm', message: 'End KM cannot be less than Start KM' },
    ]);

    const negative = await create(as.biller, { totalKm: '-10' });
    expect(negative.status).toBe(400);
    const missing = await create(as.biller, { kmSource: 'START_END', startKm: '10' });
    expect(missing.body.details.map((d) => d.path)).toEqual(['endKm']);
  });

  it('rejects a trip when no rate is effective on its date', async () => {
    const res = await create(as.biller, { tripDate: '2025-12-31' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RATE_NOT_FOUND');
    expect(res.body.message).toMatch(/Sedan.*2025-12-31/);
    expect(await prisma.trip.count()).toBe(0);
  });

  it('rejects future trip dates and unknown references', async () => {
    expect((await create(as.biller, { tripDate: '2099-01-01' })).status).toBe(400);
    const bad = await create(as.biller, { driverId: 999999 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_REFERENCE');
    expect(bad.body.details[0].path).toBe('driverId');
  });

  it('warns (but saves) when the vehicle/driver are not assigned on the trip date', async () => {
    const res = await create(as.biller, { companyId: wipro.id });
    expect(res.status).toBe(201);
    expect(res.body.data.warnings).toEqual([expect.stringMatching(/not assigned to Wipro/)]);
  });

  it('external trip ID is unique per company, not globally', async () => {
    expect((await create(as.biller, { externalTripId: 'INF-001' })).status).toBe(201);
    const dup = await create(as.biller, { externalTripId: 'INF-001' });
    expect(dup.status).toBe(409);
    expect(dup.body.details[0].path).toBe('externalTripId');
    expect(
      (await create(as.biller, { externalTripId: 'INF-001', companyId: wipro.id })).status,
    ).toBe(201);
  });

  it('preview computes without saving (formula stays on the server)', async () => {
    const res = await as.biller.post('/api/trips/preview').send(trip({ totalKm: '150.5' }));
    expect(res.body.data).toMatchObject({ totalKm: '150.50', earnings: '2709.00' });
    expect(res.body.data.rate.ratePerKm).toBe('18.00');
    expect(await prisma.trip.count()).toBe(0);
  });

  it('editing KM keeps the stored rate; changing the date re-applies the rate for the new date', async () => {
    const t = (await create(as.biller, { tripDate: '2026-03-20' })).body.data.trip;

    const km = await as.biller.patch(`/api/trips/${t.id}`).send({ totalKm: '200' });
    expect(km.body.data.trip).toMatchObject({ ratePerKm: '18.00', earnings: '3600.00' });

    const date = await as.biller.patch(`/api/trips/${t.id}`).send({ tripDate: '2026-04-05' });
    expect(date.body.data.trip).toMatchObject({
      ratePerKm: '20.00',
      earnings: '4000.00',
      settlementMonth: '2026-04',
    });
    expect(await prisma.auditLog.count({ where: { entityType: 'Trip', action: 'UPDATE' } })).toBe(
      2,
    );
  });

  it('a trip can still be edited after its rate was cancelled (keeps its stored rate)', async () => {
    const t = (await create(as.biller, { tripDate: '2026-03-20' })).body.data.trip;
    const cancel = await as.admin
      .post(`/api/rates/${t.rateId}/cancel`)
      .send({ reason: 'Wrong March rate' });
    expect(cancel.body.data.tripsUsingRate).toBe(1);

    const res = await as.biller.patch(`/api/trips/${t.id}`).send({ notes: 'checked' });
    expect(res.status).toBe(200);
    expect(res.body.data.trip).toMatchObject({
      ratePerKm: '18.00',
      earnings: '1800.00',
      notes: 'checked',
    });
  });

  it('cancelled trips drop out of totals and cannot be edited', async () => {
    const a = (await create(as.biller)).body.data.trip;
    await create(as.biller, { tripDate: '2026-04-10' });

    let s = (await as.auditor.get('/api/trips/summary')).body.data;
    expect(s).toMatchObject({ tripCount: 2, totalKm: '200.00', totalEarnings: '3800.00' });

    expect((await as.biller.post(`/api/trips/${a.id}/cancel`).send({})).status).toBe(400);
    const c = await as.biller.post(`/api/trips/${a.id}/cancel`).send({ reason: 'Duplicate entry' });
    expect(c.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Duplicate entry' });

    s = (await as.auditor.get('/api/trips/summary')).body.data;
    expect(s).toMatchObject({ tripCount: 1, totalEarnings: '2000.00' });
    expect((await as.biller.patch(`/api/trips/${a.id}`).send({ notes: 'x' })).status).toBe(409);
  });

  it('recalculation is explicit, Admin-only, reasoned and audited', async () => {
    const t = (await create(as.biller, { tripDate: '2026-03-20' })).body.data.trip;

    // The March rate was wrong: cancel it and enter the right one. The trip is unchanged…
    await as.admin.post(`/api/rates/${t.rateId}/cancel`).send({ reason: 'Should be 19' });
    await as.admin.post('/api/rates').send({
      vehicleTypeId: sedan.id,
      ratePerKm: '19',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
    });
    expect((await as.auditor.get(`/api/trips/${t.id}`)).body.data.earnings).toBe('1800.00');

    // …until an admin explicitly recalculates it.
    expect(
      (await as.biller.post(`/api/trips/${t.id}/recalculate`).send({ reason: 'fix' })).status,
    ).toBe(403);
    expect((await as.admin.post(`/api/trips/${t.id}/recalculate`).send({})).status).toBe(400);
    const res = await as.admin
      .post(`/api/trips/${t.id}/recalculate`)
      .send({ reason: 'Rate corrected to 19' });
    expect(res.body.data).toMatchObject({
      changed: true,
      trip: { ratePerKm: '19.00', earnings: '1900.00' },
    });

    const log = await prisma.auditLog.findFirst({ where: { action: 'RECALCULATE' } });
    expect(log.previousValue.earnings).toBe('1800.00');
    expect(log.newValue.earnings).toBe('1900.00');
    expect(log.reason).toBe('Rate corrected to 19');
  });

  it('bulk recalculation re-prices a vehicle type over a date range, atomically', async () => {
    await create(as.biller, { tripDate: '2026-02-01' });
    await create(as.biller, { tripDate: '2026-03-01' });
    await create(as.biller, { tripDate: '2026-04-10' });

    const rate18 = await prisma.vehicleTypeRate.findFirst({ where: { ratePerKm: '18.00' } });
    await as.admin.post(`/api/rates/${rate18.id}/cancel`).send({ reason: 'Should be 19' });
    await as.admin.post('/api/rates').send({
      vehicleTypeId: sedan.id,
      ratePerKm: '19',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-03-31',
    });

    const res = await as.admin.post('/api/trips/recalculate').send({
      vehicleTypeId: sedan.id,
      fromDate: '2026-01-01',
      toDate: '2026-04-30',
      reason: 'Q1 Sedan rate correction',
    });
    expect(res.body.data).toEqual({ examined: 3, changed: 2, unchanged: 1 });
    const s = (await as.auditor.get('/api/trips/summary').query({ month: '2026-03' })).body.data;
    expect(s.totalEarnings).toBe('1900.00');
  });

  it('superseding a rate reports trips still priced with the old rate', async () => {
    await create(as.biller, { tripDate: '2026-06-15' });
    const res = await as.admin
      .post('/api/rates')
      .send({ vehicleTypeId: sedan.id, ratePerKm: '21', effectiveFrom: '2026-06-01' });
    expect(res.body.data.tripsOnPreviousRate).toBe(1);
  });

  it('lists with filters, search, sort and pagination', async () => {
    await create(as.biller, {
      tripDate: '2026-03-20',
      externalTripId: 'A-1',
      pickup: 'Electronic City',
    });
    await create(as.biller, { tripDate: '2026-04-10', externalTripId: 'A-2', totalKm: '50' });
    await create(as.biller, { tripDate: '2026-04-11', companyId: wipro.id });

    const byCompany = await as.auditor.get('/api/trips').query({ companyId: infosys.id });
    expect(byCompany.body.data.map((t) => t.tripDate)).toEqual(['2026-04-10', '2026-03-20']);
    expect(byCompany.body.data[0]).toMatchObject({
      company: { name: 'Infosys' },
      driver: { fullName: 'Ravi' },
      vehicle: { registrationNumber: car.registrationNumber },
    });

    const search = await as.auditor.get('/api/trips').query({ search: 'electronic' });
    expect(search.body.data).toHaveLength(1);
    const april = await as.auditor.get('/api/trips').query({ month: '2026-04' });
    expect(april.body.meta.total).toBe(2);
    const range = await as.auditor
      .get('/api/trips')
      .query({ fromDate: '2026-04-11', toDate: '2026-04-30' });
    expect(range.body.meta.total).toBe(1);
    const sorted = await as.auditor.get('/api/trips').query({ sortBy: 'earnings', sortDir: 'asc' });
    expect(sorted.body.data[0].earnings).toBe('1000.00');
    const paged = await as.auditor.get('/api/trips').query({ pageSize: 2, page: 2 });
    expect(paged.body.data).toHaveLength(1);
  });

  it('RBAC: auditor can view but not create, edit or cancel', async () => {
    const t = (await create(as.biller)).body.data.trip;
    expect((await as.auditor.get('/api/trips')).status).toBe(200);
    expect((await create(as.auditor)).status).toBe(403);
    expect((await as.auditor.patch(`/api/trips/${t.id}`).send({ notes: 'x' })).status).toBe(403);
    expect(
      (await as.auditor.post(`/api/trips/${t.id}/cancel`).send({ reason: 'x y z' })).status,
    ).toBe(403);
  });
});
