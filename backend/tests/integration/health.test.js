import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';

describe('health (real database)', () => {
  afterAll(() => prisma.$disconnect());

  it('reports the MySQL test database as up', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database.status).toBe('up');
  });
});
