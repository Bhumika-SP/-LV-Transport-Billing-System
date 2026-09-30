import { execSync } from 'node:child_process';

/**
 * Runs once before the suite: applies migrations to the test database.
 * Refuses to touch any database whose name does not end in "_test", because the
 * integration helpers truncate every table.
 */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Create backend/.env.test (see .env.test.example).');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${dbName}": database name must end in "_test".`,
    );
  }
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
