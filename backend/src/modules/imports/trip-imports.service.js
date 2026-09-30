import { createHash } from 'node:crypto';
import { LOCKING_TX, prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { parseDateOnly } from '../../utils/dates.js';
import { findPage } from '../../utils/pagination.js';
import { findOr404, lockRow } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { parseImportFile } from './file-parser.js';
import { getTemplate } from './import-templates.service.js';
import { validateImportRows } from './import-validator.js';

const NOT_FOUND = { code: 'IMPORT_NOT_FOUND', label: 'Import' };
const UTF8_BOM = String.fromCharCode(0xfeff);
const ENTITY = 'TripImport';
const SUMMARY_INCLUDE = {
  company: { select: { id: true, name: true, code: true } },
  template: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, name: true } },
  importedBy: { select: { id: true, name: true } },
};

/** Read headers and a sample so the user can map columns (nothing is stored). */
export async function inspectFile(file) {
  const parsed = await parseImportFile(file.originalname, file.buffer);
  return {
    fileName: file.originalname,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    sampleRows: parsed.rows.slice(0, 5).map((r) => ({
      rowNumber: r.rowNumber,
      values: Object.fromEntries(
        Object.entries(r.values).map(([h, v]) => [
          h,
          v instanceof Date ? v.toISOString().slice(0, 10) : v,
        ]),
      ),
    })),
  };
}

function countRows(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    totalRows: results.length,
    validRows: count('VALID'),
    warningRows: count('WARNING'),
    errorRows: count('ERROR'),
    duplicateRows: count('DUPLICATE'),
  };
}

/**
 * Upload → read → map → normalize → validate → detect duplicates → store a VALIDATED
 * batch for preview. No trips are created here.
 */
export async function createImport({ companyId, templateId, file }, actor, req) {
  const template = await getTemplate(templateId);
  if (template.companyId !== companyId) {
    throw AppError.badRequest(
      'This template belongs to a different company',
      'TEMPLATE_COMPANY_MISMATCH',
    );
  }
  if (template.status !== 'ACTIVE')
    throw AppError.badRequest('This template is inactive', 'TEMPLATE_INACTIVE');

  const parsed = await parseImportFile(file.originalname, file.buffer);
  const missing = Object.values(template.mappings).filter((c) => !parsed.headers.includes(c));
  if (missing.length) {
    throw AppError.badRequest(
      `The file is missing mapped column(s): ${missing.map((c) => `"${c}"`).join(', ')}`,
      'MISSING_COLUMNS',
      missing.map((c) => ({ path: 'file', message: `Column "${c}" not found` })),
    );
  }

  const results = await validateImportRows(prisma, { companyId, template, rows: parsed.rows });

  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.tripImport.create({
        data: {
          companyId,
          templateId,
          fileName: file.originalname,
          fileSize: file.size,
          fileHash: createHash('sha256').update(file.buffer).digest('hex'),
          // Template as used, plus the file's column order (JSON objects do not keep key order).
          templateSnapshot: { ...template, sourceHeaders: parsed.headers },
          uploadedById: actor.id,
          ...countRows(results),
        },
      });
      await tx.importRow.createMany({
        data: results.map((r) => ({
          importId: batch.id,
          rowNumber: r.rowNumber,
          raw: r.raw,
          normalized: r.normalized ?? undefined,
          status: r.status,
          messages: r.messages,
        })),
      });
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: ENTITY,
        entityId: batch.id,
        newValue: { fileName: batch.fileName, ...countRows(results) },
        req,
      });
      return tx.tripImport.findUnique({ where: { id: batch.id }, include: SUMMARY_INCLUDE });
    },
    { timeout: 60_000 },
  );
}

/**
 * Transactional import (spec §42). Rows are re-validated against the CURRENT database
 * (someone may have added trips or changed rates since the preview), then every
 * importable row becomes a trip — all or nothing. The company row is locked so two
 * imports for the same company cannot race past duplicate detection.
 */
