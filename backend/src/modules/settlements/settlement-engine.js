import { createHash } from 'node:crypto';
import { toDateString } from '../../utils/dates.js';
import { Decimal, roundMoney } from '../../utils/money.js';
import { calculateDriverSettlement } from './settlement-formula.js';

/**
 * Deterministic settlement engine (spec §63).
 * Inputs: every ACTIVE source row for the driver and settlement month.
 * Output: one item per source row, component totals, the final amount (via
 * settlement-formula.js) and a fingerprint of the inputs.
 */

/** Component → key in settlement-formula.js COMPONENTS. */
export const COMPONENT_KEYS = {
  TRIP_EARNINGS: 'tripEarnings',
  ALLOWANCE: 'allowances',
  OTHER_EARNING: 'otherEarnings',
  POSITIVE_ADJUSTMENT: 'positiveAdjustments',
  REIMBURSEMENT: 'reimbursements',
  FUEL: 'fuel',
  TOLL: 'toll',
  MAINTENANCE: 'maintenance',
  EMI: 'emi',
  ADVANCE_RECOVERY: 'advanceRecovery',
  OTHER_DEDUCTION: 'otherDeductions',
};

const DEDUCT = new Set([
  'FUEL',
  'TOLL',
  'MAINTENANCE',
  'EMI',
  'ADVANCE_RECOVERY',
  'OTHER_DEDUCTION',
]);

const item = (component, sourceType, sourceId, sourceDate, description, amount) => ({
  component,
  direction: DEDUCT.has(component) ? 'DEDUCT' : 'ADD',
  sourceType,
  sourceId,
  sourceDate,
  description: description.slice(0, 500),
  amount: roundMoney(amount),
});

/** Collect every eligible source row as a settlement item. */
export async function gatherSettlementItems(db, driverId, settlementMonth) {
  const where = { driverId, settlementMonth, status: 'ACTIVE' };
  const [trips, earnings, adjustments, expenses, recoveries] = await Promise.all([
    db.trip.findMany({
      where,
      orderBy: [{ tripDate: 'asc' }, { id: 'asc' }],
      include: { company: true },
    }),
    db.driverEarning.findMany({ where, orderBy: { id: 'asc' } }),
    db.driverAdjustment.findMany({ where, orderBy: { id: 'asc' } }),
    db.driverExpense.findMany({ where, orderBy: { id: 'asc' }, include: { vehicle: true } }),
    db.advanceRecovery.findMany({ where, orderBy: { id: 'asc' }, include: { advance: true } }),
  ]);

  return [
    ...trips.map((t) =>
      item(
        'TRIP_EARNINGS',
        'TRIP',
        t.id,
        t.tripDate,
        `${t.company.name} trip ${toDateString(t.tripDate)}${t.externalTripId ? ` (${t.externalTripId})` : ''}: ${t.totalKm.toFixed(2)} km × ₹${t.ratePerKm.toFixed(2)}`,
        t.earnings,
      ),
    ),
    ...earnings.map((e) =>
      item(
        e.type === 'ALLOWANCE' ? 'ALLOWANCE' : 'OTHER_EARNING',
        'DRIVER_EARNING',
        e.id,
        e.earningDate,
        e.description,
        e.amount,
      ),
    ),
    ...adjustments.map((a) =>
      item(a.type, 'ADJUSTMENT', a.id, a.adjustmentDate, a.reason, a.amount),
    ),
    ...expenses.map((x) =>
      item(
        x.paidBy === 'DRIVER' ? 'REIMBURSEMENT' : x.category,
        'EXPENSE',
        x.id,
        x.expenseDate,
        `${x.paidBy === 'DRIVER' ? `Driver-paid ${x.category.toLowerCase()}` : `LV-paid ${x.category.toLowerCase()}`} · ${x.vehicle.registrationNumber} · ${x.description}`,
        x.amount,
      ),
    ),
    ...recoveries.map((r) =>
      item(
        'ADVANCE_RECOVERY',
        'ADVANCE_RECOVERY',
        r.id,
        r.recoveryDate,
        `Recovery of advance #${r.advanceId} dated ${toDateString(r.advance.advanceDate)} (${r.advance.reason})`,
        r.amount,
      ),
    ),
  ];
}

/** Stable fingerprint of the calculation inputs. */
export function fingerprint(items) {
  const lines = items
    .map((i) => `${i.component}|${i.sourceType}|${i.sourceId}|${roundMoney(i.amount).toFixed(2)}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** Items → component totals → formula result. */
export function computeFromItems(items) {
  const components = Object.fromEntries(
    Object.values(COMPONENT_KEYS).map((k) => [k, new Decimal(0)]),
  );
  for (const i of items) {
    const key = COMPONENT_KEYS[i.component];
    components[key] = components[key].plus(i.amount);
  }
  return {
    ...calculateDriverSettlement(components),
    hash: fingerprint(items),
    itemCount: items.length,
  };
}

/** Run the engine for one driver-month against current data. */
export async function runSettlementEngine(db, driverId, settlementMonth) {
  const items = await gatherSettlementItems(db, driverId, settlementMonth);
  return { items, ...computeFromItems(items) };
}
