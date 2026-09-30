import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { runScheduledChecks } from '../../src/modules/notifications/events.js';
import { detectFileType } from '../../src/utils/file-type.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeCompany, makeDriver } from '../helpers/fixtures.js';

const app = createApp();

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const FAKE_PDF = Buffer.from('<html><script>alert(1)</script></html>');

describe('file type detection (magic bytes, never the client MIME type)', () => {
  it('recognises PDF/PNG and rejects everything else', () => {
    expect(detectFileType(PDF)?.mime).toBe('application/pdf');
    expect(detectFileType(PNG)?.mime).toBe('image/png');
    expect(detectFileType(FAKE_PDF)).toBeNull();
    expect(detectFileType(Buffer.alloc(3))).toBeNull();
  });
});

describe('documents (spec §53)', () => {
  let as;
  let driver;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    driver = await makeDriver({ fullName: 'Ravi' });
  });
  afterAll(() => prisma.$disconnect());

  const upload = (
    agent,
    {
      entityType = 'DRIVER',
      entityId,
      file = PDF,
      name = 'licence.pdf',
      type = 'application/pdf',
    } = {},
  ) =>
    agent
      .post('/api/documents')
      .field('entityType', entityType)
      .field('entityId', String(entityId ?? driver.id))
      .field('category', 'Driving licence')
      .attach('file', file, { filename: name, contentType: type });

  it('uploads, lists and streams a document back byte-for-byte with safe headers', async () => {
    const res = await upload(as.biller);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      entityType: 'DRIVER',
      entityId: driver.id,
      fileName: 'licence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      category: 'Driving licence',
    });
    expect(res.body.data.storageKey).toBeUndefined();
    expect(res.body.data.checksum).toMatch(/^[0-9a-f]{64}$/);

    const list = await as.auditor
      .get('/api/documents')
      .query({ entityType: 'DRIVER', entityId: driver.id });
    expect(list.body.data).toHaveLength(1);

    const dl = await as.auditor
      .get(`/api/documents/${res.body.data.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(dl.status).toBe(200);
    expect(Buffer.compare(dl.body, PDF)).toBe(0);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['content-disposition']).toMatch(/^attachment; filename="licence.pdf"/);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.headers['cache-control']).toContain('no-store');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'UPLOAD' } });
    expect(audit).toMatchObject({ entityType: 'Document', entityId: String(res.body.data.id) });
  });

  it('rejects files whose bytes are not an allowed type, whatever the client claims', async () => {
    const res = await upload(as.biller, { file: FAKE_PDF, name: 'evil.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejects files over 10 MB and uploads for records that do not exist', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload(as.biller, { file: big })).status).toBe(413);
    const missing = await upload(as.biller, { entityId: 999999 });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('INVALID_REFERENCE');
  });

  it('access follows the record: Auditor cannot upload driver documents; Biller cannot see GST documents', async () => {
    expect((await upload(as.auditor)).status).toBe(403);
    const company = await makeCompany({ name: 'Infosys', code: 'INFY' });
    const gst = await as.admin.post('/api/gst/records').send({
      direction: 'OUTWARD',
      companyId: company.id,
      counterpartyName: 'Infosys',
      invoiceNumber: 'LV/1',
      invoiceDate: '2026-09-30',
      hsnSac: '996601',
      taxableValue: '1000',
      taxRate: '5',
      supplyType: 'INTRA_STATE',
      placeOfSupply: '29',
    });
    const doc = await upload(as.auditor, {
      entityType: 'GST_RECORD',
      entityId: gst.body.data.id,
      file: PNG,
      name: 'inv.png',
      type: 'image/png',
    });
    expect(doc.status).toBe(201);
    expect(doc.body.data.mimeType).toBe('image/png');
    expect(
      (
        await as.biller
          .get('/api/documents')
          .query({ entityType: 'GST_RECORD', entityId: gst.body.data.id })
      ).status,
    ).toBe(403);
    expect((await as.biller.get(`/api/documents/${doc.body.data.id}/download`)).status).toBe(403);
  });

  it('soft delete needs a reason, hides the document and keeps the row for audit', async () => {
    const id = (await upload(as.biller)).body.data.id;
    expect((await as.biller.delete(`/api/documents/${id}`).send({})).status).toBe(400);
    expect(
      (await as.auditor.delete(`/api/documents/${id}`).send({ reason: 'Wrong file' })).status,
    ).toBe(403);
    expect(
      (await as.biller.delete(`/api/documents/${id}`).send({ reason: 'Wrong file' })).status,
    ).toBe(200);
    expect(
      (await as.biller.get('/api/documents').query({ entityType: 'DRIVER', entityId: driver.id }))
        .body.data,
    ).toHaveLength(0);
    expect((await as.biller.get(`/api/documents/${id}/download`)).status).toBe(404);
    expect(await prisma.document.findUnique({ where: { id } })).toMatchObject({
      deleteReason: 'Wrong file',
    });
  });

  it('requires authentication', async () => {
    const anon = (await import('supertest')).default(app);
    expect(
      (await anon.get('/api/documents').query({ entityType: 'DRIVER', entityId: 1 })).status,
    ).toBe(401);
  });
});

describe('notifications (spec §54)', () => {
  let as;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
  });

  it('expiry and pending-settlement checks notify by permission, once per alert', async () => {
    await makeDriver({ fullName: 'Ravi', licenseExpiryDate: new Date('2000-01-01') });
    const company = await makeCompany({ name: 'Infosys', code: 'INFY' });
    await prisma.companySettlement.create({
      data: { companyId: company.id, settlementMonth: '2020-01', expectedAmount: '1000' },
    });
    await runScheduledChecks();
    await runScheduledChecks(); // deduplicated

    const biller = (await as.biller.get('/api/notifications')).body;
    expect(biller.data.map((n) => n.type).sort()).toEqual([
      'COMPANY_SETTLEMENT_PENDING',
      'DOCUMENT_EXPIRY',
    ]);
    expect(biller.data.find((n) => n.type === 'DOCUMENT_EXPIRY')).toMatchObject({
      title: 'Driving licence expired',
      readAt: null,
    });
    // Auditor sees master data (expiry) but cannot manage company settlements.
    const auditor = (await as.auditor.get('/api/notifications')).body.data;
    expect(auditor.map((n) => n.type)).toEqual(['DOCUMENT_EXPIRY']);
  });

  it('unread count, mark one read, mark all read; users only touch their own', async () => {
    await makeDriver({ fullName: 'Ravi', licenseExpiryDate: new Date('2000-01-01') });
    await runScheduledChecks();
    expect((await as.biller.get('/api/notifications/unread-count')).body.data.count).toBe(1);
    const [n] = (await as.biller.get('/api/notifications')).body.data;
    expect((await as.auditor.post(`/api/notifications/${n.id}/read`)).status).toBe(404);
    const read = await as.biller.post(`/api/notifications/${n.id}/read`);
    expect(read.body.data.readAt).not.toBeNull();
    expect((await as.biller.get('/api/notifications/unread-count')).body.data.count).toBe(0);
    expect((await as.admin.post('/api/notifications/read-all')).body.data.updated).toBe(1);
    expect(
      (await as.admin.get('/api/notifications').query({ unreadOnly: 'true' })).body.data,
    ).toHaveLength(0);
  });

  it('only Admin can trigger the checks on demand', async () => {
    expect((await as.biller.post('/api/notifications/run-checks')).status).toBe(403);
    expect((await as.admin.post('/api/notifications/run-checks')).status).toBe(200);
  });
});
