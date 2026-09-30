import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { addDays, parseDateOnly, toDateString } from '../../utils/dates.js';
import { activeOnWhere, overlapWhere } from '../../utils/periods.js';
import { findOr404, lockRow } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

const RATE_PERIOD = { from: 'effectiveFrom', to: 'effectiveTo' };
const RATE_NOT_FOUND = { code: 'RATE_NOT_FOUND', label: 'Rate' };
const TYPE_NOT_FOUND = { code: 'VEHICLE_TYPE_NOT_FOUND', label: 'Vehicle type' };

/**
 * The ACTIVE rate for a vehicle type on a business date ("YYYY-MM-DD"), or null.
 * Active periods never overlap (see createRate), so at most one row matches.
 */
export function resolveRate(vehicleTypeId, dateStr, db = prisma) {
  return db.vehicleTypeRate.findFirst({
    where: {
      vehicleTypeId,
      status: 'ACTIVE',
      ...activeOnWhere(parseDateOnly(dateStr), RATE_PERIOD),
    },
  });
}

/** Current rates (on `dateStr`) for several vehicle types, keyed by type id. */
export async function ratesOnDate(vehicleTypeIds, dateStr, db = prisma) {
  const rows = await db.vehicleTypeRate.findMany({
    where: {
      vehicleTypeId: { in: vehicleTypeIds },
      status: 'ACTIVE',
      ...activeOnWhere(parseDateOnly(dateStr), RATE_PERIOD),
    },
  });
  return Object.fromEntries(rows.map((r) => [r.vehicleTypeId, r]));
}

export async function listRates(vehicleTypeId) {
  await findOr404(prisma.vehicleType, vehicleTypeId, TYPE_NOT_FOUND);
  return prisma.vehicleTypeRate.findMany({
    where: { vehicleTypeId },
    orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Add a rate period. Historical rates are never overwritten:
 *  - A new OPEN-ENDED rate closes the current open-ended rate (if it starts earlier)
 *    on the day before the new rate starts. The closure is audited.
 *  - Any remaining overlap with an ACTIVE rate is rejected (409 RATE_PERIOD_OVERLAP).
 * The vehicle-type row is locked so concurrent requests cannot create overlaps.
 */
export async function createRate(
  { vehicleTypeId, ratePerKm, effectiveFrom, effectiveTo, notes },
  actor,
  req,
) {
  return prisma.$transaction(async (tx) => {
    // Lock first: every read below must happen after the lock is held.
    await lockRow(tx, 'vehicle_types', vehicleTypeId);
    await findOr404(tx.vehicleType, vehicleTypeId, TYPE_NOT_FOUND);

    const from = parseDateOnly(effectiveFrom);
    const to = effectiveTo ? parseDateOnly(effectiveTo) : null;

    let closedPrevious = null;
    if (!to) {
      const openEnded = await tx.vehicleTypeRate.findFirst({
        where: { vehicleTypeId, status: 'ACTIVE', effectiveTo: null, effectiveFrom: { lt: from } },
      });
      if (openEnded) {
        closedPrevious = await tx.vehicleTypeRate.update({
          where: { id: openEnded.id },
          data: { effectiveTo: parseDateOnly(addDays(effectiveFrom, -1)) },
        });
        await recordAudit(tx, {
          userId: actor.id,
          action: AUDIT_ACTIONS.UPDATE,
          entityType: 'VehicleTypeRate',
          entityId: openEnded.id,
          previousValue: openEnded,
          newValue: closedPrevious,
          reason: `Closed automatically: superseded by new rate effective ${effectiveFrom}`,
          req,
        });
      }
    }

    const overlapping = await tx.vehicleTypeRate.findMany({
      where: { vehicleTypeId, status: 'ACTIVE', ...overlapWhere(from, to, RATE_PERIOD) },
      orderBy: { effectiveFrom: 'asc' },
    });
    if (overlapping.length) {
      const periods = overlapping.map(
        (r) =>
          `₹${r.ratePerKm.toFixed(2)}/km from ${toDateString(r.effectiveFrom)}` +
          (r.effectiveTo ? ` to ${toDateString(r.effectiveTo)}` : ' (open-ended)'),
      );
      throw AppError.conflict(
        `This period overlaps an existing active rate: ${periods.join('; ')}`,
        'RATE_PERIOD_OVERLAP',
        [{ path: 'effectiveFrom', message: 'Overlaps an existing active rate' }],
      );
    }

    const rate = await tx.vehicleTypeRate.create({
      data: {
        vehicleTypeId,
        ratePerKm,
        effectiveFrom: from,
        effectiveTo: to,
        notes,
        createdById: actor.id,
      },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: 'VehicleTypeRate',
      entityId: rate.id,
      newValue: rate,
      req,
    });
    // Trips already priced with the superseded rate but dated on/after the new rate keep
    // their stored rate (spec §17); report them so an admin can recalculate explicitly.
    const tripsOnPreviousRate = closedPrevious
      ? await tx.trip.count({
          where: { rateId: closedPrevious.id, status: 'ACTIVE', tripDate: { gte: from } },
        })
      : 0;
    return { rate, closedPrevious, tripsOnPreviousRate };
  }, LOCKING_TX);
}

/**
 * Cancel a rate entered in error. The row is kept (status CANCELLED) for history.
 * Trips already priced with it keep their stored rate and earnings (spec §17);
 * `tripsUsingRate` tells the admin how many may need an explicit recalculation.
 */
export async function cancelRate(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await findOr404(tx.vehicleTypeRate, id, RATE_NOT_FOUND);
    if (before.status === 'CANCELLED') {
      throw AppError.badRequest('This rate is already cancelled', 'RATE_ALREADY_CANCELLED');
    }
    const after = await tx.vehicleTypeRate.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledById: actor.id,
      },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CANCEL,
      entityType: 'VehicleTypeRate',
      entityId: id,
      previousValue: before,
      newValue: after,
      reason,
      req,
    });
    const tripsUsingRate = await tx.trip.count({ where: { rateId: id, status: 'ACTIVE' } });
    return { rate: after, tripsUsingRate };
  });
}
