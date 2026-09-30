/**
 * Create (or re-activate) an Admin/Manager account. Intended for the first
 * production admin, after `npm run db:deploy` and `npm run db:seed`.
 *
 *   ADMIN_PASSWORD='<strong password>' npm run create-admin -w backend -- --email you@lvtransport.in --name "Your Name"
 *
 * The password is read from the environment so it never appears in shell history
 * as an argument.
 */
import { parseArgs } from 'node:util';
import { ROLES } from '../src/config/permissions.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { syncRolesAndPermissions } from '../src/modules/auth/rbac.js';
import { recordAudit, AUDIT_ACTIONS } from '../src/modules/audit/audit.service.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!email || !name || !password || password.length < 10) {
  console.error(
    'Usage: ADMIN_PASSWORD=<min 10 chars> npm run create-admin -- --email <email> --name "<name>"',
  );
  process.exit(1);
}

try {
  await syncRolesAndPermissions(prisma);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: ROLES.ADMIN } });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      roleId: role.id,
      status: 'ACTIVE',
      passwordHash,
      tokenVersion: { increment: 1 },
    },
    create: { name, email, passwordHash, roleId: role.id },
  });
  await recordAudit(null, {
    userId: user.id,
    action: AUDIT_ACTIONS.CREATE,
    entityType: 'User',
    entityId: user.id,
    newValue: { email, name, role: ROLES.ADMIN },
    reason: 'create-admin script',
  });
  console.log(`Admin ready: ${email}`);
} finally {
  await prisma.$disconnect();
}
