import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { receivedAmountsByCompanyMonth } from '../../src/modules/company-settlements/company-settlements.service.js';
import { todayInBusinessTz } from '../../src/utils/dates.js';
import { loginAll } from '../helpers/auth.js';
import { prisma, seedBase } from '../helpers/db.js';
import { makeCompany } from '../helpers/fixtures.js';

const app = createApp();

describe('monthly company settlement (spec §18–19, scenario §79)', () => {
  let as;
  let infosys;
  let wipro;
  beforeEach(async () => {
    await seedBase();
    as = await loginAll(app);
    infosys = await makeCompany({ name: 'Infosys', code: 'INFY' });
    wipro = await makeCompany({ name: 'Wipro', code: 'WIPRO' });
  });
  afterAll(() => prisma.$disconnect());

  const create = (agent, body) =>
    agent.post('/api/company-settlements').send({
      companyId: infosys.id,
      settlementMonth: '2026-09',
      expectedAmount: '2500000',
      ...body,
    });

  const receive = (agent, id, body) =>
    agent.post(`/api/company-settlements/${id}/receive`).send({
      receivedAmount: '2500000',
      receivedDate: '2026-09-30',
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'UTR123',
      ...body,
    });

  const summary = async (query) =>
    (await as.auditor.get('/api/company-settlements/summary').query(query)).body.data;

  it('scenario §79: PENDING is not counted as received; RECEIVED is', async () => {
    const { body } = await create(as.biller);
    expect(body.data).toMatchObject({
      status: 'PENDING',
      expectedAmount: '2500000.00',
      receivedAmount: null,
      variance: null,
    });

    let s = await summary({ month: '2026-09', companyId: infosys.id });
    expect(s).toMatchObject({
      expectedTotal: '2500000.00',
      receivedTotal: '0.00',
      pendingTotal: '2500000.00',
      receivedCount: 0,
    });
    expect(await receivedAmountsByCompanyMonth({ month: '2026-09' })).toEqual([]);

    const res = await receive(as.biller, body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'RECEIVED',
      receivedAmount: '2500000.00',
      receivedDate: '2026-09-30',
      paymentMethod: 'BANK_TRANSFER',
      variance: '0.00',
    });

    s = await summary({ month: '2026-09', companyId: infosys.id });
    expect(s).toMatchObject({
      receivedTotal: '2500000.00',
      pendingTotal: '0.00',
      receivedCount: 1,
    });
    const grouped = await receivedAmountsByCompanyMonth({ month: '2026-09' });
    expect(grouped[0]._sum.receivedAmount.toFixed(2)).toBe('2500000.00');
  });

  it('preserves both expected and actual when they differ', async () => {
    const { body } = await create(as.biller, { expectedAmount: '2500000' });
    const res = await receive(as.biller, body.data.id, { receivedAmount: '2450000.50' });
    expect(res.body.data).toMatchObject({
      expectedAmount: '2500000.00',
      receivedAmount: '2450000.50',
      variance: '-49999.50',
    });
  });

  it('one settlement per company per month (API and database constraint)', async () => {
    expect((await create(as.biller)).status).toBe(201);
    const dup = await create(as.biller, { expectedAmount: '100' });
    expect(dup.status).toBe(409);
    expect(dup.body.details[0].path).toBe('settlementMonth');

    // Even bypassing the service, MySQL rejects the duplicate.
    await expect(
      prisma.companySettlement.create({
        data: { companyId: infosys.id, settlementMonth: '2026-09', expectedAmount: '1' },
      }),
    ).rejects.toThrow(/Unique constraint/);

    // Same month for a different company, and a different month for the same company, are fine.
    expect((await create(as.biller, { companyId: wipro.id })).status).toBe(201);
    expect((await create(as.biller, { settlementMonth: '2026-10' })).status).toBe(201);
  });

  it('totals combine only RECEIVED amounts across companies and months', async () => {
    const a = await create(as.biller, { expectedAmount: '2500000' });
    const b = await create(as.biller, { companyId: wipro.id, expectedAmount: '1800000' });
    await create(as.biller, { settlementMonth: '2026-10', expectedAmount: '999999' });
    await receive(as.biller, a.body.data.id, { receivedAmount: '2500000' });
    await receive(as.biller, b.body.data.id, { receivedAmount: '1750000.25' });

    const sept = await summary({ month: '2026-09' });
    expect(sept).toMatchObject({ receivedTotal: '4250000.25', pendingTotal: '0.00' });
    const all = await summary({});
    expect(all).toMatchObject({
      expectedTotal: '5299999.00',
      receivedTotal: '4250000.25',
      pendingTotal: '999999.00',
    });
  });

  it('validates month, amounts, payment method and received date', async () => {
    const badMonth = await create(as.biller, { settlementMonth: '2026-13' });
    expect(badMonth.status).toBe(400);
    const zero = await create(as.biller, { expectedAmount: '0' });
    expect(zero.status).toBe(400);
    const float = await create(as.biller, { expectedAmount: '10.555' });
    expect(float.status).toBe(400);

    const { body } = await create(as.biller);
    const method = await receive(as.biller, body.data.id, { paymentMethod: 'CRYPTO' });
    expect(method.status).toBe(400);
    expect(method.body.details[0].path).toBe('paymentMethod');

    const future = await receive(as.biller, body.data.id, { receivedDate: '2099-01-01' });
    expect(future.status).toBe(400);
    expect(future.body.details[0].path).toBe('receivedDate');

    const today = await receive(as.biller, body.data.id, { receivedDate: todayInBusinessTz() });
    expect(today.status).toBe(200);
  });

  it('cannot receive twice; pending edits are blocked once received', async () => {
    const { body } = await create(as.biller);
    await receive(as.biller, body.data.id);
    const again = await receive(as.biller, body.data.id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_STATUS');

    const edit = await as.biller
      .patch(`/api/company-settlements/${body.data.id}`)
      .send({ expectedAmount: '1' });
    expect(edit.status).toBe(409);
  });

  it('biller edits a PENDING expected amount (audited)', async () => {
    const { body } = await create(as.biller);
    const res = await as.biller
      .patch(`/api/company-settlements/${body.data.id}`)
      .send({ expectedAmount: '2600000' });
    expect(res.body.data.expectedAmount).toBe('2600000.00');
    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'CompanySettlement', action: 'UPDATE' },
    });
    expect(log.previousValue.expectedAmount).toBe('2500000.00');
    expect(log.newValue.expectedAmount).toBe('2600000.00');
  });

  it('RBAC: auditor views only; biller cannot correct, revert or delete', async () => {
    expect((await as.auditor.get('/api/company-settlements')).status).toBe(200);
    expect((await create(as.auditor)).status).toBe(403);

    const { body } = await create(as.biller);
    await receive(as.biller, body.data.id);
    const id = body.data.id;
    expect(
      (
        await as.biller
          .post(`/api/company-settlements/${id}/correct`)
          .send({ receivedAmount: '1', reason: 'x y z' })
      ).status,
    ).toBe(403);
    expect(
      (await as.biller.post(`/api/company-settlements/${id}/revert`).send({ reason: 'oops' }))
        .status,
    ).toBe(403);
    expect(
      (await as.auditor.post(`/api/company-settlements/${id}/revert`).send({ reason: 'oops' }))
        .status,
    ).toBe(403);
  });

  it('admin corrects a RECEIVED settlement only with a reason; previous values are audited', async () => {
    const { body } = await create(as.biller);
    await receive(as.biller, body.data.id);
    const id = body.data.id;

    const noReason = await as.admin
      .post(`/api/company-settlements/${id}/correct`)
      .send({ receivedAmount: '2400000' });
    expect(noReason.status).toBe(400);

    const res = await as.admin
      .post(`/api/company-settlements/${id}/correct`)
      .send({ receivedAmount: '2400000', reason: 'Bank statement shows 24L' });
    expect(res.body.data.receivedAmount).toBe('2400000.00');
    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'CompanySettlement', reason: { not: null } },
    });
    expect(log).toMatchObject({ action: 'UPDATE', reason: 'Bank statement shows 24L' });
    expect(log.previousValue.receivedAmount).toBe('2500000.00');
  });

  it('admin reverts RECEIVED → PENDING; it stops counting as received', async () => {
    const { body } = await create(as.biller);
    await receive(as.biller, body.data.id);
    const res = await as.admin
      .post(`/api/company-settlements/${body.data.id}/revert`)
      .send({ reason: 'Recorded against wrong month' });
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      receivedAmount: null,
      paymentMethod: null,
    });
    expect((await summary({ month: '2026-09' })).receivedTotal).toBe('0.00');
    expect(await prisma.auditLog.count({ where: { action: 'REVERT' } })).toBe(1);
  });

  it('only PENDING settlements can be deleted, by admin, with a reason', async () => {
    const a = await create(as.biller);
    const b = await create(as.biller, { companyId: wipro.id });
    await receive(as.biller, b.body.data.id);

    expect(
      (await as.biller.delete(`/api/company-settlements/${a.body.data.id}`).send({ reason: 'dup' }))
        .status,
    ).toBe(403);
    expect(
      (await as.admin.delete(`/api/company-settlements/${b.body.data.id}`).send({ reason: 'nope' }))
        .status,
    ).toBe(409);
    const ok = await as.admin
      .delete(`/api/company-settlements/${a.body.data.id}`)
      .send({ reason: 'Entered twice' });
    expect(ok.status).toBe(200);
    expect(await prisma.companySettlement.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'DELETE' } })).toBe(1);
  });

  it('lists with company/month/status filters and month range', async () => {
    await create(as.biller, { settlementMonth: '2026-07' });
    await create(as.biller, { settlementMonth: '2026-08' });
    const s = await create(as.biller, { settlementMonth: '2026-09' });
    await receive(as.biller, s.body.data.id);
    await create(as.biller, { companyId: wipro.id, settlementMonth: '2026-09' });

    const byCompany = await as.auditor
      .get('/api/company-settlements')
      .query({ companyId: infosys.id });
    expect(byCompany.body.data.map((r) => r.settlementMonth)).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ]);
    const range = await as.auditor
      .get('/api/company-settlements')
      .query({ fromMonth: '2026-08', toMonth: '2026-09' });
    expect(range.body.meta.total).toBe(3);
    const received = await as.auditor.get('/api/company-settlements').query({ status: 'RECEIVED' });
    expect(received.body.data).toHaveLength(1);
    expect(received.body.data[0].company.name).toBe('Infosys');
  });
});
