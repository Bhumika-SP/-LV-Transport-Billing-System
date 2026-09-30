import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, lockRow } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { assertSettlementOpen } from '../settlements/settlement-lock.js';

const NOT_FOUND = { code: 'ADVANCE_NOT_FOUND', label: 'Advance' };
const RECOVERY_NOT_FOUND = { code: 'RECOVERY_NOT_FOUND', label: 'Advance recovery' };
const INCLUDE = {
  driver: { select: { id: true, fullName: true, driverCode: true } },
  createdBy: { select: { id: true, name: true } },
  recoveries: {
    orderBy: [{ settlementMonth: 'asc' }, { id: 'asc' }],
    include: { createdBy: { select: { id: true, name: true } } },
  },
};

/**
 * Outstanding = advance amount − Σ ACTIVE recoveries (spec §25).
 * Pure; the stored recovered/outstanding columns are always written from this.
 */
export function calculateAdvanceBalance(amount, activeRecoveryAmounts) {
  const recovered = roundMoney(
    activeRecoveryAmounts.reduce((acc, a) => acc.plus(toDecimal(a)), new Decimal(0)),
  );
  const outstanding = roundMoney(toDecimal(amount).minus(recovered));
  return { recovered, outstanding, status: outstanding.isZero() ? 'RECOVERED' : 'OPEN' };
}

function assertNotFuture(dateStr, path) {
  if (dateStr > todayInBusinessTz()) {
    throw AppError.badRequest('Date cannot be in the future', 'VALIDATION_ERROR', [
      { path, message: 'Cannot be in the future' },
    ]);
  }
}

export function listAdvances({ page, pageSize, driverId, status }) {
  return findPage(prisma.driverAdvance, {
    where: { ...(driverId && { driverId }), ...(status && { status }) },
    orderBy: [{ advanceDate: 'desc' }, { id: 'desc' }],
    include: INCLUDE,
    page,
    pageSize,
  });
}

export function getAdvance(id) {
  return findOr404(prisma.driverAdvance, id, { ...NOT_FOUND, include: INCLUDE });
}

/** Outstanding advance totals (per driver, or overall). */
export async function outstandingSummary({ driverId }) {
  const agg = await prisma.driverAdvance.aggregate({
    where: { status: { in: ['OPEN', 'RECOVERED'] }, ...(driverId && { driverId }) },
    _sum: { amount: true, recoveredAmount: true, outstandingAmount: true },
    _count: true,
  });
  const zero = new Decimal(0);
  return {
    count: agg._count,
    advanced: agg._sum.amount ?? zero,
    recovered: agg._sum.recoveredAmount ?? zero,
    outstanding: agg._sum.outstandingAmount ?? zero,
  };
}

export async function createAdvance(data, actor, req) {
  assertNotFuture(data.advanceDate, 'advanceDate');
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: data.driverId } });
    if (!driver) {
      throw AppError.badRequest('Driver does not exist', 'INVALID_REFERENCE', [
        { path: 'driverId', message: 'Select a valid driver' },
      ]);
    }
    const advance = await tx.driverAdvance.create({
      data: {
        ...data,
        advanceDate: parseDateOnly(data.advanceDate),
        outstandingAmount: data.amount,
        createdById: actor.id,
      },
      include: INCLUDE,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'DriverAdvance',
      entityId: advance.id,
      newValue: advance,
      req,
    });
    return advance;
  });
}

/** Recompute and store recovered/outstanding/status from ACTIVE recoveries. */
async function refreshBalance(tx, advance) {
  const active = await tx.advanceRecovery.findMany({
    where: { advanceId: advance.id, status: 'ACTIVE' },
    select: { amount: true },
  });
  const balance = calculateAdvanceBalance(
    advance.amount,
    active.map((r) => r.amount),
  );
  return tx.driverAdvance.update({
    where: { id: advance.id },
    data: {
      recoveredAmount: balance.recovered,
      outstandingAmount: balance.outstanding,
      status: balance.status,
    },
    include: INCLUDE,
  });
}

/**
 * Record a (partial) recovery against a settlement month. The advance row is locked so
 * concurrent recoveries can never exceed the outstanding balance (spec §25, scenario §80).
 */
