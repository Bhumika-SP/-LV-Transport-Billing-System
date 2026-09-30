import { Clock } from 'lucide-react';

/** Tab content for sections delivered by a later build phase. */
export default function PhasePlaceholder({ what, phase }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
      <Clock className="h-6 w-6 text-slate-300" aria-hidden="true" />
      <p className="mt-2 text-sm text-slate-600">{what} will appear here</p>
      <p className="mt-1 text-xs text-slate-400">Delivered in Phase {phase}</p>
    </div>
  );
}
