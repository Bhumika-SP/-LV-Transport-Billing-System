import { Construction } from 'lucide-react';
import PageHeader from '../components/PageHeader';

/** Shown for navigation entries whose module has not been built yet. */
export default function ModulePlaceholderPage({ title, phase }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <Construction className="h-10 w-10 text-slate-400" aria-hidden="true" />
        <p className="mt-3 font-medium text-slate-700">This module is not built yet</p>
        <p className="mt-1 text-sm text-slate-500">Scheduled for Phase {phase}.</p>
      </div>
    </>
  );
}
