/** Field-by-field comparison rows for an audit record's previous and new values. */

const show = (v) => {
  if (v === undefined) return '';
  if (v === null) return '∅';
  if (typeof v === 'object') return JSON.stringify(v, null, 1);
  return String(v);
};

function asObject(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return v === null || v === undefined ? {} : { value: v };
}

export function diffRows(previousValue, newValue) {
  const prev = asObject(previousValue);
  const next = asObject(newValue);
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])];
  return keys.map((key) => {
    const before = show(prev[key]);
    const after = show(next[key]);
    return { key, before, after, changed: before !== after };
  });
}
