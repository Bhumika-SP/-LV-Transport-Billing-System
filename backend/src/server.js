import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { syncRolesAndPermissions } from './modules/auth/rbac.js';

const app = createApp();

// Keep roles/permissions in the database in step with src/config/permissions.js, so a
// deploy that adds permissions never runs with a stale RBAC matrix. Idempotent.
try {
  await syncRolesAndPermissions(prisma);
} catch (err) {
  // The API still starts (health check will report DB problems); log loudly.
  logger.error({ err }, 'Could not sync roles and permissions at startup');
}

const server = app.listen(env.PORT, () => {
  logger.info(`LV Billing API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  process.exit(1);
});
