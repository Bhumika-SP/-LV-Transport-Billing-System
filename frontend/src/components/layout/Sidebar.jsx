import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { NAV_SECTIONS, canAccess } from '../../config/navigation';

export default function Sidebar({ open, onClose }) {
  const auth = useAuth();
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((item) => canAccess(item, auth)),
  })).filter((s) => s.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-800 text-sm font-bold text-white">
              LV
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">LV Transport</div>
              <div className="text-xs text-slate-500">Billing System</div>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, idx) => (
            <div key={section.title ?? idx} className="mb-4">
              {section.title && (
                <div className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  {section.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map(({ label, path, icon: Icon }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      end={path === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-brand-50 font-medium text-brand-800'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
