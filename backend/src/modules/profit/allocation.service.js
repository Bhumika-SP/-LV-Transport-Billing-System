import { Decimal } from '../../utils/money.js';
import { getSetting } from '../settings/settings.service.js';
import { allocateProportionally } from './profit-formula.js';

/**
 * Attribute a FINALIZED settlement to companies for company-wise profit (assumption A7,
 * confirmed): proportional to the driver's ACTIVE trip earnings per company in the
 * settlement month. With no trips, the whole amount is recorded as unattributed
 * (companyId null) so monthly/overall totals still reconcile exactly.
 */
export async function allocateSettlement(tx, settlement) {
  await tx.driverSettlementAllocation.deleteMany({ where: { settlementId: settlement.id } });

  const method = await getSetting('profit.allocationMethod', tx);
  const byCompany = await tx.trip.groupBy({
    by: ['companyId'],
    where: {
      driverId: settlement.driverId,
      settlementMonth: settlement.settlementMonth,
      status: 'ACTIVE',
    },
    _sum: { earnings: true },
    _count: true,
    orderBy: { companyId: 'asc' },
  });
  const weights = byCompany.map((r) =>
    method === 'TRIP_COUNT' ? new Decimal(r._count) : (r._sum.earnings ?? new Decimal(0)),
  );
  const amounts = allocateProportionally(settlement.finalAmount, weights);

  const rows = amounts
    ? byCompany.map((r, i) => ({
        companyId: r.companyId,
        tripEarnings: r._sum.earnings ?? new Decimal(0),
        amount: amounts[i],
      }))
    : [{ companyId: null, tripEarnings: new Decimal(0), amount: settlement.finalAmount }];

  await tx.driverSettlementAllocation.createMany({
    data: rows.map((r) => ({
      ...r,
      settlementId: settlement.id,
      settlementMonth: settlement.settlementMonth,
    })),
  });
  return rows;
}

export function clearAllocation(tx, settlementId) {
  return tx.driverSettlementAllocation.deleteMany({ where: { settlementId } });
}
