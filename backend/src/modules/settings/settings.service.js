import { SETTING_DEFINITIONS } from '../../config/settings.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';

function definition(key) {
  const def = SETTING_DEFINITIONS[key];
  if (!def) throw AppError.notFound(`Unknown setting ${key}`, 'SETTING_NOT_FOUND');
  return def;
}

/** Current value of a setting, falling back to its default. */
export async function getSetting(key, db = prisma) {
  const def = definition(key);
  const row = await db.setting.findUnique({ where: { key } });
  return row ? row.value : def.default;
}

export async function listSettings() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.keys(SETTING_DEFINITIONS) } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return Object.entries(SETTING_DEFINITIONS).map(([key, def]) => ({
    key,
    group: def.group,
    type: def.type,
    description: def.description,
    defaultValue: def.default,
    value: byKey[key] ? byKey[key].value : def.default,
    updatedAt: byKey[key]?.updatedAt ?? null,
  }));
}

export async function updateSetting(key, value, actor, req) {
  const def = definition(key);
  if (typeof value !== def.type) {
    throw AppError.badRequest(`Setting ${key} must be a ${def.type}`, 'VALIDATION_ERROR', [
      { path: 'value', message: `Must be a ${def.type}` },
    ]);
  }
  return prisma.$transaction(async (tx) => {
    const previous = await getSetting(key, tx);
    const row = await tx.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value, description: def.description },
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: 'Setting',
      entityId: key,
      previousValue: { value: previous },
      newValue: { value },
      req,
    });
    return { key, value: row.value, updatedAt: row.updatedAt };
  });
}
