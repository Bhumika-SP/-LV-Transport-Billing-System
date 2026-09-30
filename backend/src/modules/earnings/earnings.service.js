import { prisma } from '../../lib/prisma.js';
import { Decimal } from '../../utils/money.js';
import { createDriverItemService } from '../driver-items/driver-item.factory.js';
import { calculateGrossEarnings } from '../settlements/settlement-formula.js';
import { assertSettlementOpen } from '../settlements/settlement-lock.js';

/** Allowances and other earnings (spec §21). */
export const earningsService = createDriverItemService({
  model: 'driverEarning',
  entityType: 'DriverEarning',
  notFoundCode: 'EARNING_NOT_FOUND',
  dateField: 'earningDate',
  guard: assertSettlementOpen,
});

/** Positive adjustments and other deductions (spec §21, §26). */
export const adjustmentsService = createDriverItemService({
  model: 'driverAdjustment',
  entityType: 'DriverAdjustment',
  notFoundCode: 'ADJUSTMENT_NOT_FOUND',
  dateField: 'adjustmentDate',
  guard: assertSettlementOpen,
});

const zero = () => new Decimal(0);

/**
 * Gross earnings by driver×month (spec §21) for the given filters:
 *   trip earnings + allowances + other earnings + positive adjustments.
 * Only ACTIVE items count (cancelled trips and voided items never do).
 */
export async function grossEarningsBreakdown({ month, fromMonth, toMonth, driverId }) {
  const monthFilter = month
    ? { settlementMonth: month }
    : (fromMonth || toMonth) && {
        settlementMonth: { ...(fromMonth && { gte: fromMonth }), ...(toMonth && { lte: toMonth }) },
      };
  const where = { status: 'ACTIVE', ...(driverId && { driverId }), ...monthFilter };
  const by = ['driverId', 'settlementMonth'];

  const [trips, earnings, adjustments] = await Promise.all([
    prisma.trip.groupBy({ by, where, _sum: { earnings: true }, _count: true }),
    prisma.driverEarning.groupBy({ by: [...by, 'type'], where, _sum: { amount: true } }),
    prisma.driverAdjustment.groupBy({
      by,
      where: { ...where, type: 'POSITIVE_ADJUSTMENT' },
      _sum: { amount: true },
    }),
  ]);

  const rows = new Map();
  const row = (d, m) => {
    const key = `${d}|${m}`;
    if (!rows.has(key)) {
      rows.set(key, {
        driverId: d,
        settlementMonth: m,
        tripCount: 0,
        tripEarnings: zero(),
        allowances: zero(),
        otherEarnings: zero(),
        positiveAdjustments: zero(),
      });
    }
    return rows.get(key);
  };
  for (const t of trips) {
    const r = row(t.driverId, t.settlementMonth);
    r.tripEarnings = t._sum.earnings ?? zero();
    r.tripCount = t._count;
  }
  for (const e of earnings) {
    const r = row(e.driverId, e.settlementMonth);
    r[e.type === 'ALLOWANCE' ? 'allowances' : 'otherEarnings'] = e._sum.amount ?? zero();
  }
  for (const a of adjustments)
    row(a.driverId, a.settlementMonth).positiveAdjustments = a._sum.amount ?? zero();

  const drivers = await prisma.driver.findMany({
    where: { id: { in: [...new Set([...rows.values()].map((r) => r.driverId))] } },
    select: { id: true, fullName: true, driverCode: true },
  });
  const byId = new Map(drivers.map((d) => [d.id, d]));

  return [...rows.values()]
    .map((r) => ({ ...r, driver: byId.get(r.driverId), grossEarnings: calculateGrossEarnings(r) }))
    .sort(
      (a, b) =>
        b.settlementMonth.localeCompare(a.settlementMonth) ||
        a.driver.fullName.localeCompare(b.driver.fullName),
    );
}
