/**
 * Seed script: `npm run db:seed -w backend`
 *
 * 1. Always: sync roles, permissions and the role→permission matrix (safe in production).
 * 2. Development only: create the three DEV users (password from SEED_USER_PASSWORD) and
 *    the clearly-labelled development dataset for delivered phases.
 *
 * Idempotent: running it again does not duplicate data.
 */
import { ROLES } from '../src/config/permissions.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { syncRolesAndPermissions } from '../src/modules/auth/rbac.js';
import { seedDevelopmentData } from './seed-dev-data.js';

const DEV_USERS = [
  { name: 'Rajesh Kulkarni', email: 'admin@lvtransport.dev', role: ROLES.ADMIN },
  { name: 'Anitha Prakash', email: 'biller@lvtransport.dev', role: ROLES.BILLER },
  { name: 'Sandeep Rao', email: 'auditor@lvtransport.dev', role: ROLES.AUDITOR },
];

async function seedDevUsers(password) {
  const passwordHash = await hashPassword(password);
  for (const u of DEV_USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, roleId: role.id },
    });
    console.log(`  user ${u.email} (${u.role})`);
  }
}

async function main() {
  console.log('Syncing roles and permissions…');
  await syncRolesAndPermissions(prisma);

  if (env.isProduction) {
    console.log('Production: skipping development users and data.');
    return;
  }

  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 10) {
    console.log('SEED_USER_PASSWORD not set (min 10 chars): skipping development users and data.');
    return;
  }

  console.log('Creating development users…');
  await seedDevUsers(password);

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: DEV_USERS[0].email } });
  await seedDevelopmentData(admin);
}

main()
  .then(() => console.log('Seed complete.'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
