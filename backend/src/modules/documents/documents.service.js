import { createHash, randomUUID } from 'node:crypto';
import { PERMISSIONS as P } from '../../config/permissions.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { AppError } from '../../utils/AppError.js';
import { detectFileType } from '../../utils/file-type.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

/**
 * Documents attached to business records (spec §53). Access follows the record:
 * viewing needs the record's view permission, uploading/deleting its manage permission.
 * No new permission codes, so a role can never see a file for a record it cannot see.
 */
export const DOCUMENT_ENTITIES = {
  DRIVER: { model: 'driver', view: [P.MASTER_VIEW], manage: [P.DRIVER_MANAGE] },
  VEHICLE: { model: 'vehicle', view: [P.MASTER_VIEW], manage: [P.VEHICLE_MANAGE] },
  COMPANY: { model: 'company', view: [P.MASTER_VIEW], manage: [P.COMPANY_MANAGE] },
  EXPENSE: {
    model: 'driverExpense',
    view: [P.DRIVER_FINANCE_VIEW],
    // LV-paid and driver-paid expenses are managed under different permissions.
    manage: (e) => [e.paidBy === 'LV' ? P.LV_EXPENSE_MANAGE : P.DRIVER_EXPENSE_MANAGE],
  },
  DRIVER_PAYMENT: { model: 'driverPayment', view: [P.PAYMENT_VIEW], manage: [P.PAYMENT_RECORD] },
  COMPANY_SETTLEMENT: {
    model: 'companySettlement',
    view: [P.COMPANY_SETTLEMENT_VIEW],
    manage: [P.COMPANY_SETTLEMENT_MANAGE],
  },
  TRIP_IMPORT: { model: 'tripImport', view: [P.IMPORT_VIEW], manage: [P.TRIP_IMPORT] },
  GST_RECORD: { model: 'gstRecord', view: [P.GST_VIEW], manage: [P.GST_MANAGE] },
};
export const DOCUMENT_ENTITY_TYPES = Object.keys(DOCUMENT_ENTITIES);
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const PUBLIC_SELECT = {
  id: true,
  entityType: true,
  entityId: true,
  category: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  notes: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
};

const has = (user, codes) => codes.some((c) => user.permissions.includes(c));

async function loadEntity(entityType, entityId) {
  const def = DOCUMENT_ENTITIES[entityType];
  const entity = await prisma[def.model].findUnique({ where: { id: entityId } });
  if (!entity) {
    throw AppError.badRequest('The record does not exist', 'INVALID_REFERENCE', [
      { path: 'entityId', message: 'Select a valid record' },
    ]);
  }
  return { def, entity };
}

function assertView(user, def) {
  if (!has(user, def.view)) throw AppError.forbidden();
}
function assertManage(user, def, entity) {
  const codes = typeof def.manage === 'function' ? def.manage(entity) : def.manage;
  if (!has(user, codes)) throw AppError.forbidden();
}

async function findDocument(id) {
  const doc = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!doc) throw AppError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  return doc;
}

export async function listDocuments({ entityType, entityId }, user) {
  assertView(user, DOCUMENT_ENTITIES[entityType]);
  return prisma.document.findMany({
    where: { entityType, entityId, deletedAt: null },
    select: PUBLIC_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

export async function uploadDocument({ entityType, entityId, category, notes }, file, user, req) {
  const { def, entity } = await loadEntity(entityType, entityId);
  assertView(user, def);
  assertManage(user, def, entity);

  const type = detectFileType(file.buffer);
  if (!type) {
    throw AppError.badRequest(
      'Only PDF, JPEG, PNG and WEBP files can be attached',
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  const storageKey = `${entityType.toLowerCase()}/${entityId}/${randomUUID()}${type.ext}`;
  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  await storage().put(storageKey, file.buffer, type.mime);
  try {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          entityType,
          entityId,
          category: category ?? null,
          notes: notes ?? null,
          fileName: file.originalname,
          mimeType: type.mime,
          sizeBytes: file.size,
          storageKey,
          checksum,
          uploadedById: user.id,
        },
        select: PUBLIC_SELECT,
      });
      await recordAudit(tx, {
        userId: user.id,
        action: AUDIT_ACTIONS.UPLOAD,
        entityType: 'Document',
        entityId: doc.id,
        newValue: {
          entityType,
          entityId,
          fileName: doc.fileName,
          sizeBytes: doc.sizeBytes,
          checksum,
        },
        req,
      });
      return doc;
    });
  } catch (err) {
    // Do not leave an orphaned file when the database write fails.
    await storage()
      .remove(storageKey)
      .catch((e) => logger.warn({ err: e, storageKey }, 'Could not remove orphaned upload'));
    throw err;
  }
}

/** Authorize and open a document for streaming. */
export async function openDocument(id, user) {
  const doc = await findDocument(id);
  assertView(user, DOCUMENT_ENTITIES[doc.entityType]);
  try {
    return { doc, stream: await storage().get(doc.storageKey) };
  } catch (err) {
    logger.error({ err, documentId: id }, 'Stored file is missing');
    throw AppError.notFound('The file is no longer available in storage', 'FILE_MISSING');
  }
}

/** Soft delete: the row and file are retained for audit; the document disappears from lists. */
export async function deleteDocument(id, { reason }, user, req) {
  const doc = await findDocument(id);
  const { def, entity } = await loadEntity(doc.entityType, doc.entityId);
  assertView(user, def);
  assertManage(user, def, entity);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id, deleteReason: reason },
      select: PUBLIC_SELECT,
    });
    await recordAudit(tx, {
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: 'Document',
      entityId: id,
      previousValue: { entityType: doc.entityType, entityId: doc.entityId, fileName: doc.fileName },
      reason,
      req,
    });
    return updated;
  });
}
