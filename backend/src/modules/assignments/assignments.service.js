import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly, toDateString, todayInBusinessTz } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { activeOnWhere, overlapWhere, periodStatus } from '../../utils/periods.js';
import { findOr404, lockRow } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { getSetting } from '../settings/settings.service.js';
import { ASSIGNMENT_KINDS } from './assignments.config.js';

const NOT_FOUND = { code: 'ASSIGNMENT_NOT_FOUND', label: 'Assignment' };

function withStatus(row) {
  const today = parseDateOnly(todayInBusinessTz());
  return { ...row, periodStatus: periodStatus(row.startDate, row.endDate, today) };
}

/** Both parties must exist; new assignments require ACTIVE parties. */
async function assertParties(tx, kind, data, { requireActive }) {
  for (const p of kind.parties) {
    const row = await tx[p.model].findUnique({ where: { id: data[p.field] } });
    if (!row) {
      throw AppError.badRequest(`${p.label} does not exist`, 'INVALID_REFERENCE', [
        { path: p.field, message: `Select a valid ${p.label.toLowerCase()}` },
      ]);
    }
    if (requireActive && row.status !== 'ACTIVE') {
      throw AppError.badRequest(`${p.label} is inactive`, 'INACTIVE_REFERENCE', [
        { path: p.field, message: `${p.label} is inactive` },
      ]);
    }
  }
}

/** Lock both parent rows so concurrent assignment changes for them are serialized. */
async function lockParties(tx, kind, values) {
  for (const p of kind.parties) await lockRow(tx, p.table, values[p.field]);
}

/** Enforce the configured overlap rules. Call only after lockParties(). */
async function assertNoOverlap(tx, kind, { start, end, values, excludeId }) {
  for (const rule of kind.overlapRules) {
    if (await getSetting(rule.setting, tx)) continue;
    const clash = await tx[kind.delegate].findFirst({
      where: {
        [rule.field]: values[rule.field],
        ...(excludeId && { id: { not: excludeId } }),
        ...overlapWhere(start, end),
      },
      include: kind.include,
    });
    if (clash) {
      const period = `${toDateString(clash.startDate)} – ${clash.endDate ? toDateString(clash.endDate) : 'open'}`;
      throw AppError.conflict(`${rule.message} (${period})`, 'ASSIGNMENT_OVERLAP', [
        { path: 'startDate', message: rule.message },
      ]);
    }
  }
}

function assertDateOrder(start, end) {
  if (end && end < start) {
    throw AppError.badRequest('End date must be on or after start date', 'VALIDATION_ERROR', [
      { path: 'endDate', message: 'Must be on or after the start date' },
    ]);
  }
}

export function listAssignments(kindKey, query) {
  const kind = ASSIGNMENT_KINDS[kindKey];
  const { page, pageSize, sortBy, sortDir, current, ...filters } = query;
  const where = {
    ...Object.fromEntries(
      kind.parties.filter((p) => filters[p.field]).map((p) => [p.field, filters[p.field]]),
    ),
    ...(current && activeOnWhere(parseDateOnly(todayInBusinessTz()))),
  };
  return findPage(prisma[kind.delegate], {
    where,
    orderBy: [{ [sortBy]: sortDir }, { id: 'desc' }],
    include: kind.include,
    page,
    pageSize,
  }).then((r) => ({ ...r, items: r.items.map(withStatus) }));
}

export async function createAssignment(kindKey, data, actor, req) {
  const kind = ASSIGNMENT_KINDS[kindKey];
  const start = parseDateOnly(data.startDate);
  const end = data.endDate ? parseDateOnly(data.endDate) : null;
  assertDateOrder(start, end);

  return prisma.$transaction(async (tx) => {
    await lockParties(tx, kind, data);
    await assertParties(tx, kind, data, { requireActive: true });
    await assertNoOverlap(tx, kind, { start, end, values: data });
    const row = await tx[kind.delegate].create({
      data: {
        ...Object.fromEntries(kind.parties.map((p) => [p.field, data[p.field]])),
        startDate: start,
        endDate: end,
        notes: data.notes,
        createdById: actor.id,
      },
      include: kind.include,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: kind.entityType,
      entityId: row.id,
      newValue: row,
      req,
    });
    return withStatus(row);
  }, LOCKING_TX);
}

/** Change dates/notes, or end an assignment (set endDate). Parties are immutable. */
export async function updateAssignment(kindKey, id, data, actor, req) {
  const kind = ASSIGNMENT_KINDS[kindKey];
  return prisma.$transaction(async (tx) => {
    // Parties are immutable, so reading them before locking is safe; everything else is read after.
    const parties = await findOr404(tx[kind.delegate], id, NOT_FOUND);
    await lockParties(tx, kind, parties);
    const before = await tx[kind.delegate].findUnique({ where: { id } });
    const start = data.startDate ? parseDateOnly(data.startDate) : before.startDate;
    const end =
      data.endDate === undefined
        ? before.endDate
        : data.endDate
          ? parseDateOnly(data.endDate)
          : null;
    assertDateOrder(start, end);
    await assertNoOverlap(tx, kind, { start, end, values: before, excludeId: id });

    const after = await tx[kind.delegate].update({
      where: { id },
      data: {
        startDate: start,
        endDate: end,
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: kind.include,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: kind.entityType,
      entityId: id,
      previousValue: before,
      newValue: after,
      req,
    });
    return withStatus(after);
  }, LOCKING_TX);
}
