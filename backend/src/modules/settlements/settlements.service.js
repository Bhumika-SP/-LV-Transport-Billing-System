import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { todayInBusinessTz } from '../../utils/dates.js';
import { Decimal, toDecimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, lockRow, rethrowUnique } from '../../utils/records.js';
import { serialize } from '../../utils/serialize.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { runSettlementEngine } from './settlement-engine.js';
import { COMPONENTS } from './settlement-formula.js';

const NOT_FOUND = { code: 'SETTLEMENT_NOT_FOUND', label: 'Driver settlement' };
const ENTITY = 'DriverSettlement';
const user = { select: { id: true, name: true } };
const LIST_INCLUDE = { driver: { select: { id: true, fullName: true, driverCode: true } } };
const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  items: { orderBy: [{ component: 'asc' }, { sourceDate: 'asc' }, { id: 'asc' }] },
  revisions: { orderBy: { version: 'desc' }, include: { reopenedBy: user } },
  payments: {
    orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    include: { createdBy: user, reversedBy: user },
  },
  createdBy: user,
  calculatedBy: user,
  submittedBy: user,
  approvedBy: user,
  finalizedBy: user,
};

/** Payment status from final amount and valid payments (spec §32). */
export function derivePaymentStatus(finalAmount, paidAmount) {
  const paid = toDecimal(paidAmount);
  if (paid.gte(toDecimal(finalAmount))) return 'PAID';
  return paid.isZero() ? 'UNPAID' : 'PARTIALLY_PAID';
}

// ---- Reads --------------------------------------------------------------------------

export function listSettlements({
  page,
  pageSize,
  sortBy,
  sortDir,
  month,
  driverId,
  status,
  paymentStatus,
}) {
  return findPage(prisma.driverSettlement, {
    where: {
      ...(month && { settlementMonth: month }),
      ...(driverId && { driverId }),
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
    },
    orderBy: [{ [sortBy]: sortDir }, { id: 'desc' }],
    include: LIST_INCLUDE,
    page,
    pageSize,
  });
}

/** Detail with items, revisions and whether the stored calculation is still current. */
export async function getSettlement(id) {
  const s = await findOr404(prisma.driverSettlement, id, { ...NOT_FOUND, include: DETAIL_INCLUDE });
  const current = await runSettlementEngine(prisma, s.driverId, s.settlementMonth);
  return {
    ...s,
    outstandingAmount: s.status === 'FINALIZED' ? s.finalAmount.minus(s.paidAmount) : null,
    isStale: s.status !== 'DRAFT' && s.calculationHash !== current.hash,
    components: COMPONENTS.map((c) => ({ ...c, amount: s[c.key] })),
  };
}

/** Status counts and totals for a month (dashboard / list header). */
export async function monthSummary({ month }) {
  const rows = await prisma.driverSettlement.groupBy({
    by: ['status'],
    where: month ? { settlementMonth: month } : {},
    _count: true,
    _sum: { finalAmount: true, paidAmount: true },
  });
  const zero = new Decimal(0);
  const byStatus = Object.fromEntries(
    rows.map((r) => [
      r.status,
      {
        count: r._count,
        finalAmount: r._sum.finalAmount ?? zero,
        paidAmount: r._sum.paidAmount ?? zero,
      },
    ]),
  );
  const finalized = byStatus.FINALIZED ?? { count: 0, finalAmount: zero, paidAmount: zero };
  return {
    byStatus,
    finalizedTotal: finalized.finalAmount,
    paidTotal: finalized.paidAmount,
    outstandingTotal: finalized.finalAmount.minus(finalized.paidAmount),
  };
}

// ---- Workflow helpers ---------------------------------------------------------------

async function loadLocked(tx, id) {
  await lockRow(tx, 'driver_settlements', id);
  return findOr404(tx.driverSettlement, id, NOT_FOUND);
}

function assertStatus(s, allowed, action) {
  if (!allowed.includes(s.status)) {
    throw AppError.conflict(
      `Cannot ${action} a settlement that is ${s.status.replace('_', ' ').toLowerCase()} (allowed from: ${allowed.join(', ')})`,
      'INVALID_SETTLEMENT_TRANSITION',
    );
  }
}

/** Refuse to move forward if the data changed since the settlement was calculated. */
async function assertFresh(tx, s) {
  const current = await runSettlementEngine(tx, s.driverId, s.settlementMonth);
  if (current.hash !== s.calculationHash) {
    throw AppError.conflict(
      'The underlying data changed after this settlement was calculated. Recalculate it first.',
      'SETTLEMENT_STALE',
    );
  }
  return current;
}

