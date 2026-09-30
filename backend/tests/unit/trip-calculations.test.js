import { describe, expect, it } from 'vitest';
import { calculateTripEarnings, resolveKm } from '../../src/modules/trips/trip-calculations.js';

describe('resolveKm (spec §16)', () => {
  it('START_END: total = end − start', () => {
    const r = resolveKm({ kmSource: 'START_END', startKm: '12500', endKm: '12650' });
    expect(r.ok).toBe(true);
    expect(r.km.totalKm.toFixed(2)).toBe('150.00');
    expect(r.km.startKm.toFixed(2)).toBe('12500.00');
  });

  it('START_END: end less than start is rejected', () => {
    const r = resolveKm({ kmSource: 'START_END', startKm: '12650', endKm: '12500' });
    expect(r).toEqual({
      ok: false,
      errors: [{ path: 'endKm', message: 'End KM cannot be less than Start KM' }],
    });
  });

  it('START_END: both readings are required', () => {
    const r = resolveKm({ kmSource: 'START_END', startKm: '12500', endKm: '' });
    expect(r.errors).toEqual([{ path: 'endKm', message: 'End KM is required' }]);
  });

  it('DIRECT: total as given; start/end not stored', () => {
    const r = resolveKm({ kmSource: 'DIRECT', totalKm: '150', startKm: '1', endKm: '2' });
    expect(r.km.totalKm.toFixed(2)).toBe('150.00');
    expect(r.km.startKm).toBeNull();
  });

  it('DIRECT: total required, never negative, max 2 decimals', () => {
    expect(resolveKm({ kmSource: 'DIRECT' }).errors[0].message).toBe('Total KM is required');
    expect(resolveKm({ kmSource: 'DIRECT', totalKm: '-5' }).errors[0].message).toMatch(/negative/);
    expect(resolveKm({ kmSource: 'DIRECT', totalKm: '1.234' }).ok).toBe(false);
    expect(resolveKm({ kmSource: 'DIRECT', totalKm: 'abc' }).ok).toBe(false);
  });

  it('zero km is allowed (not negative)', () => {
    expect(
      resolveKm({ kmSource: 'START_END', startKm: '100', endKm: '100' }).km.totalKm.toFixed(2),
    ).toBe('0.00');
  });

  it('unknown method is rejected', () => {
    expect(resolveKm({ kmSource: 'GPS', totalKm: '1' }).errors[0].path).toBe('kmSource');
  });
});

describe('calculateTripEarnings (spec §17)', () => {
  it('150 km × ₹18 = ₹2,700', () => {
    expect(calculateTripEarnings('150', '18').toFixed(2)).toBe('2700.00');
  });

  it('scenario §78: 100 km × ₹18 = ₹1,800 and 100 km × ₹20 = ₹2,000', () => {
    expect(calculateTripEarnings('100', '18.00').toFixed(2)).toBe('1800.00');
    expect(calculateTripEarnings('100', '20.00').toFixed(2)).toBe('2000.00');
  });

  it('rounds half-up to paise with exact decimal arithmetic', () => {
    expect(calculateTripEarnings('10.55', '18.33').toFixed(2)).toBe('193.38'); // 193.3815
    expect(calculateTripEarnings('0.5', '0.01').toFixed(2)).toBe('0.01'); // 0.005 -> 0.01
    expect(calculateTripEarnings('33.33', '3.00').toFixed(2)).toBe('99.99');
  });

  it('handles large values without floating-point drift', () => {
    expect(calculateTripEarnings('9999999999.99', '99999999.99').toFixed(2)).toBe(
      '999999999899000000.00',
    );
  });
});
