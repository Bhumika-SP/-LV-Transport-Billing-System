import ExcelJS from 'exceljs';
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

const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (lines) => Buffer.from(lines.map((l) => l.map(quote).join(',')).join('\n'));

async function xlsx(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trips');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('bulk trip import (spec §38–43)', () => {
  let as;
  let infosys;
  let wipro;
  let car;
  let car2;
  let ravi;
  let suresh;

  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    wipro = await makeCompany({ name: 'Wipro', code: 'WIPRO' });
    const sedan = await makeVehicleType({ name: 'Sedan' });
    await makeRate(sedan.id, '18.00', '2026-01-01', '2026-03-31');
    await makeRate(sedan.id, '20.00', '2026-04-01');
    car = await makeVehicle(sedan.id, { registrationNumber: 'KA01AB1234' });
    car2 = await makeVehicle(sedan.id, { registrationNumber: 'KA01AB5678' });
    ravi = await makeDriver({ fullName: 'Ravi Kumar', driverCode: 'DRV-0001' });
    suresh = await makeDriver({ fullName: 'Suresh', driverCode: 'DRV-0002' });
    await assignVehicle(car.id, infosys.id, '2026-01-01');
    await assignDriver(ravi.id, car.id, '2026-01-01');
    await assignDriver(suresh.id, car2.id, '2026-01-01');
  });
  afterAll(() => prisma.$disconnect());

  const infosysTemplate = (overrides = {}) => ({
    companyId: infosys.id,
    name: 'Infosys monthly sheet',
    dateFormat: 'DD/MM/YYYY',
    kmMode: 'START_END',
    driverMatchField: 'CODE',
    duplicateKey: ['externalTripId'],
    mappings: {
      driver: 'Driver Code',
      vehicle: 'Vehicle No',
      tripDate: 'Trip Date',
      externalTripId: 'Trip ID',
      pickup: 'Start Location',
      dropLocation: 'End Location',
      startKm: 'Start KM',
      endKm: 'End KM',
    },
    ...overrides,
  });

  const HEADER = [
    'Trip ID',
    'Driver Code',
    'Vehicle No',
    'Trip Date',
    'Start Location',
    'End Location',
    'Start KM',
    'End KM',
    'Shift',
  ];

  const upload = (agent, buffer, fileName, templateId, companyId = infosys.id) =>
    agent
      .post('/api/trip-imports')
      .field('companyId', String(companyId))
      .field('templateId', String(templateId))
      .attach('file', buffer, fileName);

  describe('templates', () => {
    it('requires the fields needed by the KM mode and a mapped duplicate key', async () => {
      const missingEnd = infosysTemplate();
      delete missingEnd.mappings.endKm;
      const r1 = await as.biller.post('/api/import-templates').send(missingEnd);
      expect(r1.status).toBe(400);
      expect(r1.body.details.map((d) => d.path)).toContain('mappings.endKm');

      const badKey = infosysTemplate({ duplicateKey: ['tripReference'] });
      const r2 = await as.biller.post('/api/import-templates').send(badKey);
      expect(r2.body.details.map((d) => d.path)).toContain('duplicateKey');
    });

    it('creates company-specific templates; names unique per company; auditor read-only', async () => {
      expect((await as.biller.post('/api/import-templates').send(infosysTemplate())).status).toBe(
        201,
      );
      expect((await as.biller.post('/api/import-templates').send(infosysTemplate())).status).toBe(
        409,
      );
      expect(
        (
          await as.biller
            .post('/api/import-templates')
            .send(infosysTemplate({ companyId: wipro.id }))
        ).status,
      ).toBe(201);
      expect(
        (await as.auditor.post('/api/import-templates').send(infosysTemplate({ name: 'x' })))
          .status,
      ).toBe(403);
      const list = await as.auditor.get('/api/import-templates').query({ companyId: infosys.id });
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].mappings.driver).toBe('Driver Code');
    });
  });

  it('inspect returns headers and sample rows without storing anything', async () => {
    const file = csv([
      HEADER,
      ['INF-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', 'A', 'B', '12500', '12650', 'Day'],
    ]);
    const res = await as.biller.post('/api/trip-imports/inspect').attach('file', file, 'march.csv');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ headers: HEADER, rowCount: 1 });
    expect(res.body.data.sampleRows[0].values['Trip ID']).toBe('INF-1');
    expect(await prisma.tripImport.count()).toBe(0);
  });

  it('validates every row, previews, then imports only valid rows in one transaction', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const file = csv([
      HEADER,
      ['INF-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', 'Campus', 'Home', '12500', '12650', 'Day'], // row 2 valid: 150 × 18
      [
        'INF-2',
        'drv-0001',
        'ka-01-ab-1234',
        '10/04/2026',
        'Campus',
        'Home',
        '12,650',
        '12,750',
        'Night',
      ], // row 3 valid: 100 × 20
      ['INF-3', 'DRV-9999', 'KA01AB1234', '11/04/2026', '', '', '1', '2', ''], // row 4 unknown driver
      ['INF-4', 'DRV-0001', 'XX99ZZ0000', '11/04/2026', '', '', '1', '2', ''], // row 5 invalid vehicle
      ['INF-5', 'DRV-0001', 'KA01AB1234', '', '', '', '1', '2', ''], // row 6 missing date
      ['INF-6', 'DRV-0001', 'KA01AB1234', '12/04/2026', '', '', '500', '400', ''], // row 7 end < start
      ['INF-7', 'DRV-0001', 'KA01AB1234', '15/12/2025', '', '', '1', '2', ''], // row 8 no rate
      ['INF-1', 'DRV-0001', 'KA01AB1234', '13/04/2026', '', '', '1', '2', ''], // row 9 duplicate of row 2
      ['INF-9', 'DRV-0002', 'KA01AB5678', '14/04/2026', '', '', '100', '160', ''], // row 10 warning: car2 not assigned to Infosys
      ['INF-10', 'DRV-0001', 'KA01AB1234', '31/02/2026', '', '', '1', '2', ''], // row 11 invalid date
    ]);

    const res = await upload(as.biller, file, 'infosys-apr.csv', t.id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'VALIDATED',
      totalRows: 10,
      validRows: 2,
      warningRows: 1,
      errorRows: 6,
      duplicateRows: 1,
      importedRows: 0,
    });
    expect(await prisma.trip.count()).toBe(0); // preview only

    const rows = (await as.auditor.get(`/api/trip-imports/${res.body.data.id}/rows`)).body.data;
    const msg = (n) =>
      rows
        .find((r) => r.rowNumber === n)
        .messages.map((m) => m.message)
        .join(' | ');
    expect(msg(4)).toMatch(/Unknown driver "DRV-9999"/);
    expect(msg(5)).toMatch(/Unknown vehicle "XX99ZZ0000"/);
    expect(msg(6)).toMatch(/Missing trip date/);
    expect(msg(7)).toMatch(/End KM cannot be less than Start KM/);
    expect(msg(8)).toMatch(/No Sedan rate is effective on 2025-12-15/);
    expect(msg(9)).toMatch(/repeats row 2/);
    expect(msg(10)).toMatch(/not assigned to this company/);
    expect(msg(11)).toMatch(/Invalid date "31\/02\/2026"/);

    const confirm = await as.biller.post(`/api/trip-imports/${res.body.data.id}/confirm`).send({});
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({ status: 'IMPORTED', importedRows: 3 });

    const trips = await prisma.trip.findMany({ orderBy: { tripDate: 'asc' } });
    expect(
      trips.map((x) => [
        x.externalTripId,
        x.totalKm.toFixed(2),
        x.ratePerKm.toFixed(2),
        x.earnings.toFixed(2),
      ]),
    ).toEqual([
      ['INF-1', '150.00', '18.00', '2700.00'],
      ['INF-2', '100.00', '20.00', '2000.00'],
      ['INF-9', '60.00', '20.00', '1200.00'],
    ]);
    expect(trips.every((x) => x.source === 'IMPORT' && x.importId === res.body.data.id)).toBe(true);
    expect(trips[0].extra).toEqual({ Shift: 'Day' }); // unmapped column kept

    expect(
      (await as.biller.post(`/api/trip-imports/${res.body.data.id}/confirm`).send({})).status,
    ).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'IMPORT' } })).toBe(1);
  });

  it('warnings can be excluded at confirm time', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const file = csv([
      HEADER,
      ['A-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', '', '', '0', '10', ''],
      ['A-2', 'DRV-0002', 'KA01AB5678', '20/03/2026', '', '', '0', '10', ''], // warning
    ]);
    const res = await upload(as.biller, file, 'a.csv', t.id);
    const confirm = await as.biller
      .post(`/api/trip-imports/${res.body.data.id}/confirm`)
      .send({ includeWarnings: false });
    expect(confirm.body.data.importedRows).toBe(1);
    expect(await prisma.trip.count()).toBe(1);
  });

  it('re-uploading the same file finds every row as a duplicate of existing trips', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const file = csv([
      HEADER,
      ['INF-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', '', '', '1', '101', ''],
    ]);
    const first = await upload(as.biller, file, 'a.csv', t.id);
    await as.biller.post(`/api/trip-imports/${first.body.data.id}/confirm`).send({});

    const again = await upload(as.biller, file, 'a.csv', t.id);
    expect(again.body.data).toMatchObject({ totalRows: 1, duplicateRows: 1, validRows: 0 });
    const confirm = await as.biller
      .post(`/api/trip-imports/${again.body.data.id}/confirm`)
      .send({});
    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('NOTHING_TO_IMPORT');
  });

  it('configurable composite duplicate key (no external IDs) matches manually entered trips', async () => {
    const t = (
      await as.biller.post('/api/import-templates').send(
        infosysTemplate({
          name: 'No trip id',
          kmMode: 'DIRECT',
          duplicateKey: ['tripDate', 'vehicle', 'driver', 'tripReference'],
          mappings: {
            driver: 'Driver Code',
            vehicle: 'Vehicle No',
            tripDate: 'Trip Date',
            tripReference: 'Ref',
            totalKm: 'KM',
          },
        }),
      )
    ).body.data;
    await as.biller.post('/api/trips').send({
      companyId: infosys.id,
      driverId: ravi.id,
      vehicleId: car.id,
      tripDate: '2026-04-10',
      tripReference: 'R1',
      kmSource: 'DIRECT',
      totalKm: '50',
    });
    const file = csv([
      ['Driver Code', 'Vehicle No', 'Trip Date', 'Ref', 'KM'],
      ['DRV-0001', 'KA01AB1234', '10/04/2026', 'r1', '50'], // same as manual trip (case-insensitive)
      ['DRV-0001', 'KA01AB1234', '10/04/2026', 'R2', '50'], // different reference: fine
    ]);
    const res = await upload(as.biller, file, 'b.csv', t.id);
    expect(res.body.data).toMatchObject({ duplicateRows: 1, validRows: 1 });
  });

  it('reads Excel files: date cells, numeric KM, DD-MMM-YYYY text dates, driver matched by name', async () => {
    const t = (
      await as.biller.post('/api/import-templates').send(
        infosysTemplate({
          name: 'Excel',
          dateFormat: 'DD-MMM-YYYY',
          kmMode: 'DIRECT',
          driverMatchField: 'NAME',
          mappings: {
            driver: 'Driver',
            vehicle: 'Cab',
            tripDate: 'Date',
            externalTripId: 'ID',
            totalKm: 'Kms',
          },
        }),
      )
    ).body.data;
    const file = await xlsx([
      ['ID', 'Driver', 'Cab', 'Date', 'Kms'],
      ['X-1', 'ravi  kumar', 'KA 01 AB 1234', new Date(Date.UTC(2026, 2, 20)), 150.5],
      ['X-2', 'Ravi Kumar', 'KA01AB1234', '10-Apr-2026', 100],
    ]);
    const res = await upload(as.biller, file, 'trips.xlsx', t.id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totalRows: 2, validRows: 2 });
    await as.biller.post(`/api/trip-imports/${res.body.data.id}/confirm`).send({});
    const trips = await prisma.trip.findMany({ orderBy: { tripDate: 'asc' } });
    expect(trips.map((x) => x.earnings.toFixed(2))).toEqual(['2709.00', '2000.00']);
  });

  it('import is all-or-nothing when the database fails mid-way', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const file = csv([
      HEADER,
      ['OK-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', '', '', '0', '10', ''],
      ['OK-2', 'DRV-0001', 'KA01AB1234', '21/03/2026', '', '', '0', '10', ''],
      ['BOOM', 'DRV-0001', 'KA01AB1234', '22/03/2026', '', '', '0', '10', ''],
    ]);
    const res = await upload(as.biller, file, 'c.csv', t.id);
    expect(res.body.data.validRows).toBe(3);

    // A temporary CHECK constraint makes MySQL reject the third insert.
    await prisma.$executeRawUnsafe(
      "ALTER TABLE trips ADD CONSTRAINT test_fail_import CHECK (external_trip_id <> 'BOOM')",
    );
    try {
      const confirm = await as.biller
        .post(`/api/trip-imports/${res.body.data.id}/confirm`)
        .send({});
      expect(confirm.status).toBe(500);
      expect(confirm.body.code).toBe('IMPORT_FAILED');
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE trips DROP CHECK test_fail_import');
    }
    expect(await prisma.trip.count()).toBe(0); // the two good rows were rolled back too
    const batch = await prisma.tripImport.findUnique({ where: { id: res.body.data.id } });
    expect(batch.status).toBe('FAILED');
    expect(batch.errorDetails).toMatch(/test_fail_import/);
  });

  it('error report CSV lists row number, problems and original values', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const file = csv([
      HEADER,
      ['E-1', 'DRV-9999', 'KA01AB1234', '20/03/2026', '=cmd()', '', '1', '2', ''],
      ['E-2', 'DRV-0001', 'KA01AB1234', '20/03/2026', '', '', '1', '2', ''],
    ]);
    const res = await upload(as.biller, file, 'd.csv', t.id);
    const report = await as.auditor.get(`/api/trip-imports/${res.body.data.id}/errors.csv`);
    expect(report.status).toBe(200);
    expect(report.headers['content-type']).toMatch(/text\/csv/);
    expect(report.headers['content-disposition']).toMatch(/attachment; filename="import-/);
    expect(report.text.charCodeAt(0)).toBe(0xfeff); // BOM for Excel
    const lines = report.text.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(2); // header + the one error row
    expect(lines[1]).toMatch(/^"2","ERROR","Unknown driver ""DRV-9999""","E-1","DRV-9999"/);
    expect(lines[1]).toContain(`"'=cmd()"`); // formula injection neutralized
  });

  it('rejects bad files, oversize files, missing columns and cross-company templates', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;

    const txt = await as.biller
      .post('/api/trip-imports/inspect')
      .attach('file', Buffer.from('a,b'), 'x.txt');
    expect(txt.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    const fake = await as.biller
      .post('/api/trip-imports/inspect')
      .attach('file', Buffer.from('not a zip'), 'x.xlsx');
    expect(fake.body.code).toBe('INVALID_FILE');
    const big = await as.biller
      .post('/api/trip-imports/inspect')
      .attach('file', Buffer.alloc(6 * 1024 * 1024, 'a'), 'big.csv');
    expect(big.status).toBe(413);

    const missing = await upload(
      as.biller,
      csv([
        ['Driver Code', 'Vehicle No'],
        ['DRV-0001', 'KA01AB1234'],
      ]),
      'm.csv',
      t.id,
    );
    expect(missing.body.code).toBe('MISSING_COLUMNS');

    const wrongCompany = await upload(as.biller, csv([HEADER]), 'w.csv', t.id, wipro.id);
    expect(wrongCompany.body.code).toBe('TEMPLATE_COMPANY_MISMATCH');
  });

  it('RBAC: auditor sees history but cannot upload, confirm or discard', async () => {
    const t = (await as.biller.post('/api/import-templates').send(infosysTemplate())).body.data;
    const res = await upload(
      as.biller,
      csv([HEADER, ['Z-1', 'DRV-0001', 'KA01AB1234', '20/03/2026', '', '', '1', '2', '']]),
      'z.csv',
      t.id,
    );
    expect((await upload(as.auditor, csv([HEADER]), 'z.csv', t.id)).status).toBe(403);
    expect(
      (await as.auditor.post(`/api/trip-imports/${res.body.data.id}/confirm`).send({})).status,
    ).toBe(403);
    expect((await as.auditor.get('/api/trip-imports')).body.data).toHaveLength(1);

    const discard = await as.biller.post(`/api/trip-imports/${res.body.data.id}/discard`);
    expect(discard.body.data.status).toBe('DISCARDED');
    expect(
      (await as.biller.post(`/api/trip-imports/${res.body.data.id}/confirm`).send({})).status,
    ).toBe(409);
  });
});
