import { prisma } from '../../lib/prisma.js';
import { todayInBusinessTz } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, rethrowUnique, updateAction } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { ratesOnDate } from '../rates/rates.service.js';

const UNIQUE_FIELDS = {
  name: { path: 'name', message: 'A vehicle type with this name already exists' },
};
const NOT_FOUND = { code: 'VEHICLE_TYPE_NOT_FOUND', label: 'Vehicle type' };

export async function listVehicleTypes({ page, pageSize, search, sortBy, sortDir, status }) {
  const result = await findPage(prisma.vehicleType, {
    where: { ...(status && { status }), ...(search && { name: { contains: search } }) },
    orderBy: { [sortBy]: sortDir },
    include: { _count: { select: { vehicles: true } } },
    page,
    pageSize,
  });
  const current = await ratesOnDate(
    result.items.map((t) => t.id),
    todayInBusinessTz(),
  );
  return {
    ...result,
    items: result.items.map(({ _count, ...t }) => ({
      ...t,
      vehicleCount: _count.vehicles,
      currentRate: current[t.id] ?? null,
    })),
  };
}

export function vehicleTypeOptions({ includeInactive }) {
  return prisma.vehicleType.findMany({
    where: includeInactive ? {} : { status: 'ACTIVE' },
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' },
  });
}

export async function getVehicleType(id) {
  const type = await findOr404(prisma.vehicleType, id, {
    ...NOT_FOUND,
    include: { _count: { select: { vehicles: true } } },
  });
  const current = await ratesOnDate([id], todayInBusinessTz());
  const { _count, ...rest } = type;
  return { ...rest, vehicleCount: _count.vehicles, currentRate: current[id] ?? null };
}

export async function createVehicleType(data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const type = await tx.vehicleType.create({ data: { ...data, createdById: actor.id } });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'VehicleType',
        entityId: type.id,
        newValue: type,
        req,
      });
      return type;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

export async function updateVehicleType(id, data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await findOr404(tx.vehicleType, id, NOT_FOUND);
      const after = await tx.vehicleType.update({ where: { id }, data });
      await recordAudit(tx, {
        userId: actor.id,
        action: updateAction(data, before, AUDIT_ACTIONS),
        entityType: 'VehicleType',
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
