import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './ui/Badge';

/** Title block for entity detail pages: back link, name, status, subtitle, actions. */
export default function DetailHeader({ backTo, backLabel, title, status, subtitle, actions }) {
  return (
    <div className="mb-6">
      <Link
        to={backTo}
        className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            {status && <StatusBadge status={status} />}
          </div>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
