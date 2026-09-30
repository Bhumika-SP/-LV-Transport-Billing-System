import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * Report exporters (spec §67). Input is the output of runReport(): serialized rows
 * (money as "1234.50" strings), columns with types, and totals.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function groupIndian(intPart) {
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
}

/** "2500000.00" → "25,00,000.00" (string-based; no float). */
export function indianAmount(value) {
  if (value === null || value === undefined || value === '') return '';
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!m) return String(value);
  return `${m[1] ?? ''}${groupIndian(m[2])}.${((m[3] ?? '') + '00').slice(0, 2)}`;
}

function display(col, value) {
  if (value === null || value === undefined) return '';
  if (col.type === 'money') return indianAmount(value);
  if (col.type === 'month') {
    const [y, m] = String(value).split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }
  if (col.type === 'date') {
    const [y, m, d] = String(value).slice(0, 10).split('-');
    return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
  }
  return String(value);
}

const safeName = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export const exportFileName = (report, ext) =>
  `${safeName(report.title)}-${report.generatedAt.slice(0, 10)}.${ext}`;

/** CSV: plain numbers (machine-readable), UTF-8 BOM for Excel, formula-injection safe. */
export function toCsv(report) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+@]/.test(s) || /^-[^\d.]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    report.columns.map((c) => cell(c.label)).join(','),
    ...report.rows.map((r) => report.columns.map((c) => cell(r[c.key])).join(',')),
  ];
  if (Object.keys(report.totals).length) {
    lines.push(
      report.columns
        .map((c, i) => cell(i === 0 ? 'TOTAL' : (report.totals[c.key] ?? '')))
        .join(','),
    );
  }
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`;
}

/** XLSX: numeric money/number cells with Indian digit grouping. */
export async function toXlsx(report, user) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LV Transport Billing System';
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  const inr = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';

  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC by ${user.name}`]);
  const f = Object.entries(report.filters).filter(([, v]) => v);
  ws.addRow([f.length ? `Filters: ${f.map(([k, v]) => `${k}=${v}`).join(', ')}` : 'Filters: none']);
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const value = (c, v) => {
    if (v === null || v === undefined) return null;
    if (c.type === 'money' || c.type === 'number') return Number(v);
    return display(c, v);
  };
  for (const r of report.rows) ws.addRow(report.columns.map((c) => value(c, r[c.key])));
  if (Object.keys(report.totals).length) {
    const t = ws.addRow(
      report.columns.map((c, i) => (i === 0 ? 'TOTAL' : value(c, report.totals[c.key]))),
    );
    t.font = { bold: true };
  }
  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(40, Math.max(12, c.label.length + 4));
    if (c.type === 'money') col.numFmt = inr;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * PDF: landscape A4 table. The built-in PDF fonts have no ₹ glyph, so amounts carry
 * the currency in the column header ("Amount (Rs)").
 */
export function toPdf(report, user) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 60;
    const cols = report.columns;
    const colW = width / cols.length;
    const fontSize = cols.length > 12 ? 6 : cols.length > 8 ? 7 : 8;

    doc.font('Helvetica-Bold').fontSize(14).text(`LV Transport — ${report.title}`);
    doc.font('Helvetica').fontSize(8).fillColor('#475569');
    const f = Object.entries(report.filters).filter(([, v]) => v);
    doc.text(
      `Generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} UTC by ${user.name} · ${report.rowCount} rows · ${f.length ? f.map(([k, v]) => `${k}=${v}`).join(', ') : 'no filters'}`,
    );
    doc.moveDown(0.5).fillColor('#000000');

    const drawRow = (cells, { bold = false, fill } = {}) => {
      const heights = cells.map((c) => doc.heightOfString(c, { width: colW - 4 }));
      const h = Math.max(...heights, fontSize + 2) + 4;
      if (doc.y + h > doc.page.height - 30) doc.addPage();
      const y = doc.y;
      if (fill) doc.rect(30, y, width, h).fill(fill).fillColor('#000000');
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      cells.forEach((c, i) => {
        const align = cols[i].type === 'money' || cols[i].type === 'number' ? 'right' : 'left';
        doc.text(c, 30 + i * colW + 2, y + 2, { width: colW - 4, align });
      });
      doc.y = y + h;
      doc
        .moveTo(30, doc.y)
        .lineTo(30 + width, doc.y)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();
    };

    doc.font('Helvetica-Bold').fontSize(fontSize);
    drawRow(
      cols.map((c) => (c.type === 'money' ? `${c.label} (Rs)` : c.label)),
      { bold: true, fill: '#e2e8f0' },
    );
    for (const r of report.rows) drawRow(cols.map((c) => display(c, r[c.key])));
    if (Object.keys(report.totals).length) {
      drawRow(
        cols.map((c, i) => (i === 0 ? 'TOTAL' : display(c, report.totals[c.key]))),
        { bold: true, fill: '#f1f5f9' },
      );
    }
    doc.end();
  });
}
