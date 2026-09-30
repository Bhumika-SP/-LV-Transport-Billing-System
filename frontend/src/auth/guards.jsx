import { Loader2, ShieldAlert } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';

/** Redirects to /login (remembering the target) when there is no session. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500" role="status">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (!user) {
    const next = location.pathname + location.search;
    return (
      <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
    );
  }
  return <Outlet />;
}

export function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <ShieldAlert className="h-10 w-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 font-medium text-slate-700">You do not have access to this page</p>
      <Link to="/" className="mt-4 text-sm font-medium text-brand-700 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}

/**
 * Route-level permission gate (UX only — the API enforces the same rule).
 * Accepts a permission code and/or a list of role codes.
 */
export function RequireAccess({ permission, roles, children }) {
  const { can, hasRole } = useAuth();
  const allowed = (!permission || can(permission)) && (!roles || hasRole(...roles));
  return allowed ? children : <Forbidden />;
}
