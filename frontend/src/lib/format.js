/**
 * Display formatting. Money arrives from the API as decimal strings and is formatted
 * as a string — it is never converted to a float. Business dates arrive as
 * "YYYY-MM-DD" and are formatted by string parts, so the browser timezone cannot shift them.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian digit grouping: 2500000 -> 25,00,000 */
function groupIndian(intPart) {
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
}

/** "2500000.00" -> "₹25,00,000.00" */
export function formatINR(value, { withSymbol = true } = {}) {
  if (value === null || value === undefined || value === '') return '—';

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return String(value);

  const [, sign, intPart, fracPart = ''] = match;
  const paise = (fracPart + '00').slice(0, 2);
  return `${sign ? '-' : ''}${withSymbol ? '₹' : ''}${groupIndian(intPart)}.${paise}`;
}

/** "150.00" -> "150", "150.50" -> "150.5" with Indian grouping. */
export function formatKm(value) {
  if (value === null || value === undefined || value === '') return '—';
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return String(value);
  const frac = (match[2] ?? '').replace(/0+$/, '');
  return `${groupIndian(match[1])}${frac ? `.${frac}` : ''}`;
}

/** "2026-09-14" -> "14 Sep 2026" */
export function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!d) return String(value);
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "2026-09" -> "Sep 2026" */
export function formatMonth(value) {
  if (!value) return '—';
  const [y, m] = String(value).split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** ISO timestamp -> "14 Sep 2026, 3:45 pm" in India time. */
export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Current month in India time, "YYYY-MM". */
export function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date())
    .slice(0, 7);
}

/** Today's date in India time, "YYYY-MM-DD". */
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
