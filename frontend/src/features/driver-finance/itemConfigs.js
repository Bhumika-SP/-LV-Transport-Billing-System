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

export const OTHER_DEDUCTIONS = {
  resource: 'adjustments',
  title: 'Record other deduction',
  addLabel: 'Add deduction',
  managePermission: PERMISSIONS.ADJUSTMENT_MANAGE,
  types: [{ value: 'OTHER_DEDUCTION', label: 'Other deduction' }],
  dateField: 'adjustmentDate',
  textField: 'reason',
  textLabel: 'Reason',
  emptyTitle: 'No other deductions',
  sign: () => '-',
};

const CATEGORY_LABELS = {
  FUEL: 'Fuel',
  TOLL: 'Toll',
  MAINTENANCE: 'Maintenance',
  EMI: 'EMI',
  OTHER: 'Other',
};
const categories = (list) => list.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

/** LV-paid: deducted from the driver settlement (spec §23–24). */
export const LV_EXPENSES = {
  resource: 'lv-expenses',
  title: 'Record LV-paid expense (deducted from settlement)',
  addLabel: 'Add LV-paid expense',
  managePermission: PERMISSIONS.LV_EXPENSE_MANAGE,
  types: categories(['FUEL', 'TOLL', 'MAINTENANCE', 'EMI']),
  typeField: 'category',
  typeLabel: 'Category',
  dateField: 'expenseDate',
  textField: 'description',
  textLabel: 'Description',
  withVehicle: true,
  withReceipt: true,
  emptyTitle: 'No LV-paid expenses',
  sign: () => '-',
  typeTone: () => 'red',
};

/** Driver-paid: reimbursed, i.e. added to the driver settlement (spec §22, §24). */
export const DRIVER_EXPENSES = {
  resource: 'driver-expenses',
  title: 'Record driver-paid expense (reimbursed in settlement)',
  addLabel: 'Add driver-paid expense',
  managePermission: PERMISSIONS.DRIVER_EXPENSE_MANAGE,
  types: categories(['FUEL', 'TOLL', 'MAINTENANCE', 'OTHER']),
  typeField: 'category',
  typeLabel: 'Category',
  dateField: 'expenseDate',
  textField: 'description',
  textLabel: 'Description',
  withVehicle: true,
  withReceipt: true,
  emptyTitle: 'No driver-paid expenses',
  typeTone: () => 'green',
};

export const vehicleColumn = {
  key: 'vehicle',
  header: 'Vehicle',
  render: (i) => i.vehicle?.registrationNumber ?? '—',
};
