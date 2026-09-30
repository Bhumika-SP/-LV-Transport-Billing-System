import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';

/**
 * THE driver settlement formula (spec §21, §27). This file is the only place it exists;
 * earnings summaries, the settlement engine, reports and the UI all use its output.
 *
 *   GROSS EARNINGS   = TRIP EARNINGS + ALLOWANCES + OTHER EARNINGS + POSITIVE ADJUSTMENTS
 *   FINAL SETTLEMENT = GROSS EARNINGS + DRIVER-PAID REIMBURSEMENTS
 *                      − FUEL − TOLL − MAINTENANCE − EMI − ADVANCE RECOVERY − OTHER DEDUCTIONS
 *
 * All amounts are Decimal; results are rounded to paise.
 */
export const COMPONENTS = [
  { key: 'tripEarnings', label: 'Trip earnings', direction: 'ADD', gross: true },
  { key: 'allowances', label: 'Allowances', direction: 'ADD', gross: true },
  { key: 'otherEarnings', label: 'Other earnings', direction: 'ADD', gross: true },
  { key: 'positiveAdjustments', label: 'Positive adjustments', direction: 'ADD', gross: true },
  { key: 'reimbursements', label: 'Driver-paid reimbursements', direction: 'ADD' },
  { key: 'fuel', label: 'Fuel (LV-paid)', direction: 'DEDUCT' },
  { key: 'toll', label: 'Toll (LV-paid)', direction: 'DEDUCT' },
  { key: 'maintenance', label: 'Maintenance (LV-paid)', direction: 'DEDUCT' },
  { key: 'emi', label: 'EMI (LV-paid)', direction: 'DEDUCT' },
  { key: 'advanceRecovery', label: 'Advance recovery', direction: 'DEDUCT' },
  { key: 'otherDeductions', label: 'Other deductions', direction: 'DEDUCT' },
];

const sum = (values) => values.reduce((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));

/** Missing components count as zero. */
function normalize(components) {
  return Object.fromEntries(COMPONENTS.map((c) => [c.key, roundMoney(components[c.key] ?? 0)]));
}

export function calculateGrossEarnings(components) {
  const c = normalize(components);
  return roundMoney(sum(COMPONENTS.filter((x) => x.gross).map((x) => c[x.key])));
}

/**
 * Full settlement calculation. Returns every component, subtotals and the final amount
 * so the breakdown can be shown and stored exactly as computed.
 */
export function calculateDriverSettlement(components) {
  const c = normalize(components);
  const grossEarnings = calculateGrossEarnings(c);
  const totalAdditions = roundMoney(
    sum(COMPONENTS.filter((x) => x.direction === 'ADD').map((x) => c[x.key])),
  );
  const totalDeductions = roundMoney(
    sum(COMPONENTS.filter((x) => x.direction === 'DEDUCT').map((x) => c[x.key])),
  );
  return {
    components: c,
    grossEarnings,
    totalAdditions,
    totalDeductions,
    finalAmount: roundMoney(totalAdditions.minus(totalDeductions)),
  };
}
