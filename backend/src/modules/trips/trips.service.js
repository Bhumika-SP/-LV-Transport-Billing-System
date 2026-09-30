import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { monthOf, parseDateOnly, toDateString, todayInBusinessTz } from '../../utils/dates.js';
import { Decimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { activeOnWhere } from '../../utils/periods.js';
import { findOr404, rethrowUnique } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { resolveRate } from '../rates/rates.service.js';
import { assertSettlementOpen } from '../settlements/settlement-lock.js';
import { calculateTripEarnings, resolveKm } from './trip-calculations.js';

const NOT_FOUND = { code: 'TRIP_NOT_FOUND', label: 'Trip' };
const ENTITY = 'Trip';
const UNIQUE_FIELDS = {
  external_trip_id: {
    path: 'externalTripId',
    message: 'This company already has a trip with this external trip ID',
  },
};

const LIST_INCLUDE = {
  company: { select: { id: true, name: true, code: true } },
  driver: { select: { id: true, fullName: true, driverCode: true } },
  vehicle: { select: { id: true, registrationNumber: true } },
  vehicleType: { select: { id: true, name: true } },
};

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  rate: {
    select: { id: true, ratePerKm: true, effectiveFrom: true, effectiveTo: true, status: true },
  },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true } },
};

const validationError = (message, details) =>
  AppError.badRequest(message, 'VALIDATION_ERROR', details);

/**
 * Validate references, KM and date, find the rate effective on the trip date and
 * compute earnings. Used by create, update, preview and recalculation.
 * Assignment mismatches are returned as WARNINGS (assumption A5), not errors.
 *
 * `fixedRate` ({ id, ratePerKm, vehicleTypeId }) skips the rate lookup and prices with
 * the rate a trip already carries (edits that do not change the date or vehicle).
 */
export async function priceTrip(db, input, { fixedRate } = {}) {
  const [company, driver, vehicle] = await Promise.all([
    db.company.findUnique({ where: { id: input.companyId } }),
    db.driver.findUnique({ where: { id: input.driverId } }),
    db.vehicle.findUnique({ where: { id: input.vehicleId }, include: { vehicleType: true } }),
  ]);
  const missing = [
    !company && { path: 'companyId', message: 'Company does not exist' },
    !driver && { path: 'driverId', message: 'Driver does not exist' },
    !vehicle && { path: 'vehicleId', message: 'Vehicle does not exist' },
  ].filter(Boolean);
  if (missing.length) throw AppError.badRequest('Invalid reference', 'INVALID_REFERENCE', missing);

  if (input.tripDate > todayInBusinessTz()) {
    throw validationError('Trip date cannot be in the future', [
      { path: 'tripDate', message: 'Cannot be in the future' },
    ]);
  }

  const km = resolveKm(input);
  if (!km.ok) throw validationError('Invalid KM values', km.errors);

  const rate = fixedRate ?? (await resolveRate(vehicle.vehicleTypeId, input.tripDate, db));
  if (!rate) {
    throw new AppError(
      `No active ${vehicle.vehicleType.name} rate is effective on ${input.tripDate}. Add a rate before recording this trip.`,
      {
        status: 422,
        code: 'RATE_NOT_FOUND',
        details: [
          { path: 'tripDate', message: `No ${vehicle.vehicleType.name} rate on this date` },
        ],
      },
    );
  }

  const date = parseDateOnly(input.tripDate);
  const [vehicleOnCompany, driverOnVehicle] = await Promise.all([
    db.vehicleAssignment.findFirst({
      where: { vehicleId: vehicle.id, companyId: company.id, ...activeOnWhere(date) },
    }),
    db.driverAssignment.findFirst({
      where: { driverId: driver.id, vehicleId: vehicle.id, ...activeOnWhere(date) },
    }),
  ]);
  const warnings = [
    company.status !== 'ACTIVE' && `Company ${company.name} is inactive`,
    driver.status !== 'ACTIVE' && `Driver ${driver.fullName} is inactive`,
    vehicle.status !== 'ACTIVE' && `Vehicle ${vehicle.registrationNumber} is inactive`,
    !vehicleOnCompany &&
      `Vehicle ${vehicle.registrationNumber} is not assigned to ${company.name} on ${input.tripDate}`,
    !driverOnVehicle &&
      `Driver ${driver.fullName} is not assigned to ${vehicle.registrationNumber} on ${input.tripDate}`,
  ].filter(Boolean);

  return {
    vehicleType: fixedRate ? { id: fixedRate.vehicleTypeId } : vehicle.vehicleType,
    rate,
    km: km.km,
    earnings: calculateTripEarnings(km.km.totalKm, rate.ratePerKm),
    warnings,
  };
}

