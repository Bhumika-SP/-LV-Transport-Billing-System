import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { seedBase, TEST_PASSWORD, TEST_USERS } from '../helpers/db.js';

/**
 * Security inventory (spec §45, Phase 17): discover EVERY route mounted under /api and
 * prove it rejects anonymous callers. A new route that forgets `authenticate` fails
 * here without anyone having to remember to write a test for it.
 */

const PUBLIC = new Set(['GET /api/', 'POST /api/auth/login']);
const ROUTES_DIR = path.resolve('src/routes');

async function discoverRoutes() {
  const index = readFileSync(path.join(ROUTES_DIR, 'index.js'), 'utf8');
  const modules = {};
  for (const [, names, from] of index.matchAll(/import (\{[^}]+\}|\w+) from '([^']+)'/g)) {
    if (!from.startsWith('.')) continue;
    const mod = await import(path.resolve(ROUTES_DIR, from));
    if (names.startsWith('{')) {
      for (const n of names.slice(1, -1).split(',')) modules[n.trim()] = mod[n.trim()];
    } else {
      modules[names] = mod.default;
    }
  }
  const routes = [];
  const collect = (mount, router) => {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: `/api${mount}${layer.route.path}` });
      }
    }
  };
  for (const [, mount, name] of index.matchAll(/api\.use\('([^']+)', (\w+)\)/g)) {
    collect(mount, modules[name]);
  }
  return routes;
}

const app = createApp();
let routes;

beforeAll(async () => {
  routes = await discoverRoutes();
});

describe('route inventory', () => {
  it('discovers the whole API surface', () => {
    expect(routes.length).toBeGreaterThanOrEqual(150);
    expect(routes).toContainEqual({ method: 'POST', path: '/api/settlements/:id/finalize' });
    expect(routes).toContainEqual({ method: 'GET', path: '/api/audit/:id' });
  });

  it('every non-public route rejects anonymous requests with 401', async () => {
    const failures = [];
    for (const r of routes) {
      if (PUBLIC.has(`${r.method} ${r.path}`)) continue;
      const url = r.path.replace(/:(\w+)/g, (_m, p) =>
        p === 'key' ? 'trips' : p === 'entityType' ? 'Driver' : '1',
      );
      const agent = request(app);
      const res = await agent[r.method.toLowerCase()](url)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('state-changing routes also require the CSRF header, even when authenticated', async () => {
    await seedBase();
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: TEST_USERS.admin.email, password: TEST_PASSWORD });
    const cookie = login.headers['set-cookie'];
    expect(cookie).toBeDefined();
    const writes = routes.filter((r) => r.method !== 'GET' && !PUBLIC.has(`${r.method} ${r.path}`));
    expect(writes.length).toBeGreaterThan(60);
    const failures = [];
    for (const r of writes) {
      const url = r.path.replace(/:\w+/g, '1');
      // A plain agent without the header: must be refused before any handler runs.
      const res = await request(app)[r.method.toLowerCase()](url).set('Cookie', cookie).send({});
      if (res.status !== 403 || res.body.code !== 'CSRF_HEADER_MISSING') {
        failures.push(`${r.method} ${r.path} → ${res.status} ${res.body.code}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
