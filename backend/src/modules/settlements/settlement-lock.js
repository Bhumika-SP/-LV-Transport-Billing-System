import { AppError } from '../../utils/AppError.js';

/**
 * Guard for every write that affects a driver's monthly settlement (trips, earnings,
 * adjustments, expenses, advance recoveries). Call inside the write's transaction.
 *
 *   no settlement / DRAFT      → allowed
 *   CALCULATED                 → allowed; the settlement becomes DRAFT (must be recalculated)
 *   UNDER_REVIEW / APPROVED    → rejected (return it to draft first)
 *   FINALIZED                  → rejected (an admin must reopen it)
 *
 * The settlement row is read with FOR UPDATE so a concurrent workflow step (submit,
 * approve, finalize) and this write are serialized.
 */
export async function assertSettlementOpen(tx, driverId, settlementMonth) {
  const [row] = await tx.$queryRaw`
    SELECT id, status FROM driver_settlements
    WHERE driver_id = ${driverId} AND settlement_month = ${settlementMonth}
    FOR UPDATE`;
  if (!row) return;

  if (row.status === 'FINALIZED') {
    throw AppError.conflict(
      `The ${settlementMonth} settlement for this driver is finalized. An admin must reopen it before its data can change.`,
      'SETTLEMENT_LOCKED',
    );
  }
  if (row.status === 'UNDER_REVIEW' || row.status === 'APPROVED') {
    throw AppError.conflict(
      `The ${settlementMonth} settlement for this driver is ${row.status === 'APPROVED' ? 'approved' : 'under review'}. Return it to draft before changing its data.`,
      'SETTLEMENT_IN_REVIEW',
    );
  }
  if (row.status === 'CALCULATED') {
    // The stored calculation no longer matches the data: require a recalculation.
    await tx.driverSettlement.update({ where: { id: row.id }, data: { status: 'DRAFT' } });
  }
}
