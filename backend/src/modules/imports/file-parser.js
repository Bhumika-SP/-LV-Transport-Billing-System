import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppError } from '../../utils/AppError.js';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP container

/** Determine the file kind from its extension AND content; reject anything else. */
export function detectFileKind(fileName, buffer) {
  const ext = String(fileName).toLowerCase().split('.').pop();
  if (ext === 'xlsx') {
    if (!buffer.subarray(0, 4).equals(XLSX_MAGIC)) {
      throw AppError.badRequest('The file is not a valid Excel (.xlsx) workbook', 'INVALID_FILE');
    }
    return 'xlsx';
  }
  if (ext === 'csv') {
    if (buffer.subarray(0, 1024).includes(0)) {
      throw AppError.badRequest('The file is not a valid CSV text file', 'INVALID_FILE');
    }
    return 'csv';
  }
  throw AppError.badRequest('Only .xlsx and .csv files are supported', 'UNSUPPORTED_FILE_TYPE');
}

/** exceljs cell value → primitive (string | number | Date | null). */
function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result); // formula
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('text' in value) return value.text; // hyperlink
  if ('error' in value) return null;
  return String(value);
}

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw AppError.badRequest('The Excel file could not be read', 'INVALID_FILE');
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellValue(cell.value);
    });
    rows.push({ rowNumber, cells: values });
  });
  return rows;
}

function readCsv(buffer) {
  try {
    const records = parseCsv(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    return records.map((cells, i) => ({ rowNumber: i + 1, cells }));
  } catch (err) {
    throw AppError.badRequest(`The CSV file could not be read: ${err.message}`, 'INVALID_FILE');
  }
}

/**
 * Parse an uploaded file into { headers, rows: [{ rowNumber, values: { header: value } }] }.
 * The first non-empty row is the header row. Row numbers match the spreadsheet so
 * errors can be located and corrected in the original file.
 */
export async function parseImportFile(fileName, buffer) {
  const kind = detectFileKind(fileName, buffer);
  const raw = kind === 'xlsx' ? await readXlsx(buffer) : readCsv(buffer);
  if (raw.length === 0) throw AppError.badRequest('The file is empty', 'EMPTY_FILE');

  const [headerRow, ...dataRows] = raw;
  const headers = headerRow.cells.map((h) =>
    h === null || h === undefined ? '' : String(h).trim(),
  );
  const named = headers.filter(Boolean);
  if (named.length === 0) throw AppError.badRequest('The header row is empty', 'EMPTY_FILE');
  const dup = named.find((h, i) => named.indexOf(h) !== i);
  if (dup) {
    throw AppError.badRequest(
      `Column "${dup}" appears more than once in the header row`,
      'DUPLICATE_COLUMN',
    );
  }

  const rows = dataRows
    .map(({ rowNumber, cells }) => {
      const values = {};
      headers.forEach((h, i) => {
        if (h) values[h] = cells[i] ?? null;
      });
      return { rowNumber, values };
    })
    .filter((r) => Object.values(r.values).some((v) => v !== null && String(v).trim() !== ''));

  if (rows.length === 0) throw AppError.badRequest('The file has no data rows', 'EMPTY_FILE');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw AppError.badRequest(
      `The file has ${rows.length} rows; the maximum per import is ${MAX_IMPORT_ROWS}. Split the file.`,
      'TOO_MANY_ROWS',
    );
  }
  return { kind, headers: named, rows };
}
