/**
 * RBAC source of truth (spec §6–9). Seeded into roles / permissions / role_permissions
 * by `syncRolesAndPermissions()`. The backend authorizes by PERMISSION code, never by
 * role name, so the matrix can evolve without touching route code.
 *
 * Permissions are added phase by phase as each module is delivered.
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  BILLER: 'BILLER',
  AUDITOR: 'AUDITOR',
});

export const ROLE_DEFINITIONS = [
  {
    code: ROLES.ADMIN,
    name: 'Admin / Manager',
    description: 'Highest operational authority; approves and finalizes driver settlements.',
  },
  {
    code: ROLES.BILLER,
    name: 'Biller / Operator',
    description:
      'Daily operational processing: master data, trips, imports, settlement preparation.',
  },
  {
    code: ROLES.AUDITOR,
    name: 'Auditor / Finance',
    description: 'Financial reporting, reconciliation and audit. Read-oriented.',
  },
];

export const PERMISSIONS = Object.freeze({
  // System
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  AUDIT_VIEW: 'audit.view',
  // Master data (Phase 3)
  MASTER_VIEW: 'master.view',
  COMPANY_MANAGE: 'company.manage',
  DRIVER_MANAGE: 'driver.manage',
  VEHICLE_MANAGE: 'vehicle.manage',
  RATE_MANAGE: 'rate.manage',
  ASSIGNMENT_MANAGE: 'assignment.manage',
  // Company settlement (Phase 4)
  COMPANY_SETTLEMENT_VIEW: 'company_settlement.view',
  COMPANY_SETTLEMENT_MANAGE: 'company_settlement.manage',
  COMPANY_SETTLEMENT_CORRECT: 'company_settlement.correct',
  // Trips (Phase 5)
  TRIP_VIEW: 'trip.view',
  TRIP_MANAGE: 'trip.manage',
  TRIP_RECALCULATE: 'trip.recalculate',
});

const { ADMIN, BILLER, AUDITOR } = ROLES;
const P = PERMISSIONS;

/** [code, module, description, roles] */
export const PERMISSION_DEFINITIONS = [
  [
    P.USER_MANAGE,
    'System',
    'Create users, change roles, activate/deactivate, reset passwords',
    [ADMIN],
  ],
  [P.ROLE_VIEW, 'System', 'View roles and the permission matrix', [ADMIN]],
  [P.AUDIT_VIEW, 'System', 'View audit history', [ADMIN, AUDITOR]],

  [
    P.MASTER_VIEW,
    'Master data',
    'View companies, drivers, vehicles, types, rates, assignments',
    [ADMIN, BILLER, AUDITOR],
  ],
  [P.COMPANY_MANAGE, 'Master data', 'Create/edit/activate/deactivate companies', [ADMIN, BILLER]],
  [P.DRIVER_MANAGE, 'Master data', 'Create/edit/activate/deactivate drivers', [ADMIN, BILLER]],
  [P.VEHICLE_MANAGE, 'Master data', 'Create/edit vehicles and vehicle types', [ADMIN, BILLER]],
  [
    P.RATE_MANAGE,
    'Master data',
    'Add or cancel vehicle-type rates (affects trip earnings)',
    [ADMIN],
  ],
  [
    P.ASSIGNMENT_MANAGE,
    'Master data',
    'Create/end driver and vehicle assignments',
    [ADMIN, BILLER],
  ],

  [
    P.COMPANY_SETTLEMENT_VIEW,
    'Company settlement',
    'View monthly company settlements',
    [ADMIN, BILLER, AUDITOR],
  ],
  [
    P.COMPANY_SETTLEMENT_MANAGE,
    'Company settlement',
    'Record expected amounts and mark settlements received',
    [ADMIN, BILLER],
  ],
  [
    P.COMPANY_SETTLEMENT_CORRECT,
    'Company settlement',
    'Correct or revert a RECEIVED settlement (reason required)',
    [ADMIN],
  ],

  [P.TRIP_VIEW, 'Trips', 'View trips', [ADMIN, BILLER, AUDITOR]],
  [P.TRIP_MANAGE, 'Trips', 'Create/edit/cancel manual trips', [ADMIN, BILLER]],
  [
    P.TRIP_RECALCULATE,
    'Trips',
    'Re-resolve a trip rate and recalculate earnings (audited)',
    [ADMIN],
  ],
].map(([code, module, description, roles]) => ({ code, module, description, roles }));
