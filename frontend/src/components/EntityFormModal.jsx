import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { applyServerErrors } from '../lib/api';
import Button from './ui/Button';
import Field from './ui/Field';
import Modal from './ui/Modal';

/**
 * Config-driven create/edit form.
 * fields: [{ name, label, type?: text|email|date|number|select|textarea, required?, options?,
 *            placeholder?, hint?, full? (span both columns), section? (heading before field) }]
 * Empty inputs are sent as '' which the API treats as "clear this field".
 */
export default function EntityFormModal({
  open,
  onClose,
  title,
  fields,
  schema,
  initialValues,
  onSubmit,
  submitLabel = 'Save',
  successMessage = 'Saved',
  invalidateKeys = [],
  onSuccess,
  size = 'lg',
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset(initialValues);
  }, [open, initialValues, reset]);

  const mutation = useMutation({
    mutationFn: onSubmit,
    onSuccess: (data) => {
      toast.success(successMessage);
      invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      onSuccess?.(data);
      onClose();
    },
    onError: (err) => {
      // Conflicts (duplicates, overlaps) carry a useful message: show it as well as the field error.
      if (!applyServerErrors(err, setError) || err.status === 409) toast.error(err.message);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="entity-form" loading={mutation.isPending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id="entity-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid gap-4 sm:grid-cols-2"
        noValidate
      >
        {fields.map((f) => (
          <FieldControl
            key={f.name}
            field={f}
            register={register}
            error={errors[f.name]?.message}
          />
        ))}
      </form>
    </Modal>
  );
}

function FieldControl({ field: f, register, error }) {
  const span = f.full || f.type === 'textarea' ? 'sm:col-span-2' : '';
  return (
    <>
      {f.section && (
        <h3 className="border-b border-slate-100 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase sm:col-span-2">
          {f.section}
        </h3>
      )}
      <Field label={f.label} required={f.required} error={error} hint={f.hint} className={span}>
        {(p) => {
          const reg = register(f.name);
          if (f.type === 'select') {
            return (
              <select {...p} {...reg}>
                {!f.required && <option value="">—</option>}
                {f.required && f.placeholder && <option value="">{f.placeholder}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
          }
          if (f.type === 'textarea') return <textarea {...p} rows={3} {...reg} />;
          return (
            <input
              {...p}
              {...reg}
              type={f.type ?? 'text'}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              step={f.step}
            />
          );
        }}
      </Field>
    </>
  );
}