async function transition(tx, { before, data, action, actor, reason, req }) {
  const after = await tx.driverSettlement.update({
    where: { id: before.id },
    data,
    include: LIST_INCLUDE,
  });
  await recordAudit(tx, {
    userId: actor.id,
    action,
    entityType: ENTITY,
    entityId: before.id,
    previousValue: {
      status: before.status,
      finalAmount: before.finalAmount,
      version: before.version,
    },
    newValue: { status: after.status, finalAmount: after.finalAmount, version: after.version },
    reason,
    req,
  });
  return after;
}

/** Write the engine output onto the settlement (components, items, hash). */
async function storeCalculation(tx, settlement, result, actor) {
  await tx.driverSettlementItem.deleteMany({ where: { settlementId: settlement.id } });
  if (result.items.length) {
    await tx.driverSettlementItem.createMany({
      data: result.items.map((i) => ({ ...i, settlementId: settlement.id })),
    });
  }
  return tx.driverSettlement.update({
    where: { id: settlement.id },
    data: {
      ...result.components,
      grossEarnings: result.grossEarnings,
      totalAdditions: result.totalAdditions,
      totalDeductions: result.totalDeductions,
      finalAmount: result.finalAmount,
      itemCount: result.itemCount,
      calculationHash: result.hash,
      status: 'CALCULATED',
      calculatedAt: new Date(),
      calculatedById: actor.id,
    },
    include: LIST_INCLUDE,
  });
}

// ---- Workflow (spec §29–31) ---------------------------------------------------------

export async function createSettlement({ driverId, settlementMonth }, actor, req) {
  if (settlementMonth > todayInBusinessTz().slice(0, 7)) {
    throw AppError.badRequest('Cannot create a settlement for a future month', 'VALIDATION_ERROR', [
      { path: 'settlementMonth', message: 'Future month' },
    ]);
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({ where: { id: driverId } });
      if (!driver) {
        throw AppError.badRequest('Driver does not exist', 'INVALID_REFERENCE', [
          { path: 'driverId', message: 'Select a valid driver' },
        ]);
      }
      const s = await tx.driverSettlement.create({
        data: { driverId, settlementMonth, createdById: actor.id },
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: ENTITY,
        entityId: s.id,
        newValue: { driverId, settlementMonth, status: 'DRAFT' },
        req,
      });
      return storeCalculation(
        tx,
        s,
        await runSettlementEngine(tx, driverId, settlementMonth),
        actor,
      );
    }, LOCKING_TX);
  } catch (err) {
    rethrowUnique(err, {
      driver_id: {
        path: 'settlementMonth',
        message: 'This driver already has a settlement for this month',
      },
    });
  }
}

/** DRAFT/CALCULATED → CALCULATED with a fresh calculation. */
export function calculateSettlement(id, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(before, ['DRAFT', 'CALCULATED'], 'calculate');
    const result = await runSettlementEngine(tx, before.driverId, before.settlementMonth);
    const after = await storeCalculation(tx, before, result, actor);
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CALCULATE,
      entityType: ENTITY,
      entityId: id,
      previousValue: { status: before.status, finalAmount: before.finalAmount },
      newValue: {
        status: after.status,
        finalAmount: after.finalAmount,
        itemCount: after.itemCount,
      },
      req,
    });
    return after;
  }, LOCKING_TX);
}

/** Biller submits a calculated settlement for Admin review. */
export function submitSettlement(id, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(before, ['CALCULATED'], 'submit');
    await assertFresh(tx, before);
    return transition(tx, {
      before,
      data: { status: 'UNDER_REVIEW', submittedAt: new Date(), submittedById: actor.id },
      action: AUDIT_ACTIONS.SUBMIT,
      actor,
      req,
    });
  }, LOCKING_TX);
}

/** UNDER_REVIEW → DRAFT: the preparer withdraws, or the Admin rejects with a reason. */
export function returnToDraft(id, { reason }, actor, req, { reject }) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(
      before,
      reject ? ['UNDER_REVIEW', 'APPROVED'] : ['UNDER_REVIEW'],
      reject ? 'reject' : 'withdraw',
    );
    return transition(tx, {
      before,
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
      },
      action: reject ? AUDIT_ACTIONS.REJECT : AUDIT_ACTIONS.UPDATE,
      actor,
      reason: reason ?? 'Withdrawn from review',
      req,
    });
  }, LOCKING_TX);
}

