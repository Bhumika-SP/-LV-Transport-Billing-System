/**
 * CONFIGURABLE business rules (stored in the `settings` table, admin-editable).
 * Each definition supplies the type, default and description; unknown keys are rejected.
 * Add new settings here as later phases need them.
 */
export const SETTING_DEFINITIONS = {
  'profit.allocationMethod': {
    type: 'string',
    default: 'TRIP_EARNINGS',
    options: ['TRIP_EARNINGS', 'TRIP_COUNT'],
    group: 'Profit',
    description:
      'How a finalized driver settlement is attributed to companies for company-wise profit (applies to settlements finalized after the change).',
  },
  'assignments.allowConcurrentCompaniesPerVehicle': {
    type: 'boolean',
    default: false,
    group: 'Assignments',
    description: 'Allow a vehicle to be assigned to more than one company for overlapping dates.',
  },
  'assignments.allowConcurrentVehiclesPerDriver': {
    type: 'boolean',
    default: false,
    group: 'Assignments',
    description: 'Allow a driver to be assigned to more than one vehicle for overlapping dates.',
  },
  'assignments.allowConcurrentDriversPerVehicle': {
    type: 'boolean',
    default: false,
    group: 'Assignments',
    description:
      'Allow more than one driver on the same vehicle for overlapping dates (e.g. shift drivers).',
  },
};
