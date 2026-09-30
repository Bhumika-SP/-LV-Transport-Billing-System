import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, rethrowUnique } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

const NOT_FOUND = { code: 'COMPANY_SETTLEMENT_NOT_FOUND', label: 'Company settlement' };
const ENTITY = 'CompanySettlement';
const INCLUDE = { company: { select: { id: true, name: true, code: true } } };
const UNIQUE_FIELDS = {
  company_id: {
    path: 'settlementMonth',
    message: 'This company already has a settlement for this month',
  },
};

/** Received date must be a real past-or-today date in India time. */
function assertReceivedDate(dateStr) {
  if (dateStr > todayInBusinessTz()) {
    throw AppError.badRequest('Received date cannot be in the future', 'VALIDATION_ERROR', [
      { path: 'receivedDate', message: 'Cannot be in the future' },
    ]);
  }
}

/** Difference between received and expected (null while pending). */
function withVariance(s) {
  return {
    ...s,
    variance:
      s.receivedAmount === null
        ? null
        : roundMoney(toDecimal(s.receivedAmount).minus(s.expectedAmount)),
  };
}

function filterWhere({ companyId, status, month, fromMonth, toMonth }) {
  return {
    ...(companyId && { companyId }),
    ...(status && { status }),
    ...(month
      ? { settlementMonth: month }
      : (fromMonth || toMonth) && {
          settlementMonth: {
            ...(fromMonth && { gte: fromMonth }),
            ...(toMonth && { lte: toMonth }),
          },
        }),
  };
}

export async function listCompanySettlements({ page, pageSize, sortBy, sortDir, ...filters }) {
  const result = await findPage(prisma.companySettlement, {
    where: filterWhere(filters),
    orderBy: [{ [sortBy]: sortDir }, { id: 'desc' }],
    include: INCLUDE,
    page,
    pageSize,
  });
  return { ...result, items: result.items.map(withVariance) };
}

export async function getCompanySettlement(id) {
  return withVariance(
    await findOr404(prisma.companySettlement, id, { ...NOT_FOUND, include: INCLUDE }),
  );
}

/**
 * Totals for a filter. The distinction the spec requires (§35):
 *   expectedTotal  — all settlements (PENDING + RECEIVED), expected amounts
 *   receivedTotal  — ACTUAL cash: RECEIVED settlements only, received amounts
 *   pendingTotal   — expected amounts still PENDING (never counted as received)
 */
export async function summarizeCompanySettlements(filters, db = prisma) {
  const where = filterWhere(filters);
  const [all, received, pending] = await Promise.all([
    db.companySettlement.aggregate({ where, _sum: { expectedAmount: true }, _count: true }),
    db.companySettlement.aggregate({
      where: { ...where, status: 'RECEIVED' },
      _sum: { receivedAmount: true, expectedAmount: true },
      _count: true,
    }),
    db.companySettlement.aggregate({
      where: { ...where, status: 'PENDING' },
      _sum: { expectedAmount: true },
      _count: true,
    }),
  ]);
  const zero = new Decimal(0);
  return {
    count: all._count,
    expectedTotal: all._sum.expectedAmount ?? zero,
    receivedCount: received._count,
    receivedTotal: received._sum.receivedAmount ?? zero,
    receivedExpectedTotal: received._sum.expectedAmount ?? zero,
    pendingCount: pending._count,
    pendingTotal: pending._sum.expectedAmount ?? zero,
  };
}

/**
 * ACTUAL company amount received — the only company-side input to LV profit (spec §3, §35).
 * RECEIVED settlements only; PENDING never counts. Grouped by company and month.
 */
export function receivedAmountsByCompanyMonth(filters, db = prisma) {
  return db.companySettlement.groupBy({
    by: ['companyId', 'settlementMonth'],
    where: { ...filterWhere(filters), status: 'RECEIVED' },
    _sum: { receivedAmount: true },
  });
}

export async function createCompanySettlement(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: data.companyId } });
      if (!company) {
        throw AppError.badRequest('Company does not exist', 'INVALID_REFERENCE', [
          { path: 'companyId', message: 'Select a valid company' },
        ]);
      }
      const row = await tx.companySettlement.create({
        data: { ...data, status: 'PENDING', createdById: actor.id },
        include: INCLUDE,
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: ENTITY,
        entityId: row.id,
        newValue: row,
        req,
      });
      return withVariance(row);
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

async function loadForChange(tx, id, expectedStatus) {
  const row = await findOr404(tx.companySettlement, id, NOT_FOUND);
  if (expectedStatus && row.status !== expectedStatus) {
    throw AppError.conflict(
      `This settlement is ${row.status}; the action requires ${expectedStatus}`,
      'INVALID_STATUS',
    );
  }
  return row;
}

async function applyChange(tx, { id, before, data, action, actor, reason, req }) {
  const after = await tx.companySettlement.update({ where: { id }, data, include: INCLUDE });
  await recordAudit(tx, {
    userId: actor.id,
    action,
    entityType: ENTITY,
    entityId: id,
    previousValue: before,
    newValue: after,
    reason,
    req,
  });
  return withVariance(after);
}

/** Edit the expected amount / notes of a PENDING settlement. */
export function updatePending(id, data, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadForChange(tx, id, 'PENDING');
    return applyChange(tx, { id, before, data, action: AUDIT_ACTIONS.UPDATE, actor, req });
  });
}

/** Record the actual receipt: PENDING → RECEIVED. */
export function markReceived(id, data, actor, req) {
  assertReceivedDate(data.receivedDate);
  return prisma.$transaction(async (tx) => {
    const before = await loadForChange(tx, id, 'PENDING');
    return applyChange(tx, {
      id,
      before,
      data: {
        status: 'RECEIVED',
        receivedAmount: data.receivedAmount,
        receivedDate: parseDateOnly(data.receivedDate),
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        ...(data.notes !== undefined && { notes: data.notes }),
        receivedById: actor.id,
        receivedAt: new Date(),
      },
      action: AUDIT_ACTIONS.RECEIVE,
      actor,
      req,
    });
  });
}

/** Admin correction of a RECEIVED settlement; reason mandatory, previous values audited. */
export function correctReceived(id, { reason, ...data }, actor, req) {
  if (data.receivedDate) assertReceivedDate(data.receivedDate);
  return prisma.$transaction(async (tx) => {
    const before = await loadForChange(tx, id, 'RECEIVED');
    return applyChange(tx, {
      id,
      before,
      data: {
        ...data,
        ...(data.receivedDate && { receivedDate: parseDateOnly(data.receivedDate) }),
      },
      action: AUDIT_ACTIONS.UPDATE,
      actor,
      reason,
      req,
    });
  });
}

/** Admin: RECEIVED → PENDING (e.g. receipt recorded against the wrong month). */
export function revertToPending(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadForChange(tx, id, 'RECEIVED');
    return applyChange(tx, {
      id,
      before,
      data: {
        status: 'PENDING',
        receivedAmount: null,
        receivedDate: null,
        paymentMethod: null,
        referenceNumber: null,
        receivedById: null,
        receivedAt: null,
      },
      action: AUDIT_ACTIONS.REVERT,
      actor,
      reason,
      req,
    });
  });
}

/** Admin: remove a PENDING settlement created in error. RECEIVED ones cannot be deleted. */
export function deletePending(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadForChange(tx, id, 'PENDING');
    await tx.companySettlement.delete({ where: { id } });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: ENTITY,
      entityId: id,
      previousValue: before,
      reason,
      req,
    });
  });
}
