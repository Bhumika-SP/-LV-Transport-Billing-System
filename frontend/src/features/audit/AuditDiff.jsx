import { diffRows } from './audit-diff';

/** Field-by-field comparison of an audit record's previous and new values. */
export default function AuditDiff({ previousValue, newValue }) {
  const rows = diffRows(previousValue, newValue);
  if (!rows.length) return <p className="text-sm text-slate-500">No values recorded.</p>;
  const onlyNew = previousValue == null;
  const onlyOld = newValue == null;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Field</th>
            {!onlyNew && <th className="px-3 py-2">Before</th>}
            {!onlyOld && <th className="px-3 py-2">After</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          {rows.map((r) => (
            <tr key={r.key} className={r.changed && !onlyNew && !onlyOld ? 'bg-amber-50/60' : ''}>
              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-slate-600">
                {r.key}
              </td>
              {!onlyNew && (
                <td className="max-w-xs whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-xs text-slate-700">
                  {r.changed && !onlyOld ? (
                    <del className="text-red-700">{r.before}</del>
                  ) : (
                    r.before
                  )}
                </td>
              )}
              {!onlyOld && (
                <td className="max-w-xs whitespace-pre-wrap break-words px-3 py-1.5 font-mono text-xs text-slate-700">
                  {r.changed && !onlyNew ? (
                    <ins className="text-emerald-800 no-underline">{r.after}</ins>
                  ) : (
                    r.after
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
