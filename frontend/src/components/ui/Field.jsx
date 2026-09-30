import { useId } from 'react';

export const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

/**
 * Label + control + field-level error. The child receives id / aria props via render prop:
 *   <Field label="Name" error={errors.name?.message}>{(p) => <input {...p} {...register('name')} />}</Field>
 */
export default function Field({ label, error, hint, required, className = '', children }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children({
        id,
        className: inputClass,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
