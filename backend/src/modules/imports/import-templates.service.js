import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { findOr404, rethrowUnique } from '../../utils/records.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import {
  DATE_FORMATS,
  DRIVER_MATCH_FIELDS,
  DUPLICATE_KEY_FIELDS,
  TARGET_FIELDS,
  requiredFields,
} from './import-fields.js';

const NOT_FOUND = { code: 'IMPORT_TEMPLATE_NOT_FOUND', label: 'Import template' };
const UNIQUE_FIELDS = {
  company_id: { path: 'name', message: 'This company already has a template with this name' },
};

/** Field catalogue for the mapping UI. */
export function templateMeta() {
  return {
    targetFields: Object.entries(TARGET_FIELDS).map(([key, f]) => ({ key, ...f })),
    duplicateKeyFields: DUPLICATE_KEY_FIELDS,
    dateFormats: DATE_FORMATS,
    driverMatchFields: DRIVER_MATCH_FIELDS,
  };
}

/** Template as { ..., mappings: { targetField: sourceColumn } } — the shape the validator uses. */
export function toTemplateShape(t) {
  return {
    id: t.id,
    companyId: t.companyId,
    name: t.name,
    dateFormat: t.dateFormat,
    kmMode: t.kmMode,
    driverMatchField: t.driverMatchField,
    duplicateKey: t.duplicateKey,
    keepUnmapped: t.keepUnmapped,
    status: t.status,
    mappings: Object.fromEntries(t.mappings.map((m) => [m.targetField, m.sourceColumn])),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Cross-field rules: required fields mapped for the KM mode; duplicate key fields mapped. */
function assertConsistent({ kmMode, mappings, duplicateKey }) {
  const details = [];
  for (const f of requiredFields(kmMode)) {
    if (!mappings[f])
      details.push({ path: `mappings.${f}`, message: `${TARGET_FIELDS[f].label} must be mapped` });
  }
  const columns = Object.values(mappings);
  const repeated = columns.find((c, i) => columns.indexOf(c) !== i);
  if (repeated)
    details.push({
      path: 'mappings',
      message: `Column "${repeated}" is mapped to more than one field`,
    });
  for (const f of duplicateKey) {
    const mapped = f === 'vehicle' || f === 'driver' || f === 'tripDate' || mappings[f];
    if (!mapped)
      details.push({ path: 'duplicateKey', message: `Duplicate key field ${f} is not mapped` });
  }
  if (details.length)
    throw AppError.badRequest('Template is incomplete', 'VALIDATION_ERROR', details);
}

export async function listTemplates({ companyId, includeInactive }) {
  const rows = await prisma.importTemplate.findMany({
    where: { ...(companyId && { companyId }), ...(!includeInactive && { status: 'ACTIVE' }) },
    include: { mappings: true, company: { select: { id: true, name: true } } },
    orderBy: [{ companyId: 'asc' }, { name: 'asc' }],
  });
  return rows.map((t) => ({ ...toTemplateShape(t), company: t.company }));
}

export async function getTemplate(id, db = prisma) {
  return toTemplateShape(
    await findOr404(db.importTemplate, id, { ...NOT_FOUND, include: { mappings: true } }),
  );
}

const mappingRows = (mappings) =>
  Object.entries(mappings)
    .filter(([, col]) => col)
    .map(([targetField, sourceColumn]) => ({ targetField, sourceColumn }));

export async function createTemplate(data, actor, req) {
  assertConsistent(data);
  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: data.companyId } });
      if (!company) throw AppError.badRequest('Company does not exist', 'INVALID_REFERENCE');
      const t = await tx.importTemplate.create({
        data: {
          companyId: data.companyId,
          name: data.name,
          dateFormat: data.dateFormat,
          kmMode: data.kmMode,
          driverMatchField: data.driverMatchField,
          duplicateKey: data.duplicateKey,
          keepUnmapped: data.keepUnmapped,
          createdById: actor.id,
          mappings: { create: mappingRows(data.mappings) },
        },
        include: { mappings: true },
      });
      const shaped = toTemplateShape(t);
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'ImportTemplate',
        entityId: t.id,
        newValue: shaped,
        req,
      });
      return shaped;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}

/** Replace a template's settings and mappings. Past batches keep their own snapshot. */
export async function updateTemplate(id, data, actor, req) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await getTemplate(id, tx);
      const merged = { ...before, ...data, mappings: data.mappings ?? before.mappings };
      assertConsistent(merged);
      await tx.importTemplateMapping.deleteMany({ where: { templateId: id } });
      const t = await tx.importTemplate.update({
        where: { id },
        data: {
          name: merged.name,
          dateFormat: merged.dateFormat,
          kmMode: merged.kmMode,
          driverMatchField: merged.driverMatchField,
          duplicateKey: merged.duplicateKey,
          keepUnmapped: merged.keepUnmapped,
          status: merged.status,
          mappings: { create: mappingRows(merged.mappings) },
        },
        include: { mappings: true },
      });
      const after = toTemplateShape(t);
      await recordAudit(tx, {
        userId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: 'ImportTemplate',
        entityId: id,
        previousValue: before,
        newValue: after,
        req,
      });
      return after;
    });
  } catch (err) {
    rethrowUnique(err, UNIQUE_FIELDS);
  }
}
