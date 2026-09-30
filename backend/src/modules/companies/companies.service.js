import { prisma } from '../../lib/prisma.js';
import { parseDateOnly, todayInBusinessTz } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { activeOnWhere, periodStatus } from '../../utils/periods.js';
import { findOr404, rethrowUnique, updateAction } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

const UNIQUE_FIELDS = {
  name: { path: 'name', message: 'A company with this name already exists' },
  code: { path: 'code', message: 'A company with this code already exists' },
};

const NOT_FOUND = { code: 'COMPANY_NOT_FOUND', label: 'Company' };

export function listCompanies({ page, pageSize, search, sortBy, sortDir, status }) {
  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { code: { contains: search } },
        { contactPerson: { contains: search } },
        { gstin: { contains: search } },
        { phone: { contains: search } },
      ],
    }),
  };
  return findPage(prisma.company, { where, orderBy: { [sortBy]: sortDir }, page, pageSize });
}

/** Lightweight list for dropdowns. */
export function companyOptions({ includeInactive }) {
  return prisma.company.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    select: { id: true, name: true, code: true, status: true },
    orderBy: { name: 'asc' },
  });
}

export async function getCompany(id) {
  const company = await findOr404(prisma.company, id, NOT_FOUND);
  const today = parseDateOnly(todayInBusinessTz());
  const currentVehicles = await prisma.vehicleAssignment.count({
    where: { companyId: id, ...activeOnWhere(today) },
  });
  return { ...company, currentVehicleCount: currentVehicles };
}

export async function createCompany(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { ...data, createdById: actor.id } });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'Company',
        entityId: company.id,
        newValue: company,
        req,
      });
      return company;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

export async function updateCompany(id, data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await findOr404(tx.company, id, NOT_FOUND);
      const after = await tx.company.update({ where: { id }, data });
      await recordAudit(tx, {
        userId: actor.id,
        action: updateAction(data, before, AUDIT_ACTIONS),
        entityType: 'Company',
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

/** Vehicles associated with the company through (historical) vehicle assignments. */
export async function companyVehicles(id) {
  await findOr404(prisma.company, id, NOT_FOUND);
  const today = parseDateOnly(todayInBusinessTz());
  const rows = await prisma.vehicleAssignment.findMany({
    where: { companyId: id },
    orderBy: [{ startDate: 'desc' }],
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          status: true,
          vehicleType: { select: { id: true, name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({ ...r, periodStatus: periodStatus(r.startDate, r.endDate, today) }));
}

/**
 * Drivers associated with the company: drivers whose driver-assignment overlaps a
 * vehicle-assignment of this company. The reported period is the intersection.
 */
export async function companyDrivers(id) {
  const vehicleAssignments = await companyVehicles(id);
  if (vehicleAssignments.length === 0) return [];

  const driverAssignments = await prisma.driverAssignment.findMany({
    where: { vehicleId: { in: [...new Set(vehicleAssignments.map((v) => v.vehicleId))] } },
    include: {
      driver: { select: { id: true, driverCode: true, fullName: true, phone: true, status: true } },
    },
  });

  const today = parseDateOnly(todayInBusinessTz());
  const result = [];
  for (const va of vehicleAssignments) {
    for (const da of driverAssignments.filter((d) => d.vehicleId === va.vehicleId)) {
      const start = da.startDate > va.startDate ? da.startDate : va.startDate;
      const ends = [da.endDate, va.endDate].filter(Boolean);
      const end = ends.length ? new Date(Math.min(...ends.map((d) => d.getTime()))) : null;
      if (end && end < start) continue;
      result.push({
        driver: da.driver,
        vehicle: va.vehicle,
        startDate: start,
        endDate: end,
        periodStatus: periodStatus(start, end, today),
      });
    }
  }
  return result.sort((a, b) => b.startDate - a.startDate);
}
