import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { monthOf, parseDateOnly } from '../../utils/dates.js';
import { Decimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, rethrowUnique } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { calculateGst } from './gst-calculations.js';

const NOT_FOUND = { code: 'GST_RECORD_NOT_FOUND', label: 'GST record' };
const RATE_NOT_FOUND = { code: 'TAX_RATE_NOT_FOUND', label: 'Tax rate' };
const INCLUDE = {
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};
const zero = () => new Decimal(0);

// ---- Tax rate configuration (Admin) -----------------------------------------------

export function listTaxRates({ includeInactive }) {
  return prisma.taxRateConfig.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    orderBy: [{ hsnSac: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

export async function createTaxRate(data, actor, req) {
  return prisma.$transaction(async (tx) => {
    const rate = await tx.taxRateConfig.create({
      data: {
        ...data,
        effectiveFrom: parseDateOnly(data.effectiveFrom),
        effectiveTo: data.effectiveTo ? parseDateOnly(data.effectiveTo) : null,
        createdById: actor.id,
      },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'TaxRateConfig',
      entityId: rate.id,
      newValue: rate,
      req,
    });
    return rate;
  });
}

export async function updateTaxRate(id, data, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await findOr404(tx.taxRateConfig, id, RATE_NOT_FOUND);
    const after = await tx.taxRateConfig.update({
      where: { id },
      data: {
        ...data,
        ...(data.effectiveFrom && { effectiveFrom: parseDateOnly(data.effectiveFrom) }),
        ...(data.effectiveTo !== undefined && {
          effectiveTo: data.effectiveTo ? parseDateOnly(data.effectiveTo) : null,
        }),
      },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'TaxRateConfig',
      entityId: id,
      previousValue: before,
      newValue: after,
      req,
    });
    return after;
  });
}

// ---- GST records ------------------------------------------------------------------

function where(f) {
  const w = {
    ...(f.direction && { direction: f.direction }),
    ...(f.companyId && { companyId: f.companyId }),
    ...(f.status && { status: f.status }),
    ...(f.hsnSac && { hsnSac: f.hsnSac }),
  };
  if (f.taxPeriod) w.taxPeriod = f.taxPeriod;
  else if (f.fromPeriod || f.toPeriod)
    w.taxPeriod = {
      ...(f.fromPeriod && { gte: f.fromPeriod }),
      ...(f.toPeriod && { lte: f.toPeriod }),
    };
  if (f.search) {
    w.OR = [
      { invoiceNumber: { contains: f.search } },
      { counterpartyName: { contains: f.search } },
      { counterpartyGstin: { contains: f.search } },
    ];
  }
  return w;
}

export function listGstRecords({ page, pageSize, ...filters }) {
  return findPage(prisma.gstRecord, {
    where: where(filters),
    orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
    include: INCLUDE,
    page,
    pageSize,
  });
}

export function getGstRecord(id) {
  return findOr404(prisma.gstRecord, id, { ...NOT_FOUND, include: INCLUDE });
}

/** Preview the computed tax for a draft record (no data written). */
export function previewGst(data) {
  return calculateGst(data);
}

export async function createGstRecord(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (data.companyId && !(await tx.company.findUnique({ where: { id: data.companyId } }))) {
        throw AppError.badRequest('Company does not exist', 'INVALID_REFERENCE', [
          { path: 'companyId', message: 'Select a valid company' },
        ]);
      }
      if (
        data.taxRateConfigId &&
        !(await tx.taxRateConfig.findUnique({ where: { id: data.taxRateConfigId } }))
      ) {
        throw AppError.badRequest('Tax rate does not exist', 'INVALID_REFERENCE', [
          { path: 'taxRateConfigId', message: 'Select a valid rate' },
        ]);
      }
      const tax = calculateGst(data);
      const record = await tx.gstRecord.create({
        data: {
          ...data,
          ...tax,
          counterpartyKey: data.counterpartyGstin ?? '',
          invoiceDate: parseDateOnly(data.invoiceDate),
          taxPeriod: data.taxPeriod ?? monthOf(data.invoiceDate),
          createdById: actor.id,
        },
        include: INCLUDE,
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'GstRecord',
        entityId: record.id,
        newValue: record,
        req,
      });
      return record;
    });
  } catch (err) {
    rethrowUnique(err, {
      invoice_number: {
        path: 'invoiceNumber',
        message: 'This invoice number is already recorded for this counterparty',
      },
    });
  }
}

export async function voidGstRecord(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await findOr404(tx.gstRecord, id, NOT_FOUND);
    if (before.status !== 'ACTIVE')
      throw AppError.conflict('This record is already void', 'ALREADY_VOID');
    const after = await tx.gstRecord.update({
      where: { id },
      data: { status: 'VOID', voidReason: reason, voidedAt: new Date(), voidedById: actor.id },
      include: INCLUDE,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CANCEL,
      entityType: 'GstRecord',
      entityId: id,
      previousValue: before,
      newValue: after,
      reason,
      req,
    });
    return after;
  });
}

// ---- Summaries (reporting/preparation only; no filing) ------------------------------

