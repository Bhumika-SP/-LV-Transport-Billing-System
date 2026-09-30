import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  isValidDateString,
  monthOf,
  parseDateOnly,
  todayInBusinessTz,
} from '../../src/utils/dates.js';
import { roundMoney, sumMoney } from '../../src/utils/money.js';
import { serialize } from '../../src/utils/serialize.js';
import { decimalString } from '../../src/validation/common.js';

describe('serialize', () => {
  it('renders Decimal as a 2dp string and never as a number', () => {
    const out = serialize({ amount: new Prisma.Decimal('2500000') });
    expect(out.amount).toBe('2500000.00');
  });

  it('renders date-only fields as YYYY-MM-DD and timestamps as ISO', () => {
    const d = parseDateOnly('2026-09-14');
    const out = serialize({ tripDate: d, effectiveFrom: d, effectiveTo: d, createdAt: d });
    expect(out.tripDate).toBe('2026-09-14');
    expect(out.effectiveFrom).toBe('2026-09-14');
    expect(out.effectiveTo).toBe('2026-09-14');
    expect(out.createdAt).toBe('2026-09-14T00:00:00.000Z');
  });

  it('handles nested objects and arrays', () => {
    const out = serialize({ items: [{ rate: new Prisma.Decimal('18.5') }] });
    expect(out.items[0].rate).toBe('18.50');
  });
});

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('14/09/2026')).toBe(false);
  });

  it('derives settlement month by string, independent of timezone', () => {
    expect(monthOf('2026-09-30')).toBe('2026-09');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-04-01', -1)).toBe('2026-03-31');
  });

  it('computes "today" in Asia/Kolkata, not UTC', () => {
    // 2026-09-30 20:00 UTC is already 2026-10-01 01:30 in India.
    expect(todayInBusinessTz(new Date('2026-09-30T20:00:00Z'))).toBe('2026-10-01');
  });
});

describe('money', () => {
  it('sums without floating-point error', () => {
    expect(sumMoney(['0.10', '0.20']).toFixed(2)).toBe('0.30');
  });

  it('rounds half up to paise', () => {
    expect(roundMoney('10.005').toFixed(2)).toBe('10.01');
  });

  it('rejects negative or over-precise amounts', () => {
    expect(decimalString().safeParse('-1').success).toBe(false);
    expect(decimalString().safeParse('1.234').success).toBe(false);
    expect(decimalString().parse(150)).toBe('150');
  });
});
