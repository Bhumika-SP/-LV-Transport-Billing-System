import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { indianAmount } from '../../src/modules/reports/exporters.js';
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
const MONTH = '2026-09';

/** Binary responses as Buffers. */
const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe('reports and exports (spec §51, §65, §67)', () => {
  let as;
  let ravi;
  let infosys;

  beforeAll(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    const car = await makeVehicle(sedan.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
    const post = (agent, url, body = {}) => agent.post(url).send(body);
    for (const [km, day] of [
      ['100', '05'],
      ['50', '06'],
    ]) {
      await post(as.biller, '/api/trips', {
        companyId: infosys.id,
        driverId: ravi.id,
        vehicleId: car.id,
        tripDate: `${MONTH}-${day}`,
        kmSource: 'DIRECT',
        totalKm: km,
      });
    }
    await post(as.biller, '/api/lv-expenses', {
      driverId: ravi.id,
      vehicleId: car.id,
      category: 'FUEL',
      amount: '500',
      expenseDate: `${MONTH}-10`,
      description: 'Fuel',
    });
    const s = (
      await post(as.biller, '/api/settlements', { driverId: ravi.id, settlementMonth: MONTH })
    ).body.data;
    await post(as.biller, `/api/settlements/${s.id}/submit`);
    await post(as.admin, `/api/settlements/${s.id}/approve`);
    await post(as.admin, `/api/settlements/${s.id}/finalize`); // 3000 − 500 = 2500
    await post(as.biller, '/api/payments', {
      settlementId: s.id,
      amount: '1000',
      paymentDate: '2026-09-30',
      paymentMethod: 'UPI',
    });
    const cs = (
      await post(as.biller, '/api/company-settlements', {
        companyId: infosys.id,
        settlementMonth: MONTH,
        expectedAmount: '5000',
      })
    ).body.data;
    await post(as.biller, `/api/company-settlements/${cs.id}/receive`, {
      receivedAmount: '4800',
      receivedDate: '2026-09-30',
      paymentMethod: 'BANK_TRANSFER',
    });
  });
  afterAll(() => prisma.$disconnect());

  it('lists only the reports a role may run', async () => {
    const biller = (await as.biller.get('/api/reports')).body.data.map((r) => r.key);
    const auditor = (await as.auditor.get('/api/reports')).body.data.map((r) => r.key);
    expect(biller).toContain('trips');
    expect(biller).not.toContain('company-profit');
    expect(biller).not.toContain('company-reconciliation');
    expect(auditor).toEqual(
      expect.arrayContaining(['company-profit', 'company-reconciliation', 'driver-reconciliation']),
    );
  });

  it('trip report: rows and totals from real data, filterable', async () => {
    const r = (await as.biller.get('/api/reports/trips').query({ month: MONTH })).body.data;
    expect(r.rowCount).toBe(2);
    expect(r.rows[0]).toMatchObject({
      tripDate: '2026-09-05',
      driver: 'Ravi',
      company: 'Infosys',
      earnings: '2000.00',
    });
    expect(r.totals).toMatchObject({ totalKm: '150.00', earnings: '3000.00' });
    const none = (await as.biller.get('/api/reports/trips').query({ month: '2026-08' })).body.data;
    expect(none.rowCount).toBe(0);
  });

  it('driver reconciliation (§65): every component through to outstanding', async () => {
    const r = (await as.auditor.get('/api/reports/driver-reconciliation').query({ month: MONTH }))
      .body.data;
    expect(r.rows[0]).toMatchObject({
      driver: 'Ravi',
      grossEarnings: '3000.00',
      fuel: '500.00',
      finalAmount: '2500.00',
      paidAmount: '1000.00',
      outstanding: '1500.00',
      paymentStatus: 'PARTIALLY_PAID',
    });
  });

  it('company reconciliation (§65): expected, actual received, finalized settlement, LV profit', async () => {
    const r = (await as.auditor.get('/api/reports/company-reconciliation').query({ month: MONTH }))
      .body.data;
    expect(r.rows).toEqual([
      {
        settlementMonth: MONTH,
        company: 'Infosys',
        expectedAmount: '5000.00',
        receivedAmount: '4800.00',
        finalizedSettlements: '2500.00',
        lvProfit: '2300.00',
      },
    ]);
  });

  it('exports respect permissions exactly like the screens', async () => {
    expect((await as.biller.get('/api/reports/company-profit')).status).toBe(403);
    expect(
      (await as.biller.get('/api/reports/company-profit').query({ format: 'xlsx' })).status,
    ).toBe(403);
    expect((await as.auditor.get('/api/reports/nope')).status).toBe(404);
  });

  it('rejects invalid filters and formats', async () => {
    expect((await as.biller.get('/api/reports/trips').query({ month: '2026-13' })).status).toBe(
      400,
    );
    expect((await as.biller.get('/api/reports/trips').query({ format: 'docx' })).status).toBe(400);
  });

  it('CSV export: header, rows, totals, BOM', async () => {
    const res = await as.biller.get('/api/reports/trips').query({ month: MONTH, format: 'csv' });
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="trip-report-/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toMatch(/^"TOTAL"/);
    expect(lines[3]).toContain('"3000.00"');
  });

  it('Excel export: real workbook with numeric amounts', async () => {
    const res = await binary(
      as.auditor.get('/api/reports/driver-settlements').query({ month: MONTH, format: 'xlsx' }),
    );
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 2).toString()).toBe('PK');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    const values = [];
    ws.eachRow((row) => values.push(row.values));
    const dataRow = values.find((v) => v.includes('Ravi'));
    expect(dataRow).toContain(2500); // final settlement as a number cell
  });

  it('PDF export is a real PDF and exports are audited', async () => {
    const res = await binary(
      as.auditor.get('/api/reports/monthly-profit').query({ format: 'pdf' }),
    );
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    const audit = await prisma.auditLog.findMany({ where: { action: 'EXPORT' } });
    expect(audit.map((a) => a.entityId)).toEqual(
      expect.arrayContaining(['monthly-profit', 'driver-settlements', 'trips']),
    );
  });

  it('Indian amount formatting for exports', () => {
    expect(indianAmount('2500000.00')).toBe('25,00,000.00');
    expect(indianAmount('-150000.5')).toBe('-1,50,000.50');
  });
});
