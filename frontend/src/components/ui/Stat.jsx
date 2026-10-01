/** Labelled figure for financial summaries. `tone` highlights the key number. */
export default function Stat({ label, value, hint, tone = 'default' }) {
  const toneClass = {
    default: 'text-slate-900',
    positive: 'text-emerald-700',
    warning: 'text-amber-700',
    muted: 'text-slate-500',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
