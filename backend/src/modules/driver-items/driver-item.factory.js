import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { monthOf, parseDateOnly } from '../../utils/dates.js';
import { Decimal } from '../../utils/money.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404 } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

/**
 * Shared behaviour for driver financial line items (earnings, adjustments, expenses):
 * list with filters, create (driver must exist; settlement month defaults to the item
 * date's month), void with a reason (never delete), and totals by type.
 *
 * Hooks:
 *   validate(tx, data)       extra rules before insert (e.g. expense category by payer)
 *   guard(tx, driverId, m)   runs before any write for that driver + settlement month
 *                            (used to lock months whose settlement is under review/finalized)
 */
export function createDriverItemService({
  model,
  entityType,
  notFoundCode,
  dateField,
  typeField = 'type',
  include = {},
  validate,
  guard,
}) {
  const notFound = { code: notFoundCode, label: entityType };
  const baseInclude = {
    driver: { select: { id: true, fullName: true, driverCode: true } },
    createdBy: { select: { id: true, name: true } },
    voidedBy: { select: { id: true, name: true } },
    ...include,
  };

  function where({ driverId, month, type, status, fromDate, toDate, ...rest }) {
    const w = {
      ...(driverId && { driverId }),
      ...(month && { settlementMonth: month }),
      ...(type && { [typeField]: type }),
      ...(status && { status }),
      ...rest,
    };
    if (fromDate || toDate) {
      w[dateField] = {
        ...(fromDate && { gte: parseDateOnly(fromDate) }),
        ...(toDate && { lte: parseDateOnly(toDate) }),
      };
    }
    return w;
  }

  return {
    where,

    list({ page, pageSize, sortBy, sortDir, ...filters }) {
      return findPage(prisma[model], {
        where: where(filters),
        orderBy: [{ [sortBy === 'date' ? dateField : sortBy]: sortDir }, { id: 'desc' }],
        include: baseInclude,
        page,
        pageSize,
      });
    },

    /** ACTIVE totals per type for the filters. */
    async totals(filters) {
      const rows = await prisma[model].groupBy({
        by: [typeField],
        where: { ...where(filters), status: 'ACTIVE' },
        _sum: { amount: true },
        _count: true,
      });
      return rows.map((r) => ({
        type: r[typeField],
        count: r._count,
        amount: r._sum.amount ?? new Decimal(0),
      }));
    },

    async create(data, actor, req) {
      return prisma.$transaction(async (tx) => {
        const driver = await tx.driver.findUnique({ where: { id: data.driverId } });
        if (!driver) {
          throw AppError.badRequest('Driver does not exist', 'INVALID_REFERENCE', [
            { path: 'driverId', message: 'Select a valid driver' },
          ]);
        }
        const settlementMonth = data.settlementMonth ?? monthOf(data[dateField]);
        await validate?.(tx, data);
        await guard?.(tx, data.driverId, settlementMonth);
        const row = await tx[model].create({
          data: {
            ...data,
            [dateField]: parseDateOnly(data[dateField]),
            settlementMonth,
            createdById: actor.id,
          },
          include: baseInclude,
        });
        await recordAudit(tx, {
          userId: actor.id,
          action: AUDIT_ACTIONS.CREATE,
          entityType,
          entityId: row.id,
          newValue: row,
          req,
        });
        return row;
      });
    },

    async void(id, { reason }, actor, req) {
      return prisma.$transaction(async (tx) => {
        const before = await findOr404(tx[model], id, notFound);
        if (before.status !== 'ACTIVE') {
          throw AppError.conflict('This item is already void', 'ALREADY_VOID');
        }
        await guard?.(tx, before.driverId, before.settlementMonth);
        const after = await tx[model].update({
          where: { id },
          data: { status: 'VOID', voidReason: reason, voidedAt: new Date(), voidedById: actor.id },
          include: baseInclude,
        });
        await recordAudit(tx, {
          userId: actor.id,
          action: AUDIT_ACTIONS.CANCEL,
          entityType,
          entityId: id,
          previousValue: before,
          newValue: after,
          reason,
          req,
        });
        return after;
      });
    },
  };
}
