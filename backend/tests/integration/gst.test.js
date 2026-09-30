import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { calculateGst } from '../../src/modules/gst/gst-calculations.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeCompany } from '../helpers/fixtures.js';

const app = createApp();
const f = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.toFixed ? v.toFixed(2) : v]));

describe('GST calculation (rates from data, never code)', () => {
  it('intra-state: 18% → CGST 9% + SGST 9%', () => {
    expect(
      f(calculateGst({ taxableValue: '100000', taxRate: '18', supplyType: 'INTRA_STATE' })),
    ).toEqual({
      taxableValue: '100000.00',
      cgst: '9000.00',
      sgst: '9000.00',
      igst: '0.00',
      cess: '0.00',
      totalTax: '18000.00',
      invoiceValue: '118000.00',
    });
  });

  it('inter-state: 5% → IGST; cess applied; paise rounded half-up', () => {
    const r = f(
      calculateGst({
        taxableValue: '1000.10',
        taxRate: '5',
        cessRate: '1',
        supplyType: 'INTER_STATE',
      }),
    );
    expect(r).toMatchObject({
      igst: '50.01',
      cgst: '0.00',
      cess: '10.00',
      totalTax: '60.01',
      invoiceValue: '1060.11',
    });
  });
});

describe('GST records and reports (spec §52, reporting/preparation only)', () => {
  let as;
  let infosys;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY', gstin: '29AABCI1234H1Z5' });
  });
  afterAll(() => prisma.$disconnect());

  const record = (agent, body = {}) =>
    agent.post('/api/gst/records').send({
      direction: 'OUTWARD',
      companyId: infosys.id,
      counterpartyName: 'Infosys',
      counterpartyGstin: '29AABCI1234H1Z5',
      invoiceNumber: 'LV/26-27/001',
      invoiceDate: '2026-09-30',
      hsnSac: '996601',
      taxableValue: '2500000',
      taxRate: '5',
      supplyType: 'INTRA_STATE',
      placeOfSupply: '29',
      ...body,
    });

  it('only Admin changes tax configuration; Auditor records GST; Biller has no GST access', async () => {
    const rate = {
      hsnSac: '996601',
      description: 'Passenger transport (rental with operator)',
      gstRate: '5',
      effectiveFrom: '2026-04-01',
    };
    expect((await as.auditor.post('/api/gst/tax-rates').send(rate)).status).toBe(403);
    expect((await as.biller.post('/api/gst/tax-rates').send(rate)).status).toBe(403);
    const created = await as.admin.post('/api/gst/tax-rates').send(rate);
    expect(created.status).toBe(201);
    expect(created.body.data.gstRate).toBe('5.00');

    expect((await record(as.auditor, { taxRateConfigId: created.body.data.id })).status).toBe(201);
    expect((await as.biller.get('/api/gst/records')).status).toBe(403);
    expect((await record(as.biller, { invoiceNumber: 'X' })).status).toBe(403);
  });

  it('computes tax on the server, derives the tax period and enforces invoice uniqueness', async () => {
    const r = await record(as.admin);
    expect(r.body.data).toMatchObject({
      taxPeriod: '2026-09',
      cgst: '62500.00',
      sgst: '62500.00',
      igst: '0.00',
      totalTax: '125000.00',
      invoiceValue: '2625000.00',
    });
    const dup = await record(as.admin);
    expect(dup.status).toBe(409);
    expect(dup.body.details[0].path).toBe('invoiceNumber');
    // Same number from a different supplier (inward) is a different invoice.
    expect(
      (
        await record(as.admin, {
          direction: 'INWARD',
          counterpartyName: 'Fuel Co',
          counterpartyGstin: '29AAACF1234K1Z2',
          companyId: undefined,
        })
      ).status,
    ).toBe(201);
  });

  it('validates GSTIN, HSN/SAC, state code and rate', async () => {
    const bad = await record(as.admin, {
      counterpartyGstin: 'NOTAGSTIN',
      hsnSac: 'AB',
      placeOfSupply: 'KA',
      taxRate: '150',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d) => d.path).sort()).toEqual([
      'counterpartyGstin',
      'hsnSac',
      'placeOfSupply',
      'taxRate',
    ]);
  });

  it('summary, GSTR-1 (B2B/B2C), GSTR-3B and HSN summary exclude void records', async () => {
    await record(as.admin); // B2B 25L @5% intra
    await record(as.admin, {
      invoiceNumber: 'LV/002',
      counterpartyGstin: undefined,
      counterpartyName: 'Walk-in',
      companyId: undefined,
      taxableValue: '10000',
      supplyType: 'INTER_STATE',
      placeOfSupply: '33',
    }); // B2C
    await record(as.admin, {
      direction: 'INWARD',
      invoiceNumber: 'F-1',
      counterpartyName: 'Fuel Co',
      counterpartyGstin: '29AAACF1234K1Z2',
      companyId: undefined,
      hsnSac: '2710',
      taxableValue: '100000',
      taxRate: '18',
    });
    await record(as.admin, {
      direction: 'INWARD',
      invoiceNumber: 'GTA-1',
      counterpartyName: 'Transporter',
      counterpartyGstin: '29AAACT1234K1Z9',
      companyId: undefined,
      taxableValue: '20000',
      reverseCharge: true,
    });
    const v = await record(as.admin, { invoiceNumber: 'LV/VOID', taxableValue: '999999' });
    await as.admin
      .post(`/api/gst/records/${v.body.data.id}/void`)
      .send({ reason: 'Raised in error' });

    const s = (await as.auditor.get('/api/gst/summary').query({ taxPeriod: '2026-09' })).body.data;
    expect(s.outward).toMatchObject({
      count: 2,
      taxableValue: '2510000.00',
      cgst: '62500.00',
      sgst: '62500.00',
      igst: '500.00',
    });
    expect(s.inward).toMatchObject({ count: 1, totalTax: '18000.00' });
    expect(s.reverseCharge).toMatchObject({ count: 1, totalTax: '1000.00' });
    expect(s.netTaxPayable).toBe('108500.00'); // 125500 + 1000 − 18000

    const g1 = (await as.auditor.get('/api/gst/gstr1').query({ taxPeriod: '2026-09' })).body.data;
    expect(g1.b2b.map((r) => r.invoiceNumber)).toEqual(['LV/26-27/001']);
    expect(g1.b2c[0]).toMatchObject({ placeOfSupply: '33', igst: '500.00' });

    const g3 = (await as.auditor.get('/api/gst/gstr3b').query({ taxPeriod: '2026-09' })).body.data;
    expect(g3['3.1(a) Outward taxable supplies'].taxableValue).toBe('2510000.00');
    expect(g3['3.1(d) Inward supplies liable to reverse charge'].taxableValue).toBe('20000.00');
    expect(g3['4(A)(5) All other ITC'].cgst).toBe('9000.00');

    const hsn = (
      await as.auditor
        .get('/api/gst/hsn-summary')
        .query({ taxPeriod: '2026-09', direction: 'OUTWARD' })
    ).body.data;
    expect(hsn.map((h) => [h.hsnSac, h.count])).toEqual([['996601', 2]]);
  });

  it('tax reconciliation compares amounts received with invoiced value per company', async () => {
    const cs = (
      await as.biller
        .post('/api/company-settlements')
        .send({ companyId: infosys.id, settlementMonth: '2026-09', expectedAmount: '2625000' })
    ).body.data;
    await as.biller.post(`/api/company-settlements/${cs.id}/receive`).send({
      receivedAmount: '2600000',
      receivedDate: '2026-09-30',
      paymentMethod: 'BANK_TRANSFER',
    });
    await record(as.admin);
    const rec = (await as.auditor.get('/api/gst/reconciliation').query({ taxPeriod: '2026-09' }))
      .body.data;
    expect(rec).toEqual([
      expect.objectContaining({
        company: 'Infosys',
        receivedAmount: '2600000.00',
        invoiceValue: '2625000.00',
        difference: '-25000.00',
      }),
    ]);
  });

  it('dashboard shows the GST section to Admin and Auditor only', async () => {
    const dash = (await as.auditor.get('/api/dashboard')).body.data;
    expect(dash.gst).toMatchObject({ netTaxPayable: '0.00' });
    expect((await as.biller.get('/api/dashboard')).body.data.gst).toBeUndefined();
  });

  it('GST registers are exportable through the report engine', async () => {
    await record(as.admin);
    const r = (
      await as.auditor.get('/api/reports/gst-invoice-register').query({ month: '2026-09' })
    ).body.data;
    expect(r.rowCount).toBe(1);
    expect(r.totals).toMatchObject({ taxableValue: '2500000.00', cgst: '62500.00' });
    const csv = await as.auditor
      .get('/api/reports/gst-hsn-summary')
      .query({ month: '2026-09', format: 'csv' });
    expect(csv.status).toBe(200);
    expect((await as.biller.get('/api/reports/gst-invoice-register')).status).toBe(403);
  });
});
