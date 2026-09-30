import { PERMISSIONS as P } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { addDays, parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { Decimal } from '../../utils/money.js';
import { summarizeCompanySettlements } from '../company-settlements/company-settlements.service.js';
import { gstSummary } from '../gst/gst.service.js';
import { monthlyProfit } from '../profit/profit.service.js';

/**
 * Role-aware dashboard (spec §44). Each section is included only if the user holds the
 * permission that guards the underlying data, so the same endpoint serves Admin,
 * Biller and Auditor without leaking anything a role may not see.
 */

const zero = () => new Decimal(0);

function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

async function counts(month) {
  const [companies, drivers, vehicles, trips] = await Promise.all([
    prisma.company.count({ where: { status: 'ACTIVE' } }),
    prisma.driver.count({ where: { status: 'ACTIVE' } }),
    prisma.vehicle.count({ where: { status: 'ACTIVE' } }),
    prisma.trip.aggregate({
      where: { settlementMonth: month, status: 'ACTIVE' },
      _count: true,
      _sum: { totalKm: true, earnings: true },
    }),
  ]);
  return {
    companies,
    drivers,
    vehicles,
    tripsThisMonth: trips._count,
    kmThisMonth: trips._sum.totalKm ?? zero(),
    tripEarningsThisMonth: trips._sum.earnings ?? zero(),
  };
}

async function companyReceipts(month, prev) {
  const [current, previous, overduePending] = await Promise.all([
    summarizeCompanySettlements({ month }),
    summarizeCompanySettlements({ month: prev }),
    prisma.companySettlement.count({
      where: { status: 'PENDING', settlementMonth: { lt: month } },
    }),
  ]);
  return { month, current, previousMonth: prev, previous, overduePending };
}

async function settlements(prev) {
  const [byStatus, awaiting, negative] = await Promise.all([
    prisma.driverSettlement.groupBy({
      by: ['status'],
      where: { settlementMonth: prev },
      _count: true,
      _sum: { finalAmount: true },
    }),
    prisma.driverSettlement.groupBy({
      by: ['status'],
      where: { status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
      _count: true,
    }),
    prisma.driverSettlement.count({
      where: { status: { in: ['DRAFT', 'CALCULATED'] }, finalAmount: { lt: 0 } },
    }),
  ]);
  const count = (rows, s) => rows.find((r) => r.status === s)?._count ?? 0;
  return {
    month: prev,
    byStatus: Object.fromEntries(
      byStatus.map((r) => [
        r.status,
        { count: r._count, finalAmount: r._sum.finalAmount ?? zero() },
      ]),
    ),
    awaitingApproval: count(awaiting, 'UNDER_REVIEW'),
    awaitingFinalization: count(awaiting, 'APPROVED'),
    negativeDrafts: negative,
  };
}

async function payments(month) {
  const [finalized, paidThisMonth] = await Promise.all([
    prisma.driverSettlement.aggregate({
      where: { status: 'FINALIZED', paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
      _sum: { finalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.driverPayment.aggregate({
      where: {
        status: 'VALID',
        paymentDate: { gte: parseDateOnly(`${month}-01`) },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  return {
    settlementsWithOutstanding: finalized._count,
    outstanding: (finalized._sum.finalAmount ?? zero()).minus(finalized._sum.paidAmount ?? zero()),
    paidThisMonth: paidThisMonth._sum.amount ?? zero(),
    paymentsThisMonth: paidThisMonth._count,
  };
}

async function profit(month) {
  const sixBack = [...Array(5)].reduce((m) => previousMonth(m), month);
  const data = await monthlyProfit({ fromMonth: sixBack, toMonth: month });
  return { totals: data.totals, trend: [...data.months].reverse() };
}

async function imports() {
  const since = new Date(Date.now() - 30 * 86400 * 1000);
  const [pending, withErrors, failed] = await Promise.all([
    prisma.tripImport.count({ where: { status: 'VALIDATED' } }),
    prisma.tripImport.count({ where: { createdAt: { gte: since }, errorRows: { gt: 0 } } }),
    prisma.tripImport.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
  ]);
  return {
    pendingConfirmation: pending,
    withErrorsLast30Days: withErrors,
    failedLast30Days: failed,
  };
}

async function expenses(month) {
  const rows = await prisma.driverExpense.groupBy({
    by: ['paidBy', 'category'],
    where: { settlementMonth: month, status: 'ACTIVE' },
    _sum: { amount: true },
    _count: true,
  });
  const lvPaid = rows.filter((r) => r.paidBy === 'LV');
  const driverPaid = rows.filter((r) => r.paidBy === 'DRIVER');
  const sum = (list) => list.reduce((a, r) => a.plus(r._sum.amount ?? zero()), zero());
  return {
    month,
    entries: rows.reduce((n, r) => n + r._count, 0),
    lvPaidTotal: sum(lvPaid),
    lvPaidByCategory: Object.fromEntries(lvPaid.map((r) => [r.category, r._sum.amount ?? zero()])),
    driverPaidTotal: sum(driverPaid),
  };
}

/** Expiring or expired licences / insurance / fitness / permits (next 30 days). */
async function documentAlerts(today) {
  const horizon = parseDateOnly(addDays(today, 30));
  const soon = { not: null, lte: horizon };
  const [drivers, vehicles] = await Promise.all([
    prisma.driver.findMany({
      where: { status: 'ACTIVE', licenseExpiryDate: soon },
      select: { id: true, fullName: true, licenseExpiryDate: true },
    }),
    prisma.vehicle.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { insuranceExpiryDate: soon },
          { fitnessExpiryDate: soon },
          { permitExpiryDate: soon },
        ],
      },
      select: {
        id: true,
        registrationNumber: true,
        insuranceExpiryDate: true,
        fitnessExpiryDate: true,
        permitExpiryDate: true,
      },
    }),
  ]);
  const t = parseDateOnly(today);
  const alerts = [];
  for (const d of drivers) {
    alerts.push({
      kind: 'LICENSE',
      entityType: 'DRIVER',
      entityId: d.id,
      name: d.fullName,
      date: d.licenseExpiryDate,
      expired: d.licenseExpiryDate < t,
    });
  }
  for (const v of vehicles) {
    for (const [kind, date] of [
      ['INSURANCE', v.insuranceExpiryDate],
      ['FITNESS', v.fitnessExpiryDate],
      ['PERMIT', v.permitExpiryDate],
    ]) {
      if (date && date <= horizon) {
        alerts.push({
          kind,
          entityType: 'VEHICLE',
          entityId: v.id,
          name: v.registrationNumber,
          date,
          expired: date < t,
        });
      }
    }
  }
  return alerts.sort((a, b) => a.date - b.date);
}

async function auditAlerts() {
  const since24h = new Date(Date.now() - 86400 * 1000);
  const since30d = new Date(Date.now() - 30 * 86400 * 1000);
  const [failedLogins, reopens, reversals] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: since24h } } }),
    prisma.auditLog.count({ where: { action: 'REOPEN', createdAt: { gte: since30d } } }),
    prisma.auditLog.count({ where: { action: 'REVERSE', createdAt: { gte: since30d } } }),
  ]);
  return {
    failedLoginsLast24h: failedLogins,
    reopensLast30Days: reopens,
    paymentReversalsLast30Days: reversals,
  };
}

/** GST figures for the period most recently closed (returns are prepared for it). */
async function gst(prev) {
  const s = await gstSummary({ taxPeriod: prev });
  return {
    taxPeriod: prev,
    outwardCount: s.outward.count,
    outwardTaxable: s.outward.taxableValue,
    outputTax: s.outward.totalTax,
    inputTaxCredit: s.inward.totalTax,
    reverseChargeTax: s.reverseCharge.totalTax,
    netTaxPayable: s.netTaxPayable,
  };
}

export async function getDashboard(user) {
  const can = (code) => user.permissions.includes(code);
  const today = todayInBusinessTz();
  const month = today.slice(0, 7);
  const prev = previousMonth(month);

  const sections = {
    counts: can(P.MASTER_VIEW) && counts(month),
    companyReceipts: can(P.COMPANY_SETTLEMENT_VIEW) && companyReceipts(month, prev),
    settlements: can(P.SETTLEMENT_VIEW) && settlements(prev),
    payments: can(P.PAYMENT_VIEW) && payments(month),
    profit: can(P.PROFIT_VIEW) && profit(month),
    imports: can(P.IMPORT_VIEW) && imports(),
    expenses: can(P.DRIVER_FINANCE_VIEW) && expenses(month),
    documentAlerts: can(P.MASTER_VIEW) && documentAlerts(today),
    auditAlerts: can(P.AUDIT_VIEW) && auditAlerts(),
    gst: can(P.GST_VIEW) && gst(prev),
  };
  const keys = Object.keys(sections).filter((k) => sections[k]);
  const values = await Promise.all(keys.map((k) => sections[k]));
  return {
    role: user.role.code,
    today,
    month,
    ...Object.fromEntries(keys.map((k, i) => [k, values[i]])),
  };
}
