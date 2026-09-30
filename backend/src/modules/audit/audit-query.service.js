import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, addDays } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { AUDIT_ACTIONS } from './audit.service.js';

/**
 * Read side of the audit trail (spec §55–57). The trail itself is append-only: there is
 * no API to change it, and database triggers reject UPDATE/DELETE on audit_logs.
 */

const USER = { select: { id: true, name: true, email: true, role: { select: { code: true } } } };

/** Business-timezone date bounds → UTC instants for created_at. */
function createdRange(fromDate, toDate) {
  if (!fromDate && !toDate) return undefined;
  // Dates are IST calendar days; IST is UTC+05:30 with no DST.
  const at = (d) => new Date(parseDateOnly(d).getTime() - 330 * 60_000);
  return {
    ...(fromDate && { gte: at(fromDate) }),
    ...(toDate && { lt: at(addDays(toDate, 1)) }),
  };
}

function buildWhere({ userId, action, entityType, entityId, fromDate, toDate, search }) {
  return {
    ...(userId && { userId }),
    ...(action?.length && { action: { in: action } }),
    ...(entityType && { entityType }),
    ...(entityId && { entityId: String(entityId) }),
    ...(createdRange(fromDate, toDate) && { createdAt: createdRange(fromDate, toDate) }),
    ...(search && {
      OR: [{ reason: { contains: search } }, { requestId: search }, { ip: search }],
    }),
  };
}

export function listAuditLogs({ page, pageSize, ...filters }) {
  return findPage(prisma.auditLog, {
    where: buildWhere(filters),
    include: { user: USER },
    orderBy: { id: 'desc' },
    page,
    pageSize,
  });
}

export async function getAuditLog(id) {
  const log = await prisma.auditLog.findUnique({ where: { id }, include: { user: USER } });
  if (!log) throw AppError.notFound('Audit record not found', 'AUDIT_NOT_FOUND');
  return log;
}

/** Complete history of one record, oldest first. */
export function entityHistory(entityType, entityId) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId: String(entityId) },
    include: { user: USER },
    orderBy: { id: 'asc' },
    take: 1000,
  });
}

/** Filter options: every action code and the entity types present in the trail. */
export async function auditMeta() {
  const [entityTypes, users] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ['entityType'],
      select: { entityType: true },
      orderBy: { entityType: 'asc' },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    actions: Object.values(AUDIT_ACTIONS),
    entityTypes: entityTypes.map((e) => e.entityType),
    users,
  };
}