export async function confirmImport(id, { includeWarnings }, actor, req) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockRow(tx, 'trip_imports', id);
        const batch = await findOr404(tx.tripImport, id, NOT_FOUND);
        if (batch.status !== 'VALIDATED') {
          throw AppError.conflict(`This import is already ${batch.status}`, 'INVALID_STATUS');
        }
        await lockRow(tx, 'companies', batch.companyId);

        const stored = await tx.importRow.findMany({
          where: { importId: id },
          orderBy: { rowNumber: 'asc' },
        });
        const results = await validateImportRows(tx, {
          companyId: batch.companyId,
          template: batch.templateSnapshot,
          rows: stored.map((r) => ({ rowNumber: r.rowNumber, values: r.raw })),
        });

        const importable = results.filter(
          (r) => r.status === 'VALID' || (includeWarnings && r.status === 'WARNING'),
        );
        if (importable.length === 0) {
          throw AppError.badRequest('There are no valid rows to import', 'NOTHING_TO_IMPORT');
        }

        const byRow = new Map(stored.map((r) => [r.rowNumber, r]));
        const importableRows = new Set(importable.map((r) => r.rowNumber));
        for (const r of results) {
          const n = r.normalized;
          let tripId = null;
          if (importableRows.has(r.rowNumber)) {
            const trip = await tx.trip.create({
              data: {
                ...n,
                tripDate: parseDateOnly(n.tripDate),
                extra: n.extra ?? undefined,
                source: 'IMPORT',
                importId: id,
                createdById: actor.id,
              },
            });
            tripId = trip.id;
          }
          await tx.importRow.update({
            where: { id: byRow.get(r.rowNumber).id },
            data: {
              status: tripId ? 'IMPORTED' : r.status,
              messages: r.messages,
              normalized: r.normalized ?? undefined,
              tripId,
            },
          });
        }

        const counts = countRows(results);
        const updated = await tx.tripImport.update({
          where: { id },
          data: {
            ...counts,
            status: 'IMPORTED',
            importedRows: importable.length,
            importedById: actor.id,
            importedAt: new Date(),
            errorDetails: null,
          },
          include: SUMMARY_INCLUDE,
        });
        await recordAudit(tx, {
          userId: actor.id,
          action: AUDIT_ACTIONS.IMPORT,
          entityType: ENTITY,
          entityId: id,
          newValue: { ...counts, importedRows: importable.length, includeWarnings },
          req,
        });
        return updated;
      },
      { ...LOCKING_TX, timeout: 120_000, maxWait: 10_000 },
    );
  } catch (err) {
    if (!(err instanceof AppError)) {
      // Nothing was written (rolled back). Record the failure on the batch for history.
      await prisma.tripImport
        .update({
          where: { id },
          data: { status: 'FAILED', errorDetails: String(err.message).slice(0, 2000) },
        })
        .catch(() => {});
      throw new AppError('The import failed and was rolled back; no trips were created.', {
        status: 500,
        code: 'IMPORT_FAILED',
      });
    }
    throw err;
  }
}

export function discardImport(id, actor, req) {
  return prisma.$transaction(async (tx) => {
    const batch = await findOr404(tx.tripImport, id, NOT_FOUND);
    if (batch.status !== 'VALIDATED') {
      throw AppError.conflict(`This import is already ${batch.status}`, 'INVALID_STATUS');
    }
    const updated = await tx.tripImport.update({
      where: { id },
      data: { status: 'DISCARDED' },
      include: SUMMARY_INCLUDE,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: ENTITY,
      entityId: id,
      newValue: { status: 'DISCARDED' },
      req,
    });
    return updated;
  });
}

export function listImports({ page, pageSize, companyId, status }) {
  return findPage(prisma.tripImport, {
    where: { ...(companyId && { companyId }), ...(status && { status }) },
    orderBy: { id: 'desc' },
    include: SUMMARY_INCLUDE,
    page,
    pageSize,
  });
}

export function getImport(id) {
  return findOr404(prisma.tripImport, id, { ...NOT_FOUND, include: SUMMARY_INCLUDE });
}

export async function listImportRows(id, { page, pageSize, status }) {
  await findOr404(prisma.tripImport, id, NOT_FOUND);
  return findPage(prisma.importRow, {
    where: { importId: id, ...(status && { status }) },
    orderBy: { rowNumber: 'asc' },
    page,
    pageSize,
  });
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Neutralize spreadsheet formula injection and quote every cell.
  const safe = /^[=+@]/.test(s) || /^-[^\d.]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * Error report (spec §43): row number, status, messages and the ORIGINAL values, so
 * the user can fix the source file and re-upload.
 */
export async function errorReportCsv(id, { includeWarnings }) {
  const batch = await findOr404(prisma.tripImport, id, NOT_FOUND);
  const statuses = ['ERROR', 'DUPLICATE', ...(includeWarnings ? ['WARNING'] : [])];
  const rows = await prisma.importRow.findMany({
    where: { importId: id, status: { in: statuses } },
    orderBy: { rowNumber: 'asc' },
  });
  const headers = batch.templateSnapshot.sourceHeaders ?? [
    ...new Set(rows.flatMap((r) => Object.keys(r.raw))),
  ];
  const lines = [
    ['Row', 'Status', 'Problems', ...headers].map(csvCell).join(','),
    ...rows.map((r) =>
      [
        r.rowNumber,
        r.status,
        r.messages.map((m) => m.message).join('; '),
        ...headers.map((h) => r.raw[h]),
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
  return {
    fileName: `import-${id}-${batch.fileName.replace(/\.[^.]+$/, '')}-problems.csv`,
    // BOM so Excel opens UTF-8 (₹, names) correctly.
    content: `${UTF8_BOM}${lines.join('\r\n')}\r\n`,
  };
}