export function recordRecovery(advanceId, data, actor, req) {
  const recoveryDate = data.recoveryDate ?? todayInBusinessTz();
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, 'driver_advances', advanceId);
    const advance = await findOr404(tx.driverAdvance, advanceId, NOT_FOUND);
    if (advance.status !== 'OPEN') {
      throw AppError.conflict(
        advance.status === 'RECOVERED'
          ? 'This advance is already fully recovered'
          : 'This advance is void',
        'ADVANCE_NOT_OPEN',
      );
    }
    if (toDecimal(data.amount).gt(advance.outstandingAmount)) {
      throw AppError.conflict(
        `Recovery ₹${toDecimal(data.amount).toFixed(2)} exceeds the outstanding balance ₹${advance.outstandingAmount.toFixed(2)}`,
        'RECOVERY_EXCEEDS_OUTSTANDING',
        [{ path: 'amount', message: `Maximum ${advance.outstandingAmount.toFixed(2)}` }],
      );
    }
    await assertSettlementOpen(tx, advance.driverId, data.settlementMonth);

    const recovery = await tx.advanceRecovery.create({
      data: {
        advanceId,
        driverId: advance.driverId,
        settlementMonth: data.settlementMonth,
        amount: data.amount,
        recoveryDate: parseDateOnly(recoveryDate),
        notes: data.notes,
        createdById: actor.id,
      },
    });
    const updated = await refreshBalance(tx, advance);
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'AdvanceRecovery',
      entityId: recovery.id,
      previousValue: { outstandingAmount: advance.outstandingAmount },
      newValue: { ...recovery, outstandingAmount: updated.outstandingAmount },
      req,
    });
    return updated;
  }, LOCKING_TX);
}

/** Void a recovery (restores the outstanding balance). */
export function voidRecovery(recoveryId, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const recovery = await findOr404(tx.advanceRecovery, recoveryId, RECOVERY_NOT_FOUND);
    await lockRow(tx, 'driver_advances', recovery.advanceId);
    const current = await tx.advanceRecovery.findUnique({ where: { id: recoveryId } });
    if (current.status !== 'ACTIVE')
      throw AppError.conflict('This recovery is already void', 'ALREADY_VOID');
    await assertSettlementOpen(tx, current.driverId, current.settlementMonth);

    await tx.advanceRecovery.update({
      where: { id: recoveryId },
      data: { status: 'VOID', voidReason: reason, voidedAt: new Date(), voidedById: actor.id },
    });
    const advance = await tx.driverAdvance.findUnique({ where: { id: current.advanceId } });
    const updated = await refreshBalance(tx, advance);
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CANCEL,
      entityType: 'AdvanceRecovery',
      entityId: recoveryId,
      previousValue: current,
      newValue: { status: 'VOID', outstandingAmount: updated.outstandingAmount },
      reason,
      req,
    });
    return updated;
  }, LOCKING_TX);
}

/** Void an advance entered in error. Only possible while nothing has been recovered. */
export function voidAdvance(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, 'driver_advances', id);
    const before = await findOr404(tx.driverAdvance, id, NOT_FOUND);
    if (before.status === 'VOID')
      throw AppError.conflict('This advance is already void', 'ALREADY_VOID');
    const active = await tx.advanceRecovery.count({ where: { advanceId: id, status: 'ACTIVE' } });
    if (active > 0) {
      throw AppError.conflict(
        'This advance has recoveries; void them first',
        'ADVANCE_HAS_RECOVERIES',
      );
    }
    const after = await tx.driverAdvance.update({
      where: { id },
      data: {
        status: 'VOID',
        outstandingAmount: 0,
        voidReason: reason,
        voidedAt: new Date(),
        voidedById: actor.id,
      },
      include: INCLUDE,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CANCEL,
      entityType: 'DriverAdvance',
      entityId: id,
      previousValue: before,
      newValue: after,
      reason,
      req,
    });
    return after;
  }, LOCKING_TX);
}

/** ACTIVE recoveries (for settlement preparation and the driver page). */
export function listRecoveries({ driverId, month }) {
  return prisma.advanceRecovery.findMany({
    where: {
      status: 'ACTIVE',
      ...(driverId && { driverId }),
      ...(month && { settlementMonth: month }),
    },
    orderBy: [{ settlementMonth: 'desc' }, { id: 'desc' }],
    include: { advance: { select: { id: true, advanceDate: true, amount: true, reason: true } } },
  });
}
