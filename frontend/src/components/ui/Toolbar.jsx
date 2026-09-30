import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { inputClass } from './Field';

/** Debounced search box. */
export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => setText(value ?? ''), [value]);

  useEffect(() => {
    if (text === (value ?? '')) return undefined;
    const t = setTimeout(() => onChange(text), 350);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
      <input
        type="search"
        aria-label="Search"
        className={`${inputClass} pl-9`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

/** Compact select used for list filters. options: [{ value, label }] */
export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <select
      aria-label={label}
      className={`${inputClass} w-full sm:w-auto`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">
        {label}: {allLabel}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toolbar({ children }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
    </div>
  );
}
