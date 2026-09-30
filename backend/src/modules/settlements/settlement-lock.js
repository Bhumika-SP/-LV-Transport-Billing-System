/**
 * Guard for writes that affect a driver's monthly settlement (trips, earnings,
 * adjustments, expenses, advance recoveries).
 *
 * Phase 7: no settlements exist yet, so every month is open. Phase 9 replaces this with
 * the real rule (locked while under review, approved or finalized).
 */
export async function assertSettlementOpen(_tx, _driverId, _settlementMonth) {}