/** Admin approval. */
export function approveSettlement(id, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(before, ['UNDER_REVIEW'], 'approve');
    await assertFresh(tx, before);
    return transition(tx, {
      before,
      data: { status: 'APPROVED', approvedAt: new Date(), approvedById: actor.id },
      action: AUDIT_ACTIONS.APPROVE,
      actor,
      req,
    });
  }, LOCKING_TX);
}

/**
 * Admin finalization. The final amount must not be negative (A24) and must cover any
 * payments already made against this settlement (relevant after a reopen).
 */
export function finalizeSettlement(id, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(before, ['APPROVED'], 'finalize');
    await assertFresh(tx, before);
    if (before.finalAmount.isNegative()) {
      throw AppError.conflict(
        `The final settlement is negative (₹${before.finalAmount.toFixed(2)}). Reduce the advance recovery or carry the balance forward as an other deduction next month.`,
        'NEGATIVE_SETTLEMENT',
      );
    }
    if (before.paidAmount.gt(before.finalAmount)) {
      throw AppError.conflict(
        `Payments already made (₹${before.paidAmount.toFixed(2)}) exceed the final amount (₹${before.finalAmount.toFixed(2)}). Reverse the excess payment first.`,
        'PAID_EXCEEDS_FINAL',
      );
    }
    return transition(tx, {
      before,
      data: {
        status: 'FINALIZED',
        paymentStatus: derivePaymentStatus(before.finalAmount, before.paidAmount),
        finalizedAt: new Date(),
        finalizedById: actor.id,
      },
      action: AUDIT_ACTIONS.FINALIZE,
      actor,
      req,
    });
  }, LOCKING_TX);
}

/**
 * Admin reopen (spec §31): mandatory reason; the finalized state (settlement + items) is
 * preserved as a revision; the settlement returns to DRAFT, so recalculation,
 * re-approval and re-finalization are all required again.
 */
export function reopenSettlement(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadLocked(tx, id);
    assertStatus(before, ['FINALIZED'], 'reopen');
    const items = await tx.driverSettlementItem.findMany({ where: { settlementId: id } });
    await tx.driverSettlementRevision.create({
      data: {
        settlementId: id,
        version: before.version,
        // Same wire format as the API (money as 2dp strings, dates as YYYY-MM-DD).
        snapshot: serialize({ settlement: before, items }),
        reason,
        reopenedById: actor.id,
      },
    });
    return transition(tx, {
      before,
      data: {
        status: 'DRAFT',
        paymentStatus: null,
        version: { increment: 1 },
        reopenCount: { increment: 1 },
        submittedAt: null,
        submittedById: null,
        approvedAt: null,
        approvedById: null,
        finalizedAt: null,
        finalizedById: null,
      },
      action: AUDIT_ACTIONS.REOPEN,
      actor,
      reason,
      req,
    });
  }, LOCKING_TX);
}

/**
 * Prepare all settlements for a month: create a calculated draft for every driver with
 * activity, and recalculate existing DRAFT/CALCULATED ones. Others are left untouched.
 */
export async function prepareMonth({ settlementMonth }, actor, req) {
  const where = { settlementMonth, status: 'ACTIVE' };
  const sources = await Promise.all([
    prisma.trip.findMany({ where, select: { driverId: true }, distinct: ['driverId'] }),
    prisma.driverEarning.findMany({ where, select: { driverId: true }, distinct: ['driverId'] }),
    prisma.driverAdjustment.findMany({ where, select: { driverId: true }, distinct: ['driverId'] }),
    prisma.driverExpense.findMany({ where, select: { driverId: true }, distinct: ['driverId'] }),
    prisma.advanceRecovery.findMany({ where, select: { driverId: true }, distinct: ['driverId'] }),
  ]);
  const driverIds = [...new Set(sources.flat().map((r) => r.driverId))].sort((a, b) => a - b);
  const existing = new Map(
    (await prisma.driverSettlement.findMany({ where: { settlementMonth } })).map((s) => [
      s.driverId,
      s,
    ]),
  );

  const result = { created: 0, recalculated: 0, skipped: 0 };
  for (const driverId of driverIds) {
    const s = existing.get(driverId);
    if (!s) {
      await createSettlement({ driverId, settlementMonth }, actor, req);
      result.created += 1;
    } else if (s.status === 'DRAFT' || s.status === 'CALCULATED') {
      await calculateSettlement(s.id, actor, req);
      result.recalculated += 1;
    } else {
      result.skipped += 1;
    }
  }
  return result;
}
