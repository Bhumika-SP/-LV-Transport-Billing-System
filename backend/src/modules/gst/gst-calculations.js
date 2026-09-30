import { Decimal, roundMoney, toDecimal } from '../../utils/money.js';

/**
 * GST computation (spec §52). Rates come from data (tax_rate_configs or the record),
 * never from code.
 *   INTRA_STATE: CGST = SGST = taxable × (rate / 2) %
 *   INTER_STATE: IGST = taxable × rate %
 *   Cess         = taxable × cessRate %
 * Each head is rounded half-up to paise; invoice value = taxable + all heads.
 */
export function calculateGst({ taxableValue, taxRate, cessRate = 0, supplyType }) {
  const taxable = roundMoney(taxableValue);
  const pct = (rate) => roundMoney(taxable.times(toDecimal(rate)).dividedBy(100));
  const zero = new Decimal(0);

  const heads =
    supplyType === 'INTRA_STATE'
      ? {
          cgst: pct(toDecimal(taxRate).dividedBy(2)),
          sgst: pct(toDecimal(taxRate).dividedBy(2)),
          igst: zero,
        }
      : { cgst: zero, sgst: zero, igst: pct(taxRate) };
  const cess = pct(cessRate);
  const totalTax = roundMoney(heads.cgst.plus(heads.sgst).plus(heads.igst).plus(cess));
  return {
    taxableValue: taxable,
    ...heads,
    cess,
    totalTax,
    invoiceValue: roundMoney(taxable.plus(totalTax)),
  };
}

/** State code from a GSTIN (first two digits). */
export const stateCodeOfGstin = (gstin) => (gstin ? gstin.slice(0, 2) : null);
