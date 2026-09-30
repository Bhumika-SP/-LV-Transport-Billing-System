import { Prisma } from '@prisma/client';
import { AppError } from './AppError.js';

/** Load a record or throw a 404 with an entity-specific code. */
export async function findOr404(delegate, id, { code, label, ...args }) {
  const row = await delegate.findUnique({ where: { id }, ...args });
  if (!row) throw AppError.notFound(`${label} not found`, code);
  return row;
}

/**
 * Convert a Prisma unique-constraint violation into a 409 with a field-level detail.
 * `fields` maps a column name fragment of the index to { path, message }.
 */
export function rethrowUnique(err, fields) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String(err.meta?.target ?? '');
    for (const [fragment, { path, message }] of Object.entries(fields)) {
      if (target.includes(fragment)) {
        throw AppError.conflict(message, 'DUPLICATE_RECORD', [{ path, message }]);
      }
    }
  }
  throw err;
}

/** Lock a parent row for the rest of the transaction (serializes overlap checks). */
export async function lockRow(tx, table, id) {
  // `table` is always a hard-coded identifier from our own code, never user input.
  await tx.$queryRawUnsafe(`SELECT id FROM \`${table}\` WHERE id = ? FOR UPDATE`, id);
}

/** STATUS_CHANGE when the only change is `status`, otherwise UPDATE. */
export function updateAction(data, before, actions) {
  const keys = Object.keys(data);
  return keys.length === 1 && keys[0] === 'status' && data.status !== before.status
    ? actions.STATUS_CHANGE
    : actions.UPDATE;
}
