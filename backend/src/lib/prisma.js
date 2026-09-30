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