function tripData(input, priced) {
  return {
    companyId: input.companyId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    vehicleTypeId: priced.vehicleType.id,
    tripDate: parseDateOnly(input.tripDate),
    settlementMonth: monthOf(input.tripDate),
    kmSource: priced.km.kmSource,
    startKm: priced.km.startKm,
    endKm: priced.km.endKm,
    totalKm: priced.km.totalKm,
    rateId: priced.rate.id,
    ratePerKm: priced.rate.ratePerKm,
    earnings: priced.earnings,
  };
}

/** Calculation preview for the entry form (no data is written). */
export async function previewTrip(input) {
  const priced = await priceTrip(prisma, input);
  return {
    vehicleType: { id: priced.vehicleType.id, name: priced.vehicleType.name },
    rate: priced.rate,
    totalKm: priced.km.totalKm,
    earnings: priced.earnings,
    warnings: priced.warnings,
  };
}

function filterWhere(f) {
  const where = {
    ...(f.companyId && { companyId: f.companyId }),
    ...(f.driverId && { driverId: f.driverId }),
    ...(f.vehicleId && { vehicleId: f.vehicleId }),
    ...(f.vehicleTypeId && { vehicleTypeId: f.vehicleTypeId }),
    ...(f.status && { status: f.status }),
    ...(f.source && { source: f.source }),
    ...(f.month && { settlementMonth: f.month }),
  };
  if (f.fromDate || f.toDate) {
    where.tripDate = {
      ...(f.fromDate && { gte: parseDateOnly(f.fromDate) }),
      ...(f.toDate && { lte: parseDateOnly(f.toDate) }),
    };
  }
  if (f.search) {
    where.OR = [
      { externalTripId: { contains: f.search } },
      { tripReference: { contains: f.search } },
      { pickup: { contains: f.search } },
      { dropLocation: { contains: f.search } },
    ];
  }
  return where;
}

export function listTrips({ page, pageSize, sortBy, sortDir, ...filters }) {
  return findPage(prisma.trip, {
    where: filterWhere(filters),
    orderBy: [{ [sortBy]: sortDir }, { id: 'desc' }],
    include: LIST_INCLUDE,
    page,
    pageSize,
  });
}

/** Totals over ACTIVE trips matching the filters (cancelled trips never count). */
export async function summarizeTrips(filters) {
  const agg = await prisma.trip.aggregate({
    where: { ...filterWhere(filters), status: 'ACTIVE' },
    _count: true,
    _sum: { totalKm: true, earnings: true },
  });
  return {
    tripCount: agg._count,
    totalKm: agg._sum.totalKm ?? new Decimal(0),
    totalEarnings: agg._sum.earnings ?? new Decimal(0),
  };
}

export function getTrip(id) {
  return findOr404(prisma.trip, id, { ...NOT_FOUND, include: DETAIL_INCLUDE });
}

export async function createTrip(input, actor, req, { source = 'MANUAL' } = {}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const priced = await priceTrip(tx, input);
      await assertSettlementOpen(tx, input.driverId, monthOf(input.tripDate));
      const trip = await tx.trip.create({
        data: {
          ...tripData(input, priced),
          externalTripId: input.externalTripId,
          tripReference: input.tripReference,
          pickup: input.pickup,
          dropLocation: input.dropLocation,
          notes: input.notes,
          source,
          createdById: actor.id,
        },
        include: DETAIL_INCLUDE,
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: ENTITY,
        entityId: trip.id,
        newValue: trip,
        req,
      });
      return { trip, warnings: priced.warnings };
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

async function loadActive(tx, id) {
  const trip = await findOr404(tx.trip, id, NOT_FOUND);
  if (trip.status !== 'ACTIVE') {
    throw AppError.conflict('Cancelled trips cannot be changed', 'TRIP_CANCELLED');
  }
  return trip;
}

/** Current stored values as priceTrip() input. */
function toInput(trip) {
  return {
    companyId: trip.companyId,
    driverId: trip.driverId,
    vehicleId: trip.vehicleId,
    tripDate: toDateString(trip.tripDate),
    kmSource: trip.kmSource,
    startKm: trip.startKm?.toFixed(2) ?? null,
    endKm: trip.endKm?.toFixed(2) ?? null,
    totalKm: trip.totalKm.toFixed(2),
  };
}

/**
 * Edit a trip. The stored rate is kept unless the trip date or vehicle changes, in
 * which case the rate effective on the (new) date is applied — the same rule as for a
 * new trip. KM changes recompute earnings with the applicable rate.
 */
export async function updateTrip(id, changes, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await loadActive(tx, id);
      const merged = { ...toInput(before), ...changes };
      // Both the month the trip leaves and the month it lands in must be open.
      await assertSettlementOpen(tx, before.driverId, before.settlementMonth);
      if (
        merged.driverId !== before.driverId ||
        monthOf(merged.tripDate) !== before.settlementMonth
      ) {
        await assertSettlementOpen(tx, merged.driverId, monthOf(merged.tripDate));
      }
      if (changes.kmSource === 'DIRECT' && changes.totalKm === undefined) {
        merged.totalKm = before.totalKm.toFixed(2);
      }

      // Same date and vehicle: keep the rate this trip was priced with. Otherwise apply
      // the rate effective on the (new) date, exactly as for a new trip.
      const rateContextChanged =
        merged.tripDate !== toDateString(before.tripDate) || merged.vehicleId !== before.vehicleId;
      const priced = await priceTrip(
        tx,
        merged,
        rateContextChanged
          ? {}
          : {
              fixedRate: {
                id: before.rateId,
                ratePerKm: before.ratePerKm,
                vehicleTypeId: before.vehicleTypeId,
              },
            },
      );
      const pricing = tripData(merged, priced);

      const after = await tx.trip.update({
        where: { id },
        data: {
          ...pricing,
          ...['externalTripId', 'tripReference', 'pickup', 'dropLocation', 'notes'].reduce(
            (acc, k) => (changes[k] !== undefined ? { ...acc, [k]: changes[k] } : acc),
            {},
          ),
          updatedById: actor.id,
        },
        include: DETAIL_INCLUDE,
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: ENTITY,
        entityId: id,
        previousValue: before,
        newValue: after,
        req,
      });
      return { trip: after, warnings: priced.warnings };
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

export function cancelTrip(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const before = await loadActive(tx, id);
    await assertSettlementOpen(tx, before.driverId, before.settlementMonth);
    const after = await tx.trip.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledById: actor.id,
      },
      include: DETAIL_INCLUDE,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CANCEL,
      entityType: ENTITY,
      entityId: id,
      previousValue: before,
      newValue: after,
      reason,
      req,
    });
    return after;
  });
}

