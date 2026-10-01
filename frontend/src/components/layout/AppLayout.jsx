import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';
import { LoadingState } from '../ui/States';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/** Opens the drawer on small screens; collapses/expands the sidebar on desktop. */
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  const toggleMenu = () => (isDesktop() ? setCollapsed((c) => !c) : setSidebarOpen((o) => !o));

  return (
    <div className="flex h-full flex-col">
      <Topbar onMenuClick={toggleMenu} />
      <div className="flex min-h-0 flex-1">
        <Sidebar open={sidebarOpen} collapsed={collapsed} onClose={() => setSidebarOpen(false)} />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex-1 p-4 sm:p-6 lg:p-8">
            <ErrorBoundary resetKey={pathname}>
              <Suspense fallback={<LoadingState />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
          <PoweredBy />
        </main>
      </div>
    </div>
  );
}

function PoweredBy() {
  return (
    <footer className="flex items-center justify-center gap-4 px-6 pb-5 text-xs text-slate-400">
      <span className="h-px w-16 bg-slate-200" aria-hidden="true" />
      <span>
        Powered by <strong className="font-semibold text-slate-600">AK Cloud Solutions</strong>
      </span>
      <span className="h-px w-16 bg-slate-200" aria-hidden="true" />
    </footer>
  );
}
