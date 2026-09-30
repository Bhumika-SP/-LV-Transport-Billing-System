import { z } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { Decimal, toDecimal } from '../../utils/money.js';
import { serialize } from '../../utils/serialize.js';
import { dateString, monthString, optionalId } from '../../validation/common.js';
import { REPORTS } from './report-definitions.js';

/** Filter validators; each report accepts only the filters it declares. */
const FILTER_SCHEMAS = {
  month: monthString.optional(),
  fromMonth: monthString.optional(),
  toMonth: monthString.optional(),
  fromDate: dateString.optional(),
  toDate: dateString.optional(),
  companyId: optionalId,
  driverId: optionalId,
  vehicleId: optionalId,
  status: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Z_]+$/)
    .optional(),
  paidBy: z.enum(['LV', 'DRIVER']).optional(),
  category: z.enum(['FUEL', 'TOLL', 'MAINTENANCE', 'EMI', 'OTHER']).optional(),
};

export function listReports(user) {
  return Object.entries(REPORTS)
    .filter(([, r]) => user.permissions.includes(r.permission))
    .map(([key, r]) => ({ key, title: r.title, filters: r.filters, columns: r.columns }));
}

function getDefinition(key, user) {
  const report = REPORTS[key];
  if (!report) throw AppError.notFound(`Unknown report ${key}`, 'REPORT_NOT_FOUND');
  // Exports respect permissions exactly like the screens (spec §67).
  if (!user.permissions.includes(report.permission)) throw AppError.forbidden();
  return report;
}

export function parseFilters(report, query) {
  const schema = z.object(Object.fromEntries(report.filters.map((f) => [f, FILTER_SCHEMAS[f]])));
  return schema.parse(query);
}

/** Run a report: validated filters → rows (serialized) and column totals. */
export async function runReport(key, query, user) {
  const report = getDefinition(key, user);
  const filters = parseFilters(report, query);
  const rows = await report.rows(filters);
  const totals = Object.fromEntries(
    (report.totals ?? []).map((k) => [
      k,
      rows.reduce(
        (acc, r) => (r[k] === null || r[k] === undefined ? acc : acc.plus(toDecimal(r[k]))),
        new Decimal(0),
      ),
    ]),
  );
  return {
    key,
    title: report.title,
    columns: report.columns,
    filters,
    rows: serialize(
      rows.map((r) => Object.fromEntries(report.columns.map((c) => [c.key, r[c.key] ?? null]))),
    ),
    totals: serialize(totals),
    rowCount: rows.length,
    generatedAt: new Date().toISOString(),
  };
}
