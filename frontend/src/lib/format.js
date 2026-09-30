/**
 * Format a money value as INR with Indian digit grouping: "2500000.00" -> "₹25,00,000.00".
 *
 * The API sends DECIMAL values as strings. Formatting is done on the string so no
 * floating-point conversion ever touches a financial amount.
 */
export function formatINR(value, { withSymbol = true } = {}) {
  if (value === null || value === undefined || value === '') return '—';

  const str = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) return str;

  const [, sign, intPart, fracPart = ''] = match;
  const paise = (fracPart + '00').slice(0, 2);

  // Indian grouping: last 3 digits, then groups of 2.
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;

  return `${sign ? '-' : ''}${withSymbol ? '₹' : ''}${grouped}.${paise}`;
}
