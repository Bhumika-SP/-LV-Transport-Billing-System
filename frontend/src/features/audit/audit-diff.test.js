import { describe, expect, it } from 'vitest';
import { diffRows } from './audit-diff';

describe('audit diff rows', () => {
  it('marks only changed fields', () => {
    const rows = diffRows(
      { fullName: 'Ravi Kumar', phone: '98765', status: 'ACTIVE' },
      { fullName: 'Ravi K', phone: '98765', status: 'ACTIVE' },
    );
    expect(rows.filter((r) => r.changed).map((r) => r.key)).toEqual(['fullName']);
  });

  it('covers keys present on only one side, nulls and nested values', () => {
    const rows = diffRows({ a: null, nested: { x: 1 } }, { b: '2', nested: { x: 2 } });
    expect(Object.fromEntries(rows.map((r) => [r.key, [r.before, r.after, r.changed]]))).toEqual({
      a: ['∅', '', true],
      nested: ['{\n "x": 1\n}', '{\n "x": 2\n}', true],
      b: ['', '2', true],
    });
  });

  it('creates and deletes have one side only; scalars are wrapped', () => {
    expect(diffRows(null, { id: 1 })).toEqual([
      { key: 'id', before: '', after: '1', changed: true },
    ]);
    expect(diffRows(undefined, 'x')[0]).toMatchObject({ key: 'value', after: 'x' });
    expect(diffRows(null, null)).toEqual([]);
  });
});
