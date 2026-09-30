import { ROLES } from '../../src/config/permissions.js';
import { prisma } from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { syncRolesAndPermissions } from '../../src/modules/auth/rbac.js';

export { prisma };

export const TEST_PASSWORD = 'Test-Password-123';

export const TEST_USERS = {
  admin: { name: 'Test Admin', email: 'admin@test.local', role: ROLES.ADMIN },
  biller: { name: 'Test Biller', email: 'biller@test.local', role: ROLES.BILLER },
  auditor: { name: 'Test Auditor', email: 'auditor@test.local', role: ROLES.AUDITOR },
};

/** Empty every application table (test database only — see globalSetup guard). */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  // audit_logs is append-only: a trigger rejects DELETE. TRUNCATE does not fire triggers
  // and is only ever used here, against the *_test database.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE `audit_logs`');
  // One connection, so FOREIGN_KEY_CHECKS applies to every statement.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const { name } of tables) {
      if (name !== 'audit_logs') await tx.$executeRawUnsafe(`DELETE FROM \`${name}\``);
    }
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  });
}

let passwordHash;

/** Reset DB, sync RBAC and create one user per role. Returns { admin, biller, auditor }. */
export async function seedBase() {
  await resetDatabase();
  await syncRolesAndPermissions(prisma);
  passwordHash ??= await hashPassword(TEST_PASSWORD);

  const users = {};
  for (const [key, u] of Object.entries(TEST_USERS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    users[key] = await prisma.user.create({
      data: { name: u.name, email: u.email, passwordHash, roleId: role.id },
    });
  }
  return users;
}
