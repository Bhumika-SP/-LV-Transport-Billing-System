import { useSearchParams } from 'react-router-dom';

/**
 * URL-synced tabs (?tab=key) so a tab can be linked to and survives refresh.
 * tabs: [{ key, label, content }]
 */
export default function Tabs({ tabs }) {
  const [params, setParams] = useSearchParams();
  const activeKey = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : tabs[0].key;
  const active = tabs.find((t) => t.key === activeKey);

  // Each tab starts with clean list settings: a sort/filter/page chosen on one tab must not
  // leak into another tab's list request (it can be invalid there, e.g. a different sort column).
  const select = (key) => setParams({ tab: key }, { replace: true });

  return (
    <div>
      <div className="mb-4 overflow-x-auto border-b border-slate-200">
        <nav className="-mb-px flex gap-6" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === activeKey}
              onClick={() => select(t.key)}
              className={`border-b-2 py-2.5 text-sm whitespace-nowrap ${
                t.key === activeKey
                  ? 'border-brand-700 font-medium text-brand-800'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div role="tabpanel">{active.content}</div>
    </div>
  );
}
