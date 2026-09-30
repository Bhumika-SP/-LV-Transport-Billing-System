import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { activeOnWhere, periodStatus } from '../../utils/periods.js';
import { findOr404, rethrowUnique, updateAction } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

const UNIQUE_FIELDS = {
  driver_code: { path: 'driverCode', message: 'A driver with this code already exists' },
  license_number: {
    path: 'licenseNumber',
    message: 'A driver with this licence number already exists',
  },
};

const NOT_FOUND = { code: 'DRIVER_NOT_FOUND', label: 'Driver' };

const DATE_FIELDS = ['joiningDate', 'licenseExpiryDate'];

function toDbData(data) {
  const out = { ...data };
  for (const f of DATE_FIELDS) {
    if (out[f] !== undefined) out[f] = out[f] ? parseDateOnly(out[f]) : null;
  }
  return out;
}

/** Bank account numbers are masked in lists; full value only on the detail endpoint. */
function maskAccount(driver) {
  if (!driver.bankAccountNumber) return driver;
  return { ...driver, bankAccountNumber: `••••${driver.bankAccountNumber.slice(-4)}` };
}

export async function listDrivers({ page, pageSize, search, sortBy, sortDir, status }) {
  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { fullName: { contains: search } },
        { driverCode: { contains: search } },
        { phone: { contains: search } },
        { licenseNumber: { contains: search } },
      ],
    }),
  };
  const result = await findPage(prisma.driver, {
    where,
    orderBy: { [sortBy]: sortDir },
    page,
    pageSize,
  });
  return { ...result, items: result.items.map(maskAccount) };
}

export function driverOptions({ includeInactive }) {
  return prisma.driver.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    select: { id: true, fullName: true, driverCode: true, status: true },
    orderBy: { fullName: 'asc' },
  });
}

export async function getDriver(id) {
  const driver = await findOr404(prisma.driver, id, NOT_FOUND);
  const today = parseDateOnly(todayInBusinessTz());
  const current = await prisma.driverAssignment.findFirst({
    where: { driverId: id, ...activeOnWhere(today) },
    orderBy: { startDate: 'desc' },
    include: { vehicle: { select: { id: true, registrationNumber: true } } },
  });
  return { ...driver, currentVehicle: current?.vehicle ?? null };
}

export async function createDriver(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Without an explicit code, insert with a unique placeholder, then derive DRV-0001 from the id.
      let driver = await tx.driver.create({
        data: {
          ...toDbData(data),
          driverCode: data.driverCode ?? `TMP-${randomUUID().slice(0, 12)}`,
          createdById: actor.id,
        },
      });
      if (!data.driverCode) {
        driver = await tx.driver.update({
          where: { id: driver.id },
          data: { driverCode: `DRV-${String(driver.id).padStart(4, '0')}` },
        });
      }
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'Driver',
        entityId: driver.id,
        newValue: driver,
        req,
      });
      return driver;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

export async function updateDriver(id, input, actor, req) {
  // The driver code is required; an empty value on update means "keep the current code".
  const { driverCode, ...rest } = input;
  const data = driverCode ? { ...rest, driverCode } : rest;
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await findOr404(tx.driver, id, NOT_FOUND);
      const after = await tx.driver.update({ where: { id }, data: toDbData(data) });
      await recordAudit(tx, {
        userId: actor.id,
        action: updateAction(data, before, AUDIT_ACTIONS),
        entityType: 'Driver',
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

/** Assignment history (driver → vehicle) with the vehicle's company at the time. */
export async function driverAssignments(id) {
  await findOr404(prisma.driver, id, NOT_FOUND);
  const today = parseDateOnly(todayInBusinessTz());
  const rows = await prisma.driverAssignment.findMany({
    where: { driverId: id },
    orderBy: { startDate: 'desc' },
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          vehicleType: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({ ...r, periodStatus: periodStatus(r.startDate, r.endDate, today) }));
}
