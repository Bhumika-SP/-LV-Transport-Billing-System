import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeVehicleType } from '../helpers/fixtures.js';

const app = createApp();

describe('master data: companies, drivers, vehicles', () => {
  let as;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
  });
  afterAll(() => prisma.$disconnect());

  describe('companies', () => {
    const infosys = {
      name: 'Infosys',
      code: 'infy',
      gstin: '29aabci1234h1z5',
      contactPerson: 'Asha',
      phone: '+91 80 4116 7000',
    };

    it('biller creates a company; code and GSTIN are normalized; creation is audited', async () => {
      const res = await as.biller.post('/api/companies').send(infosys);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        code: 'INFY',
        phone: '+918041167000',
        gstin: '29AABCI1234H1Z5',
        status: 'ACTIVE',
      });
      expect(
        await prisma.auditLog.count({ where: { entityType: 'Company', action: 'CREATE' } }),
      ).toBe(1);
    });

    it('rejects a duplicate name with a field-level 409', async () => {
      await as.biller.post('/api/companies').send(infosys);
      const res = await as.biller.post('/api/companies').send({ ...infosys, code: 'OTHER' });
      expect(res.status).toBe(409);
      expect(res.body.details[0].path).toBe('name');
    });

    it('rejects an invalid GSTIN', async () => {
      const res = await as.biller.post('/api/companies').send({ name: 'Wipro', gstin: 'BAD' });
      expect(res.status).toBe(400);
      expect(res.body.details[0].path).toBe('gstin');
    });

    it('auditor can view but not create or edit', async () => {
      const created = await as.admin.post('/api/companies').send(infosys);
      expect((await as.auditor.get('/api/companies')).status).toBe(200);
      expect((await as.auditor.post('/api/companies').send({ name: 'X' })).status).toBe(403);
      expect(
        (await as.auditor.patch(`/api/companies/${created.body.data.id}`).send({ name: 'Y' }))
          .status,
      ).toBe(403);
    });

    it('PATCH changes only the fields sent (does not blank others)', async () => {
      const { body } = await as.biller.post('/api/companies').send(infosys);
      const res = await as.biller
        .patch(`/api/companies/${body.data.id}`)
        .send({ contactPerson: 'Ravi' });
      expect(res.body.data).toMatchObject({
        contactPerson: 'Ravi',
        code: 'INFY',
        phone: '+918041167000',
        gstin: '29AABCI1234H1Z5',
      });
    });

    it('empty string clears an optional field', async () => {
      const { body } = await as.biller.post('/api/companies').send(infosys);
      const res = await as.biller.patch(`/api/companies/${body.data.id}`).send({ gstin: '' });
      expect(res.body.data.gstin).toBeNull();
    });

    it('deactivation is audited as STATUS_CHANGE; list filters and searches', async () => {
      const a = await as.biller.post('/api/companies').send(infosys);
      await as.biller.post('/api/companies').send({ name: 'Wipro', code: 'WIPRO' });
      await as.biller.patch(`/api/companies/${a.body.data.id}`).send({ status: 'INACTIVE' });
      expect(await prisma.auditLog.count({ where: { action: 'STATUS_CHANGE' } })).toBe(1);

      const active = await as.biller.get('/api/companies').query({ status: 'ACTIVE' });
      expect(active.body.data.map((c) => c.name)).toEqual(['Wipro']);
      const search = await as.biller.get('/api/companies').query({ search: 'infy' });
      expect(search.body.data.map((c) => c.name)).toEqual(['Infosys']);
      const options = await as.biller.get('/api/companies/options');
      expect(options.body.data.map((c) => c.name)).toEqual(['Wipro']);
    });

    it('returns 404 COMPANY_NOT_FOUND for an unknown id', async () => {
      const res = await as.biller.get('/api/companies/999999');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMPANY_NOT_FOUND');
    });
  });

  describe('drivers', () => {
    const ravi = {
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      licenseNumber: 'ka0120190001234',
      joiningDate: '2025-06-01',
      bankAccountNumber: '123456789012',
      bankIfsc: 'sbin0001234',
    };

    it('auto-generates DRV-#### codes and normalizes licence/IFSC', async () => {
      const res = await as.biller.post('/api/drivers').send(ravi);
      expect(res.status).toBe(201);
      expect(res.body.data.driverCode).toBe(`DRV-${String(res.body.data.id).padStart(4, '0')}`);
      expect(res.body.data).toMatchObject({
        licenseNumber: 'KA0120190001234',
        bankIfsc: 'SBIN0001234',
        joiningDate: '2025-06-01',
      });
    });

    it('licence number is unique', async () => {
      await as.biller.post('/api/drivers').send(ravi);
      const res = await as.biller.post('/api/drivers').send({ ...ravi, fullName: 'Other' });
      expect(res.status).toBe(409);
      expect(res.body.details[0].path).toBe('licenseNumber');
    });

    it('filters by licence status, vehicle assignment and joining date', async () => {
      const day = (offset) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };
      const make = (n, licenseExpiryDate, joiningDate = '2025-06-01') =>
        as.biller.post('/api/drivers').send({
          fullName: `Driver ${n}`,
          phone: `98765432${n}0`,
          licenseNumber: `KA010000000${n}`,
          licenseExpiryDate,
          joiningDate,
        });
      await make(1, day(200));
      await make(2, day(10), '2026-02-01');
      await make(3, day(-5));
      const names = async (q) =>
        (await as.biller.get(`/api/drivers?${q}`)).body.data.map((d) => d.fullName).sort();

      expect(await names('search=98765 43210')).toEqual(['Driver 1']);
      expect(await names('licenceStatus=valid')).toEqual(['Driver 1']);
      expect(await names('licenceStatus=expiring')).toEqual(['Driver 2']);
      expect(await names('licenceStatus=expired')).toEqual(['Driver 3']);
      expect(await names('joinedFrom=2026-01-01')).toEqual(['Driver 2']);
      expect(await names('assigned=no')).toEqual(['Driver 1', 'Driver 2', 'Driver 3']);
      expect(await names('assigned=yes')).toEqual([]);
      const list = await as.biller.get('/api/drivers');
      expect(list.body.data[0]).toHaveProperty('currentVehicle', null);
    });

    it('masks bank account numbers in lists but not in detail', async () => {
      const { body } = await as.biller.post('/api/drivers').send(ravi);
      const list = await as.biller.get('/api/drivers');
      expect(list.body.data[0].bankAccountNumber).toBe('••••9012');
      const detail = await as.biller.get(`/api/drivers/${body.data.id}`);
      expect(detail.body.data.bankAccountNumber).toBe('123456789012');
    });

    it('rejects invalid dates and phone numbers', async () => {
      const res = await as.biller
        .post('/api/drivers')
        .send({ fullName: 'X', phone: 'abc', joiningDate: '2025-02-30' });
      expect(res.status).toBe(400);
      expect(res.body.details.map((d) => d.path).sort()).toEqual(['joiningDate', 'phone']);
    });
  });

  describe('vehicles', () => {
    it('normalizes registration numbers and enforces uniqueness', async () => {
      const type = await makeVehicleType();
      const res = await as.biller
        .post('/api/vehicles')
        .send({ registrationNumber: 'ka-01 ab 1234', vehicleTypeId: type.id, fuelType: 'DIESEL' });
      expect(res.status).toBe(201);
      expect(res.body.data.registrationNumber).toBe('KA01AB1234');

      const dup = await as.biller
        .post('/api/vehicles')
        .send({ registrationNumber: 'KA01AB1234', vehicleTypeId: type.id });
      expect(dup.status).toBe(409);
      expect(dup.body.details[0].path).toBe('registrationNumber');
    });

    it('requires an existing vehicle type', async () => {
      const res = await as.biller
        .post('/api/vehicles')
        .send({ registrationNumber: 'KA01AB9999', vehicleTypeId: 424242 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REFERENCE');
    });

    it('vehicle types: biller manages types; auditor cannot', async () => {
      expect((await as.biller.post('/api/vehicle-types').send({ name: 'SUV' })).status).toBe(201);
      expect((await as.auditor.post('/api/vehicle-types').send({ name: 'Innova' })).status).toBe(
        403,
      );
      const dup = await as.admin.post('/api/vehicle-types').send({ name: 'SUV' });
      expect(dup.status).toBe(409);
    });
  });
});
