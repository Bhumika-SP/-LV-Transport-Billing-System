import { AppError } from '../../utils/AppError.js';
import { createDriverItemService } from '../driver-items/driver-item.factory.js';
import { assertSettlementOpen } from '../settlements/settlement-lock.js';

/**
 * Spec §24 / §50. Direction is decided ONLY by who paid:
 *   LV-paid     → deducted from the driver settlement (fuel, toll, maintenance, EMI)
 *   Driver-paid → reimbursed, i.e. added to the driver settlement
 */
export const CATEGORIES_BY_PAYER = {
  LV: ['FUEL', 'TOLL', 'MAINTENANCE', 'EMI'],
  DRIVER: ['FUEL', 'TOLL', 'MAINTENANCE', 'OTHER'],
};

async function validateExpense(tx, data) {
  if (!CATEGORIES_BY_PAYER[data.paidBy].includes(data.category)) {
    throw AppError.badRequest(
      `${data.category} is not a valid category for ${data.paidBy === 'LV' ? 'LV-paid' : 'driver-paid'} expenses`,
      'VALIDATION_ERROR',
      [{ path: 'category', message: `Allowed: ${CATEGORIES_BY_PAYER[data.paidBy].join(', ')}` }],
    );
  }
  const vehicle = await tx.vehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) {
    throw AppError.badRequest('Vehicle does not exist', 'INVALID_REFERENCE', [
      { path: 'vehicleId', message: 'Select a valid vehicle' },
    ]);
  }
}

const common = {
  model: 'driverExpense',
  entityType: 'DriverExpense',
  notFoundCode: 'EXPENSE_NOT_FOUND',
  dateField: 'expenseDate',
  typeField: 'category',
  include: { vehicle: { select: { id: true, registrationNumber: true } } },
  validate: validateExpense,
  guard: assertSettlementOpen,
};

/** /api/lv-expenses — LV-paid fuel, toll, maintenance, EMI (deductions). */
export const lvExpensesService = createDriverItemService({ ...common, scope: { paidBy: 'LV' } });

/** /api/driver-expenses — paid by the driver personally (reimbursements). */
export const driverExpensesService = createDriverItemService({
  ...common,
  scope: { paidBy: 'DRIVER' },
});
