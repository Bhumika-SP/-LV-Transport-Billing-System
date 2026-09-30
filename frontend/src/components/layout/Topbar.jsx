import { Bell, Menu } from 'lucide-react';

export default function Topbar({ onMenuClick }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      <button
        type="button"
        className="rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden text-sm text-slate-500 lg:block">LV Transport</div>

      <div className="flex items-center gap-2">
        {/* Notification center arrives in Phase 15; user menu in Phase 2. */}
        <button
          type="button"
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notifications"
          disabled
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
