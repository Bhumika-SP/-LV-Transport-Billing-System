import { describe, expect, it } from 'vitest';
import * as backend from '../../../backend/src/config/permissions.js';
import { NAV_ITEMS, canAccess } from './navigation';
import { PERMISSIONS, ROLES } from './permissions';

/** Permission codes a role holds, straight from the backend RBAC matrix. */
const holder = (role) => {
  const codes = backend.PERMISSION_DEFINITIONS.filter((d) => d.roles.includes(role)).map(
    (d) => d.code,
  );
  return { can: (p) => codes.includes(p), hasRole: (...r) => r.includes(role) };
};
const visible = (role) => NAV_ITEMS.filter((i) => canAccess(i, holder(role))).map((i) => i.path);

describe('frontend RBAC mirrors the backend', () => {
  it('permission codes and roles are identical on both sides', () => {
    expect(PERMISSIONS).toEqual(backend.PERMISSIONS);
    expect(ROLES).toEqual(backend.ROLES);
  });

  it('every navigation item is guarded or explicitly open to all', () => {
    const open = NAV_ITEMS.filter((i) => !i.permission && !i.roles).map((i) => i.path);
    expect(open).toEqual(['/']);
  });

  it('Billers never see profit, GST, tax, audit, users or settings', () => {
    const paths = visible('BILLER');
    for (const p of ['/profit/monthly', '/gst', '/tax-reports', '/audit', '/users', '/settings']) {
      expect(paths).not.toContain(p);
    }
    expect(paths).toEqual(expect.arrayContaining(['/trips', '/settlements']));
  });

  it('Auditors see finance, tax and audit but not user administration', () => {
    const paths = visible('AUDITOR');
    expect(paths).toEqual(expect.arrayContaining(['/gst', '/tax-reports', '/audit']));
    expect(paths).not.toContain('/users');
  });

  it('Admins see every module', () => {
    expect(visible('ADMIN')).toHaveLength(NAV_ITEMS.length);
  });
});
