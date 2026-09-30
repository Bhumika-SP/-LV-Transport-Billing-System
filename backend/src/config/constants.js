/** All business dates and settlement months are interpreted in this timezone. */
export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/** Settlement month format stored in the database, e.g. "2026-09". */
export const SETTLEMENT_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Spec §20: the only payment methods allowed in V1. */
export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'];
