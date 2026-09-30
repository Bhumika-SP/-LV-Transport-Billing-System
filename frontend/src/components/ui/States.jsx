import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import Button from './Button';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="h-8 w-8 text-slate-300" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-slate-700">Could not load data</p>
      <p className="mt-1 text-sm text-slate-500">{error?.message ?? 'Something went wrong'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
