import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { NAV_SECTIONS, canAccess } from '../../config/navigation';

export default function Sidebar({ open, collapsed, onClose }) {
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
          className="fixed inset-x-0 top-16 bottom-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:shrink-0 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:hidden' : ''}`}
        aria-label="Main navigation"
      >
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, idx) => (
            <div key={section.title ?? idx} className="mb-4">
              {section.title && (
                <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
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
                        `group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-brand-50 font-medium text-brand-700'
                            : 'text-slate-600 hover:bg-brand-50/60 hover:text-brand-700'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`h-5 w-5 shrink-0 ${
                              isActive
                                ? 'text-brand-600'
                                : 'text-slate-500 group-hover:text-brand-600'
                            }`}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          {label}
                        </>
                      )}
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
