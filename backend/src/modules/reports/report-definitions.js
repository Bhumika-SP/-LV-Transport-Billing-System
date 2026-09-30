import { PERMISSIONS as P } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { parseDateOnly, toDateString, todayInBusinessTz } from '../../utils/dates.js';
import { grossEarningsBreakdown } from '../earnings/earnings.service.js';
import { companyProfit, monthlyProfit } from '../profit/profit.service.js';

/**
 * Report registry (spec §51, §65, §67). Each report declares its permission, supported
 * filters, columns and a row loader built on the same services/queries the app uses —
 * no financial formula is re-implemented here.
 *
 * Column types: text | number | money | date | month.
 */

export const MAX_REPORT_ROWS = 50_000;

const month = (f) =>
  f.month
    ? { settlementMonth: f.month }
    : (f.fromMonth || f.toMonth) && {
        settlementMonth: {
          ...(f.fromMonth && { gte: f.fromMonth }),
          ...(f.toMonth && { lte: f.toMonth }),
        },
      };
const dateRange = (field, f) =>
  (f.fromDate || f.toDate) && {
    [field]: {
      ...(f.fromDate && { gte: parseDateOnly(f.fromDate) }),
      ...(f.toDate && { lte: parseDateOnly(f.toDate) }),
    },
  };
const opt = (key, value) => (value ? { [key]: value } : {});
const d = (x) => (x ? toDateString(x) : null);

const settlementColumns = [
  { key: 'settlementMonth', label: 'Month', type: 'month' },
  { key: 'driver', label: 'Driver', type: 'text' },
  { key: 'tripEarnings', label: 'Trip earnings', type: 'money' },
  { key: 'allowances', label: 'Allowances', type: 'money' },
  { key: 'otherEarnings', label: 'Other earnings', type: 'money' },
  { key: 'positiveAdjustments', label: 'Positive adj.', type: 'money' },
  { key: 'grossEarnings', label: 'Gross earnings', type: 'money' },
  { key: 'reimbursements', label: 'Reimbursements', type: 'money' },
  { key: 'fuel', label: 'Fuel', type: 'money' },
  { key: 'toll', label: 'Toll', type: 'money' },
  { key: 'maintenance', label: 'Maintenance', type: 'money' },
  { key: 'emi', label: 'EMI', type: 'money' },
  { key: 'advanceRecovery', label: 'Advance recovery', type: 'money' },
  { key: 'otherDeductions', label: 'Other deductions', type: 'money' },
  { key: 'finalAmount', label: 'Final settlement', type: 'money' },
  { key: 'paidAmount', label: 'Paid', type: 'money' },
  { key: 'outstanding', label: 'Outstanding', type: 'money' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'paymentStatus', label: 'Payment status', type: 'text' },
];

async function settlementRows(f, extraWhere = {}) {
  const rows = await prisma.driverSettlement.findMany({
    where: {
      ...month(f),
      ...opt('driverId', f.driverId),
      ...opt('status', f.status),
      ...extraWhere,
    },
    include: { driver: { select: { fullName: true } } },
    orderBy: [{ settlementMonth: 'desc' }, { driverId: 'asc' }],
    take: MAX_REPORT_ROWS,
  });
  return rows.map((s) => ({
    ...s,
    driver: s.driver.fullName,
    outstanding: s.status === 'FINALIZED' ? s.finalAmount.minus(s.paidAmount) : null,
  }));
}

