import { PERMISSIONS } from '../../config/permissions';

/** UI configuration per driver line-item resource (mirrors the backend modules). */
export const EARNINGS = {
  resource: 'earnings',
  title: 'Record allowance / other earning',
  addLabel: 'Add earning',
  managePermission: PERMISSIONS.EARNING_MANAGE,
  types: [
    { value: 'ALLOWANCE', label: 'Allowance' },
    { value: 'OTHER_EARNING', label: 'Other earning' },
  ],
  dateField: 'earningDate',
  textField: 'description',
  textLabel: 'Description',
  emptyTitle: 'No allowances or other earnings',
  typeTone: () => 'green',
};

export const POSITIVE_ADJUSTMENTS = {
  resource: 'adjustments',
  title: 'Record positive adjustment',
  addLabel: 'Add positive adjustment',
  managePermission: PERMISSIONS.ADJUSTMENT_MANAGE,
  types: [{ value: 'POSITIVE_ADJUSTMENT', label: 'Positive adjustment' }],
  dateField: 'adjustmentDate',
  textField: 'reason',
  textLabel: 'Reason',
  emptyTitle: 'No positive adjustments',
};
