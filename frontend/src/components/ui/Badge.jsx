const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

/** Status -> tone. Unknown statuses render gray. */
const STATUS_TONES = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  PENDING: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'red',
  CURRENT: 'blue',
  UPCOMING: 'amber',
  ENDED: 'gray',
  VALIDATED: 'blue',
  IMPORTED: 'green',
  DISCARDED: 'gray',
  FAILED: 'red',
  VALID: 'green',
  WARNING: 'amber',
  ERROR: 'red',
  DUPLICATE: 'gray',
  OPEN: 'amber',
  RECOVERED: 'green',
  VOID: 'red',
  DRAFT: 'gray',
  CALCULATED: 'blue',
  UNDER_REVIEW: 'amber',
  APPROVED: 'blue',
  FINALIZED: 'green',
  UNPAID: 'red',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
};

export default function Badge({ tone = 'gray', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{label}</Badge>;
}
