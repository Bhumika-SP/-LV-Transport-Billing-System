import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-3 font-medium text-slate-700">Page not found</p>
      <Link to="/" className="mt-4 text-sm font-medium text-brand-700 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
