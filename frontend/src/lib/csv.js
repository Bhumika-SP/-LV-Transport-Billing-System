const BOM = String.fromCharCode(0xfeff); // lets Excel read UTF-8

const escapeCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Download rows as a CSV file. columns: [[header, (row) => value], ...]
 * Cells starting with = + - @ are prefixed with ' so spreadsheets do not run them as formulas.
 */
export function downloadCsv(filename, columns, rows) {
  const safe = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
  const lines = [
    columns.map(([h]) => escapeCell(h)).join(','),
    ...rows.map((row) => columns.map(([, get]) => escapeCell(safe(get(row)))).join(',')),
  ];
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
