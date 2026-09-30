import { describe, expect, it } from 'vitest';
import {
  calculateDriverSettlement,
  calculateGrossEarnings,
} from '../../src/modules/settlements/settlement-formula.js';

const fixed = (r) => ({
  grossEarnings: r.grossEarnings.toFixed(2),
  totalAdditions: r.totalAdditions.toFixed(2),
  totalDeductions: r.totalDeductions.toFixed(2),
  finalAmount: r.finalAmount.toFixed(2),
});

describe('settlement formula (spec §21, §27)', () => {
  it('gross earnings = trip + allowances + other earnings + positive adjustments', () => {
    const gross = calculateGrossEarnings({
      tripEarnings: '50000',
      allowances: '1000',
      otherEarnings: '500',
      positiveAdjustments: '500',
      reimbursements: '2000', // not part of gross
      fuel: '5000', // not part of gross
    });
    expect(gross.toFixed(2)).toBe('52000.00');
  });

  it('§27 example: final settlement ₹39,000', () => {
    const r = calculateDriverSettlement({
      tripEarnings: '50000',
      allowances: '1000',
      otherEarnings: '500',
      positiveAdjustments: '500',
      reimbursements: '2000',
      fuel: '5000',
      toll: '1000',
      maintenance: '2000',
      emi: '3000',
      advanceRecovery: '4000',
      otherDeductions: '0',
    });
    expect(fixed(r)).toEqual({
      grossEarnings: '52000.00',
      totalAdditions: '54000.00', // the spec's "Subtotal"
      totalDeductions: '15000.00',
      finalAmount: '39000.00',
    });
  });

  it('§76 required scenario: exactly ₹1,35,000', () => {
    const r = calculateDriverSettlement({
      tripEarnings: '150000',
      allowances: '5000',
      otherEarnings: '2000',
      positiveAdjustments: '1000',
      reimbursements: '3000',
      fuel: '5000',
      toll: '2000',
      maintenance: '3000',
      emi: '10000',
      advanceRecovery: '5000',
      otherDeductions: '1000',
    });
    expect(r.finalAmount.toFixed(2)).toBe('135000.00');
  });

  it('§49 settlement page example: ₹1,28,000', () => {
    const r = calculateDriverSettlement({
      tripEarnings: '150000',
      allowances: '5000',
      otherEarnings: '2000',
      positiveAdjustments: '0',
      reimbursements: '6000',
      fuel: '5000',
      toll: '2000',
      maintenance: '3000',
      emi: '15000',
      advanceRecovery: '10000',
      otherDeductions: '0',
    });
    expect(r.finalAmount.toFixed(2)).toBe('128000.00');
  });

  it('missing components are zero; a month with nothing settles to ₹0', () => {
    expect(fixed(calculateDriverSettlement({}))).toEqual({
      grossEarnings: '0.00',
      totalAdditions: '0.00',
      totalDeductions: '0.00',
      finalAmount: '0.00',
    });
  });

  it('can be negative when deductions exceed earnings (engine decides what to allow)', () => {
    const r = calculateDriverSettlement({ tripEarnings: '1000', emi: '3000' });
    expect(r.finalAmount.toFixed(2)).toBe('-2000.00');
  });

  it('exact decimal arithmetic on paise and large amounts', () => {
    const r = calculateDriverSettlement({
      tripEarnings: '0.10',
      allowances: '0.20',
      fuel: '0.30',
    });
    expect(r.finalAmount.toFixed(2)).toBe('0.00');
    const big = calculateDriverSettlement({ tripEarnings: '9999999999999.99', toll: '0.01' });
    expect(big.finalAmount.toFixed(2)).toBe('9999999999999.98');
  });
});
