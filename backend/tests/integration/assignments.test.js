import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import {
  assignDriver,
  assignVehicle,
  makeCompany,
  makeDriver,
  makeVehicle,
  makeVehicleType,
} from '../helpers/fixtures.js';

const app = createApp();

describe('assignments (historical, effective-dated)', () => {
  let as;
  let infosys;
  let wipro;
  let car;
  let ravi;
  let suresh;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    wipro = await makeCompany({ name: 'Wipro', code: 'WIPRO' });
    const type = await makeVehicleType();
    car = await makeVehicle(type.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
    suresh = await makeDriver({ fullName: 'Suresh' });
  });
  afterAll(() => prisma.$disconnect());

  const assignVehicleApi = (agent, body) =>
    agent.post('/api/assignments/vehicles').send({ vehicleId: car.id, ...body });

  it('a vehicle can move between companies over time (history kept)', async () => {
    const a1 = await assignVehicleApi(as.biller, {
      companyId: infosys.id,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });
    expect(a1.status).toBe(201);
    const a2 = await assignVehicleApi(as.biller, { companyId: wipro.id, startDate: '2026-07-01' });
    expect(a2.status).toBe(201);

    const history = await as.auditor.get(`/api/vehicles/${car.id}/assignments`);
    expect(history.body.data.companies.map((c) => c.company.name)).toEqual(['Wipro', 'Infosys']);
  });

  it('rejects overlapping company assignments for a vehicle by default', async () => {
    await assignVehicleApi(as.biller, { companyId: infosys.id, startDate: '2026-01-01' });
    const res = await assignVehicleApi(as.biller, { companyId: wipro.id, startDate: '2026-03-01' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_OVERLAP');
  });

  it('ending an assignment allows the next one; end date must follow start date', async () => {
    const a1 = await assignVehicleApi(as.biller, {
      companyId: infosys.id,
      startDate: '2026-01-01',
    });
    const bad = await as.biller
      .patch(`/api/assignments/vehicles/${a1.body.data.id}`)
      .send({ endDate: '2025-12-31' });
    expect(bad.status).toBe(400);

    const ended = await as.biller
      .patch(`/api/assignments/vehicles/${a1.body.data.id}`)
      .send({ endDate: '2026-02-28' });
    expect(ended.status).toBe(200);
    expect(ended.body.data.endDate).toBe('2026-02-28');

    const next = await assignVehicleApi(as.biller, {
      companyId: wipro.id,
      startDate: '2026-03-01',
    });
    expect(next.status).toBe(201);
  });

  it('one driver per vehicle and one vehicle per driver by default; configurable by admin', async () => {
    const first = await as.biller
      .post('/api/assignments/drivers')
      .send({ driverId: ravi.id, vehicleId: car.id, startDate: '2026-01-01' });
    expect(first.status).toBe(201);

    const second = await as.biller
      .post('/api/assignments/drivers')
      .send({ driverId: suresh.id, vehicleId: car.id, startDate: '2026-01-01' });
    expect(second.status).toBe(409);

    // Biller cannot change the rule; admin can.
    const key = 'assignments.allowConcurrentDriversPerVehicle';
    expect((await as.biller.patch(`/api/settings/${key}`).send({ value: true })).status).toBe(403);
    expect((await as.admin.patch(`/api/settings/${key}`).send({ value: true })).status).toBe(200);

    const shift = await as.biller
      .post('/api/assignments/drivers')
      .send({ driverId: suresh.id, vehicleId: car.id, startDate: '2026-01-01' });
    expect(shift.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { entityType: 'Setting' } })).toBe(1);
  });

  it('settings reject values of the wrong type and unknown keys', async () => {
    const key = 'assignments.allowConcurrentDriversPerVehicle';
    expect((await as.admin.patch(`/api/settings/${key}`).send({ value: 'yes' })).status).toBe(400);
    expect((await as.admin.patch('/api/settings/nope').send({ value: true })).status).toBe(404);
  });

  it('cannot assign an inactive driver', async () => {
    await prisma.driver.update({ where: { id: ravi.id }, data: { status: 'INACTIVE' } });
    const res = await as.biller
      .post('/api/assignments/drivers')
      .send({ driverId: ravi.id, vehicleId: car.id, startDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INACTIVE_REFERENCE');
  });

  it('company drivers are derived through vehicle and driver assignments', async () => {
    await assignVehicle(car.id, infosys.id, '2026-01-01', '2026-06-30');
    await assignVehicle(car.id, wipro.id, '2026-07-01');
    await assignDriver(ravi.id, car.id, '2026-03-01');

    const infy = await as.auditor.get(`/api/companies/${infosys.id}/drivers`);
    expect(infy.body.data).toHaveLength(1);
    expect(infy.body.data[0]).toMatchObject({
      driver: { fullName: 'Ravi' },
      startDate: '2026-03-01',
      endDate: '2026-06-30',
    });
    const wip = await as.auditor.get(`/api/companies/${wipro.id}/drivers`);
    expect(wip.body.data[0]).toMatchObject({ startDate: '2026-07-01', endDate: null });
  });

  it('concurrent overlapping assignment requests: exactly one succeeds', async () => {
    const results = await Promise.all(
      [infosys.id, wipro.id, infosys.id].map((companyId) =>
        assignVehicleApi(as.biller, { companyId, startDate: '2026-01-01' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.vehicleAssignment.count()).toBe(1);
  });

  it('auditor cannot create assignments', async () => {
    const res = await assignVehicleApi(as.auditor, {
      companyId: infosys.id,
      startDate: '2026-01-01',
    });
    expect(res.status).toBe(403);
  });
});
