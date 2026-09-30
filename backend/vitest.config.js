import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests use a dedicated MySQL database configured in backend/.env.test.
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/setup/globalSetup.js'],
    // Test files share one database, so they run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      JWT_SECRET: 'test-only-jwt-secret-that-is-at-least-32-chars',
      LOGIN_RATE_LIMIT_MAX: '1000',
    },
  },
});
