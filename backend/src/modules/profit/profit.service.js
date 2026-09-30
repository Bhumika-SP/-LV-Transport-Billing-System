import { prisma } from '../../lib/prisma.js';
import { Decimal } from '../../utils/money.js';
import { calculateLvProfit } from './profit-formula.js';

/**
 * Profit views (spec §34–37). Eligibility (spec §35):
 *   company side  — company settlements with status RECEIVED, their ACTUAL received amount
 *   driver side   — driver settlements with status FINALIZED, their final amount
 * Expected/pending and draft/calculated/approved amounts are reported separately for
 * context but never enter the profit figure.
 */

const zero = () => new Decimal(0);

function monthRange({ month, fromMonth, toMonth }) {
  if (month) return { settlementMonth: month };
  if (fromMonth || toMonth) {
    return {
      settlementMonth: { ...(fromMonth && { gte: fromMonth }), ...(toMonth && { lte: toMonth }) },
    };
  }
  return {};
}

async function companySide(where) {
  const [received, pending] = await Promise.all([
    prisma.companySettlement.groupBy({
      by: ['companyId', 'settlementMonth'],
      where: { ...where, status: 'RECEIVED' },
      _sum: { receivedAmount: true, expectedAmount: true },
    }),
    prisma.companySettlement.groupBy({
      by: ['companyId', 'settlementMonth'],
      where: { ...where, status: 'PENDING' },
      _sum: { expectedAmount: true },
    }),
  ]);
  return { received, pending };
}

/** Month × company rows with received, pending, finalized allocation and profit. */
async function grid(filters) {
  const where = monthRange(filters);
  const companyWhere = { ...where, ...(filters.companyId && { companyId: filters.companyId }) };
  const [{ received, pending }, allocations, unfinalized] = await Promise.all([
    companySide(companyWhere),
    prisma.driverSettlementAllocation.groupBy({
      by: ['companyId', 'settlementMonth'],
      where: {
        ...where,
        ...(filters.companyId && { companyId: filters.companyId }),
        settlement: { status: 'FINALIZED' },
      },
      _sum: { amount: true },
    }),
    prisma.driverSettlement.groupBy({
      by: ['settlementMonth'],
      where: { ...where, status: { not: 'FINALIZED' } },
      _count: true,
    }),
  ]);

  const rows = new Map();
  const row = (companyId, month) => {
    const key = `${companyId ?? 'none'}|${month}`;
    if (!rows.has(key)) {
      rows.set(key, {
        companyId,
        settlementMonth: month,
        receivedAmount: zero(),
        receivedExpected: zero(),
        pendingExpected: zero(),
        finalizedSettlements: zero(),
      });
    }
    return rows.get(key);
  };
  for (const r of received) {
    const x = row(r.companyId, r.settlementMonth);
    x.receivedAmount = r._sum.receivedAmount ?? zero();
    x.receivedExpected = r._sum.expectedAmount ?? zero();
  }
  for (const r of pending)
    row(r.companyId, r.settlementMonth).pendingExpected = r._sum.expectedAmount ?? zero();
  for (const r of allocations)
    row(r.companyId, r.settlementMonth).finalizedSettlements = r._sum.amount ?? zero();

  const unfinalizedByMonth = Object.fromEntries(
    unfinalized.map((u) => [u.settlementMonth, u._count]),
  );
  return { rows: [...rows.values()], unfinalizedByMonth };
}

function total(rows, key) {
  return rows.reduce((acc, r) => acc.plus(r[key]), zero());
}

function summarize(rows) {
  const receivedAmount = total(rows, 'receivedAmount');
  const finalizedSettlements = total(rows, 'finalizedSettlements');
  return {
    receivedAmount,
    pendingExpected: total(rows, 'pendingExpected'),
    finalizedSettlements,
    lvProfit: calculateLvProfit(receivedAmount, finalizedSettlements),
  };
}

async function companyNames(ids) {
  const list = await prisma.company.findMany({
    where: { id: { in: ids.filter(Boolean) } },
    select: { id: true, name: true, code: true },
  });
  return new Map(list.map((c) => [c.id, c]));
}

/** Per month (optionally for one company), newest first. */
export async function monthlyProfit(filters) {
  const { rows, unfinalizedByMonth } = await grid(filters);
  const months = [...new Set(rows.map((r) => r.settlementMonth))].sort().reverse();
  const data = months.map((m) => ({
    settlementMonth: m,
    ...summarize(rows.filter((r) => r.settlementMonth === m)),
    unfinalizedSettlements: filters.companyId ? null : (unfinalizedByMonth[m] ?? 0),
  }));
  return { months: data, totals: summarize(rows) };
}

/** Per company for a month or range. Unattributable settlement amounts are a separate row. */
export async function companyProfit(filters) {
  const { rows } = await grid(filters);
  const ids = [...new Set(rows.map((r) => r.companyId))];
  const names = await companyNames(ids);
  const companies = ids
    .map((id) => ({
      company: id ? names.get(id) : null,
      companyId: id,
      ...summarize(rows.filter((r) => r.companyId === id)),
    }))
    .sort((a, b) => {
      if (!a.company) return 1;
      if (!b.company) return -1;
      return a.company.name.localeCompare(b.company.name);
    });
  return { companies, totals: summarize(rows) };
}

/** All-time totals, plus the monthly trend. */
export async function overallProfit() {
  const monthly = await monthlyProfit({});
  return { totals: monthly.totals, trend: [...monthly.months].reverse() };
}
