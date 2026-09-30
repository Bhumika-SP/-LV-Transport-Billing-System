import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';

/**
 * THE LV profit formula (spec §3, §34). The only place it exists.
 *
 *   LV PROFIT = ACTUAL COMPANY AMOUNT RECEIVED − TOTAL FINALIZED DRIVER SETTLEMENTS
 *
 * Fuel, toll, maintenance and EMI are NOT subtracted here: they are already inside the
 * finalized driver settlements. There is no second subtraction.
 */
export function calculateLvProfit(receivedAmount, finalizedSettlementTotal) {
  return roundMoney(toDecimal(receivedAmount).minus(toDecimal(finalizedSettlementTotal)));
}

/**
 * Split `total` across `weights` proportionally, exact to the paisa: amounts always sum
 * to `total` (largest-remainder method; ties go to the earlier weight).
 * Returns null when all weights are zero (nothing to allocate by).
 */
export function allocateProportionally(total, weights) {
  const w = weights.map((x) => toDecimal(x));
  const sumW = w.reduce((a, x) => a.plus(x), new Decimal(0));
  if (sumW.isZero()) return null;

  const totalPaise = roundMoney(total).times(100);
  const raw = w.map((x) => totalPaise.times(x).dividedBy(sumW));
  const floors = raw.map((r) => r.floor());
  let remaining = totalPaise.minus(floors.reduce((a, x) => a.plus(x), new Decimal(0))).toNumber();

  const order = raw
    .map((r, i) => ({ i, frac: r.minus(r.floor()) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const paise = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) break;
    paise[i] = paise[i].plus(1);
    remaining -= 1;
  }
  return paise.map((p) => p.dividedBy(100));
}
