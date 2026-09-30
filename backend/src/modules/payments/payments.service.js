import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, lockRow } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { derivePaymentStatus } from '../settlements/settlements.service.js';

const NOT_FOUND = { code: 'PAYMENT_NOT_FOUND', label: 'Payment' };
const INCLUDE = {
  driver: { select: { id: true, fullName: true, driverCode: true } },
  settlement: { select: { id: true, settlementMonth: true, finalAmount: true, status: true } },
  createdBy: { select: { id: true, name: true } },
  reversedBy: { select: { id: true, name: true } },
};

/**
 * OUTSTANDING = FINAL SETTLEMENT − TOTAL VALID PAYMENTS (spec §32, §64). Pure.
 */
export function calculateOutstandingPayment(finalAmount, validPaymentAmounts) {
  const paid = roundMoney(
    validPaymentAmounts.reduce((acc, a) => acc.plus(toDecimal(a)), new Decimal(0)),
  );
  return {
    paid,
    outstanding: roundMoney(toDecimal(finalAmount).minus(paid)),
    status: derivePaymentStatus(finalAmount, paid),
  };
}

/** Recompute paidAmount / paymentStatus on the settlement from its VALID payments. */
async function refreshSettlement(tx, settlement) {
  const valid = await tx.driverPayment.findMany({
    where: { settlementId: settlement.id, status: 'VALID' },
    select: { amount: true },
  });
  const r = calculateOutstandingPayment(
    settlement.finalAmount,
    valid.map((p) => p.amount),
  );
  return tx.driverSettlement.update({
    where: { id: settlement.id },
    data: {
      paidAmount: r.paid,
      // Payment status applies only to finalized settlements (A2).
      paymentStatus: settlement.status === 'FINALIZED' ? r.status : null,
    },
  });
}

function where({ driverId, settlementId, month, method, status, fromDate, toDate }) {
  const w = {
    ...(driverId && { driverId }),
    ...(settlementId && { settlementId }),
    ...(month && { settlement: { settlementMonth: month } }),
    ...(method && { paymentMethod: method }),
    ...(status && { status }),
  };
  if (fromDate || toDate) {
    w.paymentDate = {
      ...(fromDate && { gte: parseDateOnly(fromDate) }),
      ...(toDate && { lte: parseDateOnly(toDate) }),
    };
  }
  return w;
}

export function listPayments({ page, pageSize, ...filters }) {
  return findPage(prisma.driverPayment, {
    where: where(filters),
    orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
    include: INCLUDE,
    page,
    pageSize,
  });
}

/** VALID payment totals for the filters, overall and per method. */
export async function paymentSummary(filters) {
  const rows = await prisma.driverPayment.groupBy({
    by: ['paymentMethod'],
    where: { ...where(filters), status: 'VALID' },
    _sum: { amount: true },
    _count: true,
  });
  const byMethod = rows.map((r) => ({
    method: r.paymentMethod,
    count: r._count,
    amount: r._sum.amount ?? new Decimal(0),
  }));
  return {
    count: byMethod.reduce((n, r) => n + r.count, 0),
    total: roundMoney(byMethod.reduce((acc, r) => acc.plus(r.amount), new Decimal(0))),
    byMethod,
  };
}

/**
 * Record a payment. Only FINALIZED settlements are payable, and a payment can never
 * exceed the outstanding amount (the settlement row is locked, so concurrent
 * payments are serialized).
 */
export function recordPayment(settlementId, data, actor, req) {
  if (data.paymentDate > todayInBusinessTz()) {
    throw AppError.badRequest('Payment date cannot be in the future', 'VALIDATION_ERROR', [
      { path: 'paymentDate', message: 'Cannot be in the future' },
    ]);
  }
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, 'driver_settlements', settlementId);
    const s = await findOr404(tx.driverSettlement, settlementId, {
      code: 'SETTLEMENT_NOT_FOUND',
      label: 'Driver settlement',
    });
    if (s.status !== 'FINALIZED') {
      throw AppError.conflict('Only finalized settlements can be paid', 'SETTLEMENT_NOT_FINALIZED');
    }
    const outstanding = s.finalAmount.minus(s.paidAmount);
    if (toDecimal(data.amount).gt(outstanding)) {
      throw AppError.conflict(
        `Payment ₹${toDecimal(data.amount).toFixed(2)} exceeds the outstanding ₹${outstanding.toFixed(2)}`,
        'PAYMENT_EXCEEDS_OUTSTANDING',
        [{ path: 'amount', message: `Maximum ${outstanding.toFixed(2)}` }],
      );
    }
    const payment = await tx.driverPayment.create({
      data: {
        settlementId,
        driverId: s.driverId,
        amount: data.amount,
        paymentDate: parseDateOnly(data.paymentDate),
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        proofReference: data.proofReference,
        createdById: actor.id,
      },
      include: INCLUDE,
    });
    const after = await refreshSettlement(tx, s);
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.PAYMENT,
      entityType: 'DriverPayment',
      entityId: payment.id,
      previousValue: { paidAmount: s.paidAmount, paymentStatus: s.paymentStatus },
      newValue: { ...payment, paidAmount: after.paidAmount, paymentStatus: after.paymentStatus },
      req,
    });
    return { payment, settlement: after };
  }, LOCKING_TX);
}

/** Admin reversal (the only correction mechanism). The payment row is kept. */
export function reversePayment(paymentId, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const found = await findOr404(tx.driverPayment, paymentId, NOT_FOUND);
    await lockRow(tx, 'driver_settlements', found.settlementId);
    const payment = await tx.driverPayment.findUnique({ where: { id: paymentId } });
    if (payment.status !== 'VALID') {
      throw AppError.conflict('This payment is already reversed', 'ALREADY_REVERSED');
    }
    const updated = await tx.driverPayment.update({
      where: { id: paymentId },
      data: {
        status: 'REVERSED',
        reversalReason: reason,
        reversedAt: new Date(),
        reversedById: actor.id,
      },
      include: INCLUDE,
    });
    const settlement = await tx.driverSettlement.findUnique({
      where: { id: payment.settlementId },
    });
    const after = await refreshSettlement(tx, settlement);
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.REVERSE,
      entityType: 'DriverPayment',
      entityId: paymentId,
      previousValue: payment,
      newValue: {
        status: 'REVERSED',
        paidAmount: after.paidAmount,
        paymentStatus: after.paymentStatus,
      },
      reason,
      req,
    });
    return { payment: updated, settlement: after };
  }, LOCKING_TX);
}
