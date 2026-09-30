import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
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

describe('LV profit (spec §34–37, scenarios §76 and §79)', () => {
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
    const sedan = await makeVehicleType();
    await makeRate(sedan.id, '20.00', '2026-01-01');
    car = await makeVehicle(sedan.id);
    ravi = await makeDriver({ fullName: 'Ravi' });
    suresh = await makeDriver({ fullName: 'Suresh' });
  });
  afterAll(() => prisma.$disconnect());

  const post = (agent, url, body = {}) => agent.post(url).send(body);
  const trip = (driverId, companyId, km, day = '10') =>
    post(as.biller, '/api/trips', {
      companyId,
      driverId,
      vehicleId: car.id,
      tripDate: `${MONTH}-${day}`,
      kmSource: 'DIRECT',
      totalKm: km,
    });
  async function finalize(driverId) {
    const s = (await post(as.biller, '/api/settlements', { driverId, settlementMonth: MONTH })).body
      .data;
    await post(as.biller, `/api/settlements/${s.id}/submit`);
    await post(as.admin, `/api/settlements/${s.id}/approve`);
    return (await post(as.admin, `/api/settlements/${s.id}/finalize`)).body.data;
  }
  async function companySettlement(companyId, expected, received) {
    const cs = (
      await post(as.biller, '/api/company-settlements', {
        companyId,
        settlementMonth: MONTH,
        expectedAmount: expected,
      })
    ).body.data;
    if (received) {
      await post(as.biller, `/api/company-settlements/${cs.id}/receive`, {
        receivedAmount: received,
        receivedDate: '2026-09-30',
        paymentMethod: 'BANK_TRANSFER',
      });
    }
    return cs;
  }
  const monthly = async (q = {}) =>
    (await as.auditor.get('/api/profit/monthly').query({ month: MONTH, ...q })).body.data;

  it('§76: received ₹25,00,000 − finalized ₹23,50,000 = LV profit ₹1,50,000 (monthly, company, overall)', async () => {
    await trip(ravi.id, infosys.id, '70000', '05'); // 14,00,000
    await trip(suresh.id, infosys.id, '47500', '06'); // 9,50,000
    await finalize(ravi.id);
    await finalize(suresh.id);
    await companySettlement(infosys.id, '2500000', '2500000');

    const m = await monthly();
    expect(m.months[0]).toMatchObject({
      settlementMonth: MONTH,
      receivedAmount: '2500000.00',
      finalizedSettlements: '2350000.00',
      lvProfit: '150000.00',
      unfinalizedSettlements: 0,
    });

    const c = (await as.auditor.get('/api/profit/companies').query({ month: MONTH })).body.data;
    expect(c.companies).toHaveLength(1);
    expect(c.companies[0]).toMatchObject({
      company: { name: 'Infosys' },
      receivedAmount: '2500000.00',
      finalizedSettlements: '2350000.00',
      lvProfit: '150000.00',
    });

    const o = (await as.auditor.get('/api/profit/overall')).body.data;
    expect(o.totals.lvProfit).toBe('150000.00');
    expect(o.trend.map((t) => t.settlementMonth)).toEqual([MONTH]);
  });

  it('§79: a PENDING company settlement does not count as received; RECEIVED does', async () => {
    await trip(ravi.id, infosys.id, '117500'); // 23,50,000
    await finalize(ravi.id);
    const cs = await companySettlement(infosys.id, '2500000', null);

    let m = await monthly();
    expect(m.months[0]).toMatchObject({
      receivedAmount: '0.00',
      pendingExpected: '2500000.00',
      finalizedSettlements: '2350000.00',
      lvProfit: '-2350000.00',
    });

    await post(as.biller, `/api/company-settlements/${cs.id}/receive`, {
      receivedAmount: '2500000',
      receivedDate: '2026-09-30',
      paymentMethod: 'BANK_TRANSFER',
    });
    m = await monthly();
    expect(m.months[0]).toMatchObject({
      receivedAmount: '2500000.00',
      pendingExpected: '0.00',
      lvProfit: '150000.00',
    });
  });

  it('LV-paid fuel/toll/EMI are NOT subtracted again from profit', async () => {
    await trip(ravi.id, infosys.id, '120000'); // 24,00,000
    for (const [category, amount] of [
      ['FUEL', '30000'],
      ['TOLL', '5000'],
      ['EMI', '15000'],
    ]) {
      await post(as.biller, '/api/lv-expenses', {
        driverId: ravi.id,
        vehicleId: car.id,
        category,
        amount,
        expenseDate: `${MONTH}-15`,
        description: category,
      });
    }
    const s = await finalize(ravi.id);
    expect(s.finalAmount).toBe('2350000.00'); // 24,00,000 − 50,000 inside the settlement
    await companySettlement(infosys.id, '2500000', '2500000');
    expect((await monthly()).months[0].lvProfit).toBe('150000.00'); // not 1,00,000
  });

  it('only FINALIZED settlements count; others are reported as unfinalized', async () => {
    await trip(ravi.id, infosys.id, '1000');
    await finalize(ravi.id);
    await trip(suresh.id, infosys.id, '500');
    await post(as.biller, '/api/settlements', { driverId: suresh.id, settlementMonth: MONTH }); // CALCULATED only
    await companySettlement(infosys.id, '100000', '100000');

    const m = await monthly();
    expect(m.months[0]).toMatchObject({
      finalizedSettlements: '20000.00',
      lvProfit: '80000.00',
      unfinalizedSettlements: 1,
    });
  });

  it('A7: a driver serving two companies is split by trip earnings for company-wise profit', async () => {
    await trip(ravi.id, infosys.id, '3000', '05'); // 60,000
    await trip(ravi.id, wipro.id, '2000', '06'); // 40,000
    await post(as.biller, '/api/lv-expenses', {
      driverId: ravi.id,
      vehicleId: car.id,
      category: 'EMI',
      amount: '10000',
      expenseDate: `${MONTH}-15`,
      description: 'EMI',
    });
    const s = await finalize(ravi.id);
    expect(s.finalAmount).toBe('90000.00');
    await companySettlement(infosys.id, '70000', '70000');
    await companySettlement(wipro.id, '45000', '45000');

    const c = (await as.auditor.get('/api/profit/companies').query({ month: MONTH })).body.data;
    const byName = Object.fromEntries(c.companies.map((x) => [x.company.name, x]));
    expect(byName.Infosys).toMatchObject({
      finalizedSettlements: '54000.00',
      lvProfit: '16000.00',
    });
    expect(byName.Wipro).toMatchObject({ finalizedSettlements: '36000.00', lvProfit: '9000.00' });
    expect(c.totals).toMatchObject({
      receivedAmount: '115000.00',
      finalizedSettlements: '90000.00',
      lvProfit: '25000.00',
    });

    const w = await monthly({ companyId: wipro.id });
    expect(w.months[0]).toMatchObject({ finalizedSettlements: '36000.00', lvProfit: '9000.00' });
  });

  it('a settlement with no trips is kept as unattributed so totals still reconcile', async () => {
    await post(as.biller, '/api/earnings', {
      driverId: ravi.id,
      type: 'ALLOWANCE',
      amount: '5000',
      earningDate: `${MONTH}-10`,
      description: 'Standby allowance',
    });
    await finalize(ravi.id);
    const c = (await as.auditor.get('/api/profit/companies').query({ month: MONTH })).body.data;
    expect(c.companies).toHaveLength(1);
    expect(c.companies[0]).toMatchObject({ company: null, finalizedSettlements: '5000.00' });
    expect(c.totals.finalizedSettlements).toBe('5000.00');
  });

  it('reopening removes the settlement from profit until re-finalized', async () => {
    await trip(ravi.id, infosys.id, '1000');
    const s = await finalize(ravi.id);
    await companySettlement(infosys.id, '50000', '50000');
    expect((await monthly()).months[0].lvProfit).toBe('30000.00');

    await post(as.admin, `/api/settlements/${s.id}/reopen`, { reason: 'Recheck' });
    expect((await monthly()).months[0]).toMatchObject({
      finalizedSettlements: '0.00',
      lvProfit: '50000.00',
      unfinalizedSettlements: 1,
    });
    expect(await prisma.driverSettlementAllocation.count()).toBe(0);
  });

  it('RBAC: profit is visible to Admin and Auditor only', async () => {
    expect((await as.biller.get('/api/profit/monthly')).status).toBe(403);
    expect((await as.auditor.get('/api/profit/monthly')).status).toBe(200);
    expect((await as.admin.get('/api/profit/overall')).status).toBe(200);
  });
});
