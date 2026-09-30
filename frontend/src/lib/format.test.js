import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatINR, formatKm, formatMonth } from './format';

describe('formatINR (strings in, strings out — never floats)', () => {
  it.each([
    ['0', '₹0.00'],
    ['5', '₹5.00'],
    ['999.5', '₹999.50'],
    ['1000', '₹1,000.00'],
    ['135000.00', '₹1,35,000.00'],
    ['2500000.00', '₹25,00,000.00'],
    ['101999999.79', '₹10,19,99,999.79'],
    ['-35000.00', '-₹35,000.00'],
  ])('%s → %s', (input, out) => expect(formatINR(input)).toBe(out));

  it('keeps precision beyond float range and truncates nothing but formatting', () => {
    expect(formatINR('9999999999999.99')).toBe('₹99,99,99,99,99,999.99');
    expect(formatINR('0.1')).toBe('₹0.10');
  });

  it('handles empty and non-numeric input without throwing', () => {
    expect(formatINR(null)).toBe('—');
    expect(formatINR('')).toBe('—');
    expect(formatINR('abc')).toBe('abc');
    expect(formatINR('1500', { withSymbol: false })).toBe('1,500.00');
  });
});

describe('dates are formatted from string parts (browser timezone cannot shift them)', () => {
  it('business dates and months', () => {
    // The test runner is in America/Los_Angeles on purpose (see vite.config.js).
    expect(formatDate('2026-04-01')).toBe('1 Apr 2026');
    expect(formatDate('2026-03-31T00:00:00.000Z')).toBe('31 Mar 2026');
    expect(formatMonth('2026-09')).toBe('Sep 2026');
    expect(formatDate(null)).toBe('—');
  });

  it('timestamps are shown in India time', () => {
    // 2026-09-30 20:00 UTC is 1 Oct 2026, 1:30 am IST.
    expect(formatDateTime('2026-09-30T20:00:00.000Z')).toMatch(/1 Oct 2026.*1:30/);
  });

  it('KM drops trailing zeros and groups Indian-style', () => {
    expect(formatKm('150.00')).toBe('150');
    expect(formatKm('150.50')).toBe('150.5');
    expect(formatKm('123456.25')).toBe('1,23,456.25');
  });
});