export const REPORTS = {
  trips: {
    title: 'Trip report',
    permission: P.TRIP_VIEW,
    filters: ['month', 'fromDate', 'toDate', 'companyId', 'driverId', 'vehicleId', 'status'],
    columns: [
      { key: 'tripDate', label: 'Date', type: 'date' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'vehicleType', label: 'Type', type: 'text' },
      { key: 'externalTripId', label: 'Trip ID', type: 'text' },
      { key: 'pickup', label: 'Pickup', type: 'text' },
      { key: 'dropLocation', label: 'Drop', type: 'text' },
      { key: 'totalKm', label: 'KM', type: 'number' },
      { key: 'ratePerKm', label: 'Rate/km', type: 'money' },
      { key: 'earnings', label: 'Earnings', type: 'money' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
    totals: ['totalKm', 'earnings'],
    async rows(f) {
      const trips = await prisma.trip.findMany({
        where: {
          ...month(f),
          ...dateRange('tripDate', f),
          ...opt('companyId', f.companyId),
          ...opt('driverId', f.driverId),
          ...opt('vehicleId', f.vehicleId),
          ...opt('status', f.status),
        },
        include: { company: true, driver: true, vehicle: true, vehicleType: true },
        orderBy: [{ tripDate: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return trips.map((t) => ({
        ...t,
        tripDate: d(t.tripDate),
        company: t.company.name,
        driver: t.driver.fullName,
        vehicle: t.vehicle.registrationNumber,
        vehicleType: t.vehicleType.name,
      }));
    },
  },

  'driver-earnings': {
    title: 'Driver earnings (gross)',
    permission: P.DRIVER_FINANCE_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'driverId'],
    columns: [
      { key: 'settlementMonth', label: 'Month', type: 'month' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'tripCount', label: 'Trips', type: 'number' },
      { key: 'tripEarnings', label: 'Trip earnings', type: 'money' },
      { key: 'allowances', label: 'Allowances', type: 'money' },
      { key: 'otherEarnings', label: 'Other earnings', type: 'money' },
      { key: 'positiveAdjustments', label: 'Positive adj.', type: 'money' },
      { key: 'grossEarnings', label: 'Gross earnings', type: 'money' },
    ],
    totals: ['tripEarnings', 'allowances', 'otherEarnings', 'positiveAdjustments', 'grossEarnings'],
    async rows(f) {
      return (await grossEarningsBreakdown(f)).map((r) => ({ ...r, driver: r.driver.fullName }));
    },
  },

  'driver-settlements': {
    title: 'Driver settlement report',
    permission: P.SETTLEMENT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'driverId', 'status'],
    columns: settlementColumns,
    totals: [
      'grossEarnings',
      'reimbursements',
      'fuel',
      'toll',
      'maintenance',
      'emi',
      'advanceRecovery',
      'otherDeductions',
      'finalAmount',
      'paidAmount',
      'outstanding',
    ],
    rows: (f) => settlementRows(f),
  },

  /** Spec §65 driver reconciliation — every component through to outstanding. */
  'driver-reconciliation': {
    title: 'Driver reconciliation',
    permission: P.SETTLEMENT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'driverId'],
    columns: settlementColumns,
    totals: [
      'grossEarnings',
      'reimbursements',
      'fuel',
      'toll',
      'maintenance',
      'emi',
      'advanceRecovery',
      'otherDeductions',
      'finalAmount',
      'paidAmount',
      'outstanding',
    ],
    rows: (f) => settlementRows(f),
  },

  'payment-outstanding': {
    title: 'Payment outstanding',
    permission: P.PAYMENT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'driverId'],
    columns: [
      { key: 'settlementMonth', label: 'Month', type: 'month' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'finalAmount', label: 'Final settlement', type: 'money' },
      { key: 'paidAmount', label: 'Paid', type: 'money' },
      { key: 'outstanding', label: 'Outstanding', type: 'money' },
      { key: 'paymentStatus', label: 'Payment status', type: 'text' },
    ],
    totals: ['finalAmount', 'paidAmount', 'outstanding'],
    rows: (f) =>
      settlementRows(f, {
        status: 'FINALIZED',
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      }),
  },

  'driver-payments': {
    title: 'Driver payment report',
    permission: P.PAYMENT_VIEW,
    filters: ['fromDate', 'toDate', 'month', 'driverId', 'status'],
    columns: [
      { key: 'paymentDate', label: 'Date', type: 'date' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'settlementMonth', label: 'Settlement month', type: 'month' },
      { key: 'paymentMethod', label: 'Method', type: 'text' },
      { key: 'referenceNumber', label: 'Reference', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'reversalReason', label: 'Reversal reason', type: 'text' },
    ],
    totals: ['amount'],
    async rows(f) {
      const rows = await prisma.driverPayment.findMany({
        where: {
          ...dateRange('paymentDate', f),
          ...opt('driverId', f.driverId),
          ...opt('status', f.status),
          ...(f.month && { settlement: { settlementMonth: f.month } }),
        },
        include: { driver: true, settlement: true },
        orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return rows.map((p) => ({
        ...p,
        paymentDate: d(p.paymentDate),
        driver: p.driver.fullName,
        settlementMonth: p.settlement.settlementMonth,
      }));
    },
  },

  expenses: {
    title: 'Expense report',
    permission: P.DRIVER_FINANCE_VIEW,
    filters: [
      'month',
      'fromDate',
      'toDate',
      'driverId',
      'vehicleId',
      'paidBy',
      'category',
      'status',
    ],
    columns: [
      { key: 'expenseDate', label: 'Date', type: 'date' },
      { key: 'settlementMonth', label: 'Settlement month', type: 'month' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'vehicle', label: 'Vehicle', type: 'text' },
      { key: 'paidBy', label: 'Paid by', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'effect', label: 'Settlement effect', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'receiptReference', label: 'Receipt', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
    totals: ['amount'],
    async rows(f) {
      const rows = await prisma.driverExpense.findMany({
        where: {
          ...month(f),
          ...dateRange('expenseDate', f),
          ...opt('driverId', f.driverId),
          ...opt('vehicleId', f.vehicleId),
          ...opt('paidBy', f.paidBy),
          ...opt('category', f.category),
          ...opt('status', f.status),
        },
        include: { driver: true, vehicle: true },
        orderBy: [{ expenseDate: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return rows.map((x) => ({
        ...x,
        expenseDate: d(x.expenseDate),
        driver: x.driver.fullName,
        vehicle: x.vehicle.registrationNumber,
        effect: x.paidBy === 'LV' ? 'Deducted' : 'Reimbursed',
      }));
    },
  },

  advances: {
    title: 'Advances report',
    permission: P.DRIVER_FINANCE_VIEW,
    filters: ['fromDate', 'toDate', 'driverId', 'status'],
    columns: [
      { key: 'advanceDate', label: 'Date', type: 'date' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'reason', label: 'Reason', type: 'text' },
      { key: 'paymentMethod', label: 'Paid by', type: 'text' },
      { key: 'amount', label: 'Advance', type: 'money' },
      { key: 'recoveredAmount', label: 'Recovered', type: 'money' },
      { key: 'outstandingAmount', label: 'Outstanding', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
    ],
    totals: ['amount', 'recoveredAmount', 'outstandingAmount'],
    async rows(f) {
      const rows = await prisma.driverAdvance.findMany({
        where: {
          ...dateRange('advanceDate', f),
          ...opt('driverId', f.driverId),
          ...opt('status', f.status),
        },
        include: { driver: true },
        orderBy: [{ advanceDate: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return rows.map((a) => ({ ...a, advanceDate: d(a.advanceDate), driver: a.driver.fullName }));
    },
  },

  deductions: {
    title: 'Other deductions report',
    permission: P.DRIVER_FINANCE_VIEW,
    filters: ['month', 'fromDate', 'toDate', 'driverId'],
    columns: [
      { key: 'adjustmentDate', label: 'Date', type: 'date' },
      { key: 'settlementMonth', label: 'Settlement month', type: 'month' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'reason', label: 'Reason', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'createdBy', label: 'Recorded by', type: 'text' },
    ],
    totals: ['amount'],
    async rows(f) {
      const rows = await prisma.driverAdjustment.findMany({
        where: {
          type: 'OTHER_DEDUCTION',
          ...month(f),
          ...dateRange('adjustmentDate', f),
          ...opt('driverId', f.driverId),
        },
        include: { driver: true, createdBy: true },
        orderBy: [{ adjustmentDate: 'asc' }, { id: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return rows.map((a) => ({
        ...a,
        adjustmentDate: d(a.adjustmentDate),
        driver: a.driver.fullName,
        createdBy: a.createdBy?.name,
      }));
    },
  },

  'company-settlements': {
    title: 'Company settlement report',
    permission: P.COMPANY_SETTLEMENT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'companyId', 'status'],
    columns: [
      { key: 'settlementMonth', label: 'Month', type: 'month' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'expectedAmount', label: 'Expected', type: 'money' },
      { key: 'receivedAmount', label: 'Received', type: 'money' },
      { key: 'variance', label: 'Difference', type: 'money' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'receivedDate', label: 'Received on', type: 'date' },
      { key: 'paymentMethod', label: 'Method', type: 'text' },
      { key: 'referenceNumber', label: 'Reference', type: 'text' },
    ],
    totals: ['expectedAmount', 'receivedAmount'],
    async rows(f) {
      const rows = await prisma.companySettlement.findMany({
        where: { ...month(f), ...opt('companyId', f.companyId), ...opt('status', f.status) },
        include: { company: true },
        orderBy: [{ settlementMonth: 'asc' }, { companyId: 'asc' }],
        take: MAX_REPORT_ROWS,
      });
      return rows.map((s) => ({
        ...s,
        company: s.company.name,
        receivedDate: d(s.receivedDate),
        variance: s.receivedAmount ? s.receivedAmount.minus(s.expectedAmount) : null,
      }));
    },
  },

  /** Spec §65 company reconciliation: expected, actual received, finalized settlement, profit. */
  'company-reconciliation': {
    title: 'Company reconciliation',
    permission: P.PROFIT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth', 'companyId'],
    columns: [
      { key: 'settlementMonth', label: 'Month', type: 'month' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'expectedAmount', label: 'Expected', type: 'money' },
      { key: 'receivedAmount', label: 'Actual received', type: 'money' },
      { key: 'finalizedSettlements', label: 'Finalized driver settlement', type: 'money' },
      { key: 'lvProfit', label: 'LV profit', type: 'money' },
    ],
    totals: ['expectedAmount', 'receivedAmount', 'finalizedSettlements', 'lvProfit'],
    async rows(f) {
      const companies = await prisma.company.findMany({
        where: f.companyId ? { id: f.companyId } : {},
        orderBy: { name: 'asc' },
      });
      const expected = await prisma.companySettlement.groupBy({
        by: ['companyId', 'settlementMonth'],
        where: { ...month(f), ...opt('companyId', f.companyId) },
        _sum: { expectedAmount: true },
      });
      const exp = new Map(
        expected.map((e) => [`${e.companyId}|${e.settlementMonth}`, e._sum.expectedAmount]),
      );
      const out = [];
      for (const c of companies) {
        const { months } = await monthlyProfit({ ...f, companyId: c.id });
        for (const m of months) {
          out.push({
            settlementMonth: m.settlementMonth,
            company: c.name,
            expectedAmount: exp.get(`${c.id}|${m.settlementMonth}`) ?? null,
            receivedAmount: m.receivedAmount,
            finalizedSettlements: m.finalizedSettlements,
            lvProfit: m.lvProfit,
          });
        }
      }
      return out.sort(
        (a, b) =>
          a.settlementMonth.localeCompare(b.settlementMonth) || a.company.localeCompare(b.company),
      );
    },
  },

  'company-profit': {
    title: 'Company-wise profit',
    permission: P.PROFIT_VIEW,
    filters: ['month', 'fromMonth', 'toMonth'],
    columns: [
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'receivedAmount', label: 'Amount received', type: 'money' },
      { key: 'pendingExpected', label: 'Pending (expected)', type: 'money' },
      { key: 'finalizedSettlements', label: 'Finalized driver settlement', type: 'money' },
      { key: 'lvProfit', label: 'LV profit', type: 'money' },
    ],
    totals: ['receivedAmount', 'pendingExpected', 'finalizedSettlements', 'lvProfit'],
    async rows(f) {
      return (await companyProfit(f)).companies.map((c) => ({
        ...c,
        company: c.company?.name ?? 'Not attributable (no trips)',
      }));
    },
  },

  'monthly-profit': {
    title: 'Monthly profit',
    permission: P.PROFIT_VIEW,
    filters: ['fromMonth', 'toMonth', 'companyId'],
    columns: [
      { key: 'settlementMonth', label: 'Month', type: 'month' },
      { key: 'receivedAmount', label: 'Amount received', type: 'money' },
      { key: 'pendingExpected', label: 'Pending (expected)', type: 'money' },
      { key: 'finalizedSettlements', label: 'Finalized driver settlement', type: 'money' },
      { key: 'lvProfit', label: 'LV profit', type: 'money' },
      { key: 'unfinalizedSettlements', label: 'Not yet finalized', type: 'number' },
    ],
    totals: ['receivedAmount', 'pendingExpected', 'finalizedSettlements', 'lvProfit'],
    async rows(f) {
      return (await monthlyProfit(f)).months;
    },
  },

  imports: {
    title: 'Import history',
    permission: P.IMPORT_VIEW,
    filters: ['fromDate', 'toDate', 'companyId', 'status'],
    columns: [
      { key: 'id', label: 'Import #', type: 'number' },
      { key: 'createdAt', label: 'Uploaded', type: 'date' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'fileName', label: 'File', type: 'text' },
      { key: 'template', label: 'Template', type: 'text' },
      { key: 'totalRows', label: 'Rows', type: 'number' },
      { key: 'validRows', label: 'Valid', type: 'number' },
      { key: 'warningRows', label: 'Warnings', type: 'number' },
      { key: 'errorRows', label: 'Errors', type: 'number' },
      { key: 'duplicateRows', label: 'Duplicates', type: 'number' },
      { key: 'importedRows', label: 'Imported', type: 'number' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'uploadedBy', label: 'Uploaded by', type: 'text' },
    ],
    totals: ['totalRows', 'importedRows', 'errorRows', 'duplicateRows'],
    async rows(f) {
      const rows = await prisma.tripImport.findMany({
        where: {
          ...opt('companyId', f.companyId),
          ...opt('status', f.status),
          ...((f.fromDate || f.toDate) && {
            createdAt: {
              ...(f.fromDate && { gte: new Date(`${f.fromDate}T00:00:00+05:30`) }),
              ...(f.toDate && { lte: new Date(`${f.toDate}T23:59:59.999+05:30`) }),
            },
          }),
        },
        include: { company: true, template: true, uploadedBy: true },
        orderBy: { id: 'asc' },
        take: MAX_REPORT_ROWS,
      });
      return rows.map((b) => ({
        ...b,
        createdAt: todayInBusinessTz(b.createdAt),
        company: b.company.name,
        template: b.template?.name,
        uploadedBy: b.uploadedBy?.name,
      }));
    },
  },
};