const HEADS = ['taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'totalTax', 'invoiceValue'];
const sumAgg = (agg) => Object.fromEntries(HEADS.map((h) => [h, agg._sum[h] ?? zero()]));

/** GST overview for a period: outward tax, inward tax (ITC), reverse charge, net position. */
export async function gstSummary(filters) {
  const base = { ...where(filters), status: 'ACTIVE' };
  const agg = (w) =>
    prisma.gstRecord.aggregate({
      where: { ...base, ...w },
      _sum: Object.fromEntries(HEADS.map((h) => [h, true])),
      _count: true,
    });
  const [outward, inwardItc, inwardRcm] = await Promise.all([
    agg({ direction: 'OUTWARD' }),
    agg({ direction: 'INWARD', reverseCharge: false }),
    agg({ direction: 'INWARD', reverseCharge: true }),
  ]);
  const out = sumAgg(outward);
  const itc = sumAgg(inwardItc);
  const rcm = sumAgg(inwardRcm);
  // Tax payable = outward tax + reverse-charge tax − eligible ITC (indicative; not a filing).
  const payable = out.totalTax.plus(rcm.totalTax).minus(itc.totalTax);
  return {
    outward: { count: outward._count, ...out },
    inward: { count: inwardItc._count, ...itc },
    reverseCharge: { count: inwardRcm._count, ...rcm },
    netTaxPayable: payable,
  };
}

/** HSN/SAC-wise summary (GSTR-1 table 12 support). */
export async function hsnSummary(filters) {
  const rows = await prisma.gstRecord.groupBy({
    by: ['direction', 'hsnSac', 'taxRate'],
    where: { ...where(filters), status: 'ACTIVE' },
    _sum: Object.fromEntries(HEADS.map((h) => [h, true])),
    _count: true,
    orderBy: [{ direction: 'asc' }, { hsnSac: 'asc' }],
  });
  return rows.map((r) => ({
    direction: r.direction,
    hsnSac: r.hsnSac,
    taxRate: r.taxRate,
    count: r._count,
    ...sumAgg(r),
  }));
}

/** GSTR-1 supporting data: B2B by recipient GSTIN, and B2C totals by place of supply/rate. */
export async function gstr1(filters) {
  const base = { ...where(filters), direction: 'OUTWARD', status: 'ACTIVE' };
  const [b2b, b2c, hsn] = await Promise.all([
    prisma.gstRecord.findMany({
      where: { ...base, counterpartyGstin: { not: null } },
      orderBy: [{ counterpartyGstin: 'asc' }, { invoiceDate: 'asc' }],
    }),
    prisma.gstRecord.groupBy({
      by: ['placeOfSupply', 'taxRate', 'supplyType'],
      where: { ...base, counterpartyGstin: null },
      _sum: Object.fromEntries(HEADS.map((h) => [h, true])),
      _count: true,
    }),
    hsnSummary({ ...filters, direction: 'OUTWARD' }),
  ]);
  return {
    b2b,
    b2c: b2c.map((r) => ({
      placeOfSupply: r.placeOfSupply,
      taxRate: r.taxRate,
      supplyType: r.supplyType,
      count: r._count,
      ...sumAgg(r),
    })),
    hsn,
  };
}

/** GSTR-3B supporting figures (3.1 outward, 3.1(d) inward reverse charge, 4 ITC). */
export async function gstr3b(filters) {
  const s = await gstSummary(filters);
  const pick = (x) => ({
    taxableValue: x.taxableValue,
    igst: x.igst,
    cgst: x.cgst,
    sgst: x.sgst,
    cess: x.cess,
  });
  return {
    '3.1(a) Outward taxable supplies': pick(s.outward),
    '3.1(d) Inward supplies liable to reverse charge': pick(s.reverseCharge),
    '4(A)(5) All other ITC': pick(s.inward),
    netTaxPayable: s.netTaxPayable,
  };
}

/**
 * Tax reconciliation: per company and period, company settlement amount RECEIVED vs the
 * outward invoice value recorded. Differences need investigation (e.g. missing invoice).
 */
export async function taxReconciliation(filters) {
  const periodWhere = filters.taxPeriod
    ? { settlementMonth: filters.taxPeriod }
    : (filters.fromPeriod || filters.toPeriod) && {
        settlementMonth: {
          ...(filters.fromPeriod && { gte: filters.fromPeriod }),
          ...(filters.toPeriod && { lte: filters.toPeriod }),
        },
      };
  const [received, invoiced, companies] = await Promise.all([
    prisma.companySettlement.groupBy({
      by: ['companyId', 'settlementMonth'],
      where: {
        ...periodWhere,
        status: 'RECEIVED',
        ...(filters.companyId && { companyId: filters.companyId }),
      },
      _sum: { receivedAmount: true },
    }),
    prisma.gstRecord.groupBy({
      by: ['companyId', 'taxPeriod'],
      where: {
        ...where(filters),
        direction: 'OUTWARD',
        status: 'ACTIVE',
        companyId: filters.companyId ?? { not: null },
      },
      _sum: { taxableValue: true, totalTax: true, invoiceValue: true },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const rows = new Map();
  const row = (companyId, period) => {
    const k = `${companyId}|${period}`;
    if (!rows.has(k))
      rows.set(k, {
        companyId,
        company: names.get(companyId),
        taxPeriod: period,
        receivedAmount: zero(),
        taxableValue: zero(),
        totalTax: zero(),
        invoiceValue: zero(),
      });
    return rows.get(k);
  };
  for (const r of received)
    row(r.companyId, r.settlementMonth).receivedAmount = r._sum.receivedAmount ?? zero();
  for (const r of invoiced)
    Object.assign(row(r.companyId, r.taxPeriod), {
      taxableValue: r._sum.taxableValue ?? zero(),
      totalTax: r._sum.totalTax ?? zero(),
      invoiceValue: r._sum.invoiceValue ?? zero(),
    });
  return [...rows.values()]
    .map((r) => ({ ...r, difference: r.receivedAmount.minus(r.invoiceValue) }))
    .sort(
      (a, b) =>
        a.taxPeriod.localeCompare(b.taxPeriod) || (a.company ?? '').localeCompare(b.company ?? ''),
    );
}
