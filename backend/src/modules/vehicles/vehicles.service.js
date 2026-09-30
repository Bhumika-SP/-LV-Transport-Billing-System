import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { activeOnWhere, periodStatus } from '../../utils/periods.js';
import { findOr404, rethrowUnique, updateAction } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { ratesOnDate } from '../rates/rates.service.js';

const UNIQUE_FIELDS = {
  registration_number: {
    path: 'registrationNumber',
    message: 'A vehicle with this registration number already exists',
  },
};
const NOT_FOUND = { code: 'VEHICLE_NOT_FOUND', label: 'Vehicle' };
const DATE_FIELDS = ['insuranceExpiryDate', 'fitnessExpiryDate', 'permitExpiryDate'];

function toDbData(data) {
  const out = { ...data };
  for (const f of DATE_FIELDS) {
    if (out[f] !== undefined) out[f] = out[f] ? parseDateOnly(out[f]) : null;
  }
  return out;
}

async function assertVehicleType(db, vehicleTypeId) {
  if (vehicleTypeId === undefined) return;
  const type = await db.vehicleType.findUnique({ where: { id: vehicleTypeId } });
  if (!type) {
    throw AppError.badRequest('Vehicle type does not exist', 'INVALID_REFERENCE', [
      { path: 'vehicleTypeId', message: 'Select a valid vehicle type' },
    ]);
  }
}

const today = () => parseDateOnly(todayInBusinessTz());

export async function listVehicles({
  page,
  pageSize,
  search,
  sortBy,
  sortDir,
  status,
  vehicleTypeId,
  companyId,
}) {
  const where = {
    ...(status && { status }),
    ...(vehicleTypeId && { vehicleTypeId }),
    ...(companyId && {
      companyAssignments: { some: { companyId, ...activeOnWhere(today()) } },
    }),
    ...(search && {
      OR: [
        { registrationNumber: { contains: search.replace(/[\s-]/g, '') } },
        { make: { contains: search } },
        { model: { contains: search } },
      ],
    }),
  };
  const result = await findPage(prisma.vehicle, {
    where,
    orderBy: { [sortBy]: sortDir },
    include: {
      vehicleType: { select: { id: true, name: true } },
      companyAssignments: {
        where: activeOnWhere(today()),
        take: 1,
        orderBy: { startDate: 'desc' },
        select: { company: { select: { id: true, name: true } } },
      },
      driverAssignments: {
        where: activeOnWhere(today()),
        take: 1,
        orderBy: { startDate: 'desc' },
        select: { driver: { select: { id: true, fullName: true } } },
      },
    },
    page,
    pageSize,
  });
  return {
    ...result,
    items: result.items.map(({ companyAssignments, driverAssignments, ...v }) => ({
      ...v,
      currentCompany: companyAssignments[0]?.company ?? null,
      currentDriver: driverAssignments[0]?.driver ?? null,
    })),
  };
}

export function vehicleOptions({ includeInactive }) {
  return prisma.vehicle.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    select: {
      id: true,
      registrationNumber: true,
      status: true,
      vehicleType: { select: { id: true, name: true } },
    },
    orderBy: { registrationNumber: 'asc' },
  });
}

/** Vehicle with its type, current rate, current company and current driver. */
export async function getVehicle(id) {
  const vehicle = await findOr404(prisma.vehicle, id, {
    ...NOT_FOUND,
    include: { vehicleType: { select: { id: true, name: true, status: true } } },
  });
  const [company, driver, rates] = await Promise.all([
    prisma.vehicleAssignment.findFirst({
      where: { vehicleId: id, ...activeOnWhere(today()) },
      orderBy: { startDate: 'desc' },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.driverAssignment.findFirst({
      where: { vehicleId: id, ...activeOnWhere(today()) },
      orderBy: { startDate: 'desc' },
      include: { driver: { select: { id: true, fullName: true, driverCode: true } } },
    }),
    ratesOnDate([vehicle.vehicleTypeId], todayInBusinessTz()),
  ]);
  return {
    ...vehicle,
    currentCompany: company?.company ?? null,
    currentDriver: driver?.driver ?? null,
    currentRate: rates[vehicle.vehicleTypeId] ?? null,
  };
}

export async function createVehicle(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      await assertVehicleType(tx, data.vehicleTypeId);
      const vehicle = await tx.vehicle.create({
        data: { ...toDbData(data), createdById: actor.id },
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'Vehicle',
        entityId: vehicle.id,
        newValue: vehicle,
        req,
      });
      return vehicle;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

/**
 * Changing a vehicle's type affects only FUTURE trip rate lookups; existing trips keep
 * the vehicle type and rate stored on them.
 */
export async function updateVehicle(id, data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await findOr404(tx.vehicle, id, NOT_FOUND);
      await assertVehicleType(tx, data.vehicleTypeId);
      const after = await tx.vehicle.update({ where: { id }, data: toDbData(data) });
      await recordAudit(tx, {
        userId: actor.id,
        action: updateAction(data, before, AUDIT_ACTIONS),
        entityType: 'Vehicle',
        entityId: id,
        previousValue: before,
        newValue: after,
        req,
      });
      return after;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

/** Company and driver assignment history for a vehicle. */
export async function vehicleAssignments(id) {
  await findOr404(prisma.vehicle, id, NOT_FOUND);
  const [companies, drivers] = await Promise.all([
    prisma.vehicleAssignment.findMany({
      where: { vehicleId: id },
      orderBy: { startDate: 'desc' },
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.driverAssignment.findMany({
      where: { vehicleId: id },
      orderBy: { startDate: 'desc' },
      include: { driver: { select: { id: true, fullName: true, driverCode: true } } },
    }),
  ]);
  const t = today();
  const withStatus = (r) => ({ ...r, periodStatus: periodStatus(r.startDate, r.endDate, t) });
  return { companies: companies.map(withStatus), drivers: drivers.map(withStatus) };
}
