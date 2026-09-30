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
const guards = new Map();

/**
 * Routes that are authenticated but deliberately carry no single permission guard,
 * with the reason. Anything else without requirePermission fails the audit below.
 */
const NO_PERMISSION_GUARD = {
  'POST /api/auth/logout': 'any signed-in user',
  'GET /api/auth/me': 'any signed-in user (own profile)',
  'POST /api/auth/change-password': 'any signed-in user (own password)',
  'GET /api/dashboard/': 'sections filtered per permission in the service',
  'GET /api/reports/': 'lists only reports the caller may run',
  'GET /api/reports/:key': 'per-report permission checked in the service',
  'GET /api/notifications/': 'own notifications only',
  'GET /api/notifications/unread-count': 'own notifications only',
  'POST /api/notifications/read-all': 'own notifications only',
  'POST /api/notifications/:id/read': 'own notifications only',
  'GET /api/documents/': 'record-type permission checked in the service',
  'POST /api/documents/': 'record-type permission checked in the service',
  'GET /api/documents/:id/download': 'record-type permission checked in the service',
  'DELETE /api/documents/:id': 'record-type permission checked in the service',
};

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
    // Router-level guards (router.use(requirePermission(...))) apply to every route after them.
    let routerGuards = [];
    for (const layer of router.stack) {
      if (!layer.route) {
        routerGuards = [...routerGuards, ...(layer.handle.requiredPermissions ?? [])];
        continue;
      }
      const own = layer.route.stack.flatMap((l) => l.handle.requiredPermissions ?? []);
      for (const method of Object.keys(layer.route.methods)) {
        const route = { method: method.toUpperCase(), path: `/api${mount}${layer.route.path}` };
        guards.set(`${route.method} ${route.path}`, [...routerGuards, ...own]);
        routes.push(route);
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

  it('authorization audit: every route has a permission guard or a documented exception', () => {
    const unguarded = routes
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !PUBLIC.has(k) && !guards.get(k).length && !NO_PERMISSION_GUARD[k]);
    expect(unguarded).toEqual([]);
    // The exception list must not go stale either.
    for (const k of Object.keys(NO_PERMISSION_GUARD)) expect(guards.has(k), k).toBe(true);
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
