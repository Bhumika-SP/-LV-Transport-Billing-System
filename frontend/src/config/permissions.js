/** Mirrors backend src/config/permissions.js. Used only to decide what to show. */
export const PERMISSIONS = Object.freeze({
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  MASTER_VIEW: 'master.view',
  COMPANY_MANAGE: 'company.manage',
  DRIVER_MANAGE: 'driver.manage',
  VEHICLE_MANAGE: 'vehicle.manage',
  RATE_MANAGE: 'rate.manage',
  ASSIGNMENT_MANAGE: 'assignment.manage',
  COMPANY_SETTLEMENT_VIEW: 'company_settlement.view',
  COMPANY_SETTLEMENT_MANAGE: 'company_settlement.manage',
  COMPANY_SETTLEMENT_CORRECT: 'company_settlement.correct',
  TRIP_VIEW: 'trip.view',
  TRIP_MANAGE: 'trip.manage',
  TRIP_RECALCULATE: 'trip.recalculate',
});

export const ROLES = Object.freeze({ ADMIN: 'ADMIN', BILLER: 'BILLER', AUDITOR: 'AUDITOR' });