/**
 * Explicit, authorized recalculation (spec §17): re-resolve the rate effective on the
 * trip date from CURRENT master data (vehicle type and rate history) and re-price.
 * Returns { trip, changed }.
 */
async function recalculateOne(tx, trip, actor, reason, req) {
  const priced = await priceTrip(tx, toInput(trip));
  const next = tripData(toInput(trip), priced);
  await assertSettlementOpen(tx, trip.driverId, trip.settlementMonth);
  const changed =
    next.rateId !== trip.rateId ||
    next.vehicleTypeId !== trip.vehicleTypeId ||
    !next.earnings.equals(trip.earnings);
  if (!changed) return { trip, changed: false };

  const after = await tx.trip.update({
    where: { id: trip.id },
    data: {
      vehicleTypeId: next.vehicleTypeId,
      rateId: next.rateId,
      ratePerKm: next.ratePerKm,
      earnings: next.earnings,
      updatedById: actor.id,
    },
    include: DETAIL_INCLUDE,
  });
  await recordAudit(tx, {
    userId: actor.id,
    action: AUDIT_ACTIONS.RECALCULATE,
    entityType: ENTITY,
    entityId: trip.id,
    previousValue: { rateId: trip.rateId, ratePerKm: trip.ratePerKm, earnings: trip.earnings },
    newValue: { rateId: after.rateId, ratePerKm: after.ratePerKm, earnings: after.earnings },
    reason,
    req,
  });
  return { trip: after, changed: true };
}

export function recalculateTrip(id, { reason }, actor, req) {
  return prisma.$transaction(async (tx) => {
    const trip = await loadActive(tx, id);
    return recalculateOne(tx, trip, actor, reason, req);
  });
}

/**
 * Recalculate all ACTIVE trips of a vehicle type in a date range (e.g. after a rate
 * correction). All-or-nothing: if any trip cannot be priced, nothing changes.
 */
export async function bulkRecalculate(
  { vehicleTypeId, fromDate, toDate, companyId, reason },
  actor,
  req,
) {
  return prisma.$transaction(
    async (tx) => {
      const trips = await tx.trip.findMany({
        where: {
          status: 'ACTIVE',
          // Trips priced as this type, or whose vehicle is now of this type.
          OR: [{ vehicleTypeId }, { vehicle: { vehicleTypeId } }],
          tripDate: { gte: parseDateOnly(fromDate), lte: parseDateOnly(toDate) },
          ...(companyId && { companyId }),
        },
        orderBy: { id: 'asc' },
      });
      let changed = 0;
      for (const trip of trips) {
        try {
          if ((await recalculateOne(tx, trip, actor, reason, req)).changed) changed += 1;
        } catch (err) {
          if (err instanceof AppError) {
            throw new AppError(
              `Trip #${trip.id} (${toDateString(trip.tripDate)}): ${err.message}`,
              {
                status: err.status,
                code: err.code,
              },
            );
          }
          throw err;
        }
      }
      return { examined: trips.length, changed, unchanged: trips.length - changed };
    },
    { timeout: 60_000 },
  );
}
