import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});

/** Lightweight connectivity probe used by the health check. */
export async function checkDatabase() {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return { latencyMs: Date.now() - started };
}

/**
 * Options for transactions that serialize on a parent-row lock (`lockRow`) and then
 * check for conflicts (overlapping periods, balances). READ COMMITTED guarantees
 * reads after the lock see rows committed by the transaction that held it; under
 * MySQL's default REPEATABLE READ the snapshot could predate the lock.
 */
export const LOCKING_TX = { isolationLevel: 'ReadCommitted' };
