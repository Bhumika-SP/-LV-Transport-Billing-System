import { describe, expect, it } from 'vitest';
import {
  allocateProportionally,
  calculateLvProfit,
} from '../../src/modules/profit/profit-formula.js';

const fixed = (arr) => arr.map((d) => d.toFixed(2));

describe('LV profit formula (spec §3, §34)', () => {
  it('₹25,00,000 received − ₹23,50,000 finalized = ₹1,50,000', () => {
    expect(calculateLvProfit('2500000', '2350000').toFixed(2)).toBe('150000.00');
  });

  it('can be negative (settlements exceed receipts)', () => {
    expect(calculateLvProfit('0', '2350000').toFixed(2)).toBe('-2350000.00');
  });
});

describe('proportional allocation, exact to the paisa (A7)', () => {
  it('60/40 split', () => {
    expect(fixed(allocateProportionally('90000', ['60000', '40000']))).toEqual([
      '54000.00',
      '36000.00',
    ]);
  });

  it('remainders go to the largest fractions; the sum is always exact', () => {
    const r = allocateProportionally('100', ['1', '1', '1']);
    expect(fixed(r)).toEqual(['33.34', '33.33', '33.33']);
    const odd = allocateProportionally('1000.01', ['3', '7', '11']);
    expect(odd.reduce((a, x) => a.plus(x)).toFixed(2)).toBe('1000.01');
  });

  it('a single company gets everything; zero weights cannot be allocated', () => {
    expect(fixed(allocateProportionally('4140', ['12640']))).toEqual(['4140.00']);
    expect(allocateProportionally('500', ['0', '0'])).toBeNull();
  });
});
