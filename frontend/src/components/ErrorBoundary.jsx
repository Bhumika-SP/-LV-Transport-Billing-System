import { AlertTriangle } from 'lucide-react';
import { Component } from 'react';

const RELOAD_FLAG = 'lv-chunk-reload';

/** A page's code failed to download (stale tab after a deploy, dev server restart, flaky network). */
const isChunkError = (error) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Loading chunk/i.test(
    String(error?.message ?? error),
  );

/**
 * Shows a message with a Reload button instead of a blank screen when a page crashes.
 * A failed page-code download is retried once automatically with a full reload.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
    if (!isChunkError(error)) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    } catch {
      /* storage unavailable: fall through to the manual Reload button */
    }
  }

  componentDidUpdate(prevProps) {
    // Navigating to another page clears the error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* ignore */
      }
      return this.props.children;
    }
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Something went wrong</h2>
        <p className="mt-1 text-sm text-slate-500">
          This page could not be displayed. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Reload page
        </button>
      </div>
    );
  }
}
