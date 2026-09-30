import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { applyServerErrors, post } from '../../lib/api';
import { formatDate, formatINR, today } from '../../lib/format';
import { v } from '../../lib/forms';

const schema = z
  .object({
    ratePerKm: v.amount('Rate').refine((s) => Number(s) > 0, 'Rate must be greater than zero'),
    effectiveFrom: v.required('Effective from'),
    effectiveTo: v.optional(),
    notes: v.optional(),
  })
  .refine((d) => !d.effectiveTo || d.effectiveTo >= d.effectiveFrom, {
    message: 'Must be on or after effective from',
    path: ['effectiveTo'],
  });

/** Add a new rate period. Rates are append-only; the server closes the previous open rate. */
export default function RateFormModal({ open, onClose, vehicleType }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset({ ratePerKm: '', effectiveFrom: today(), effectiveTo: '', notes: '' });
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values) => post('/rates', { ...values, vehicleTypeId: vehicleType.id }),
    onSuccess: ({ rate, closedPrevious }) => {
      toast.success(
        `Rate ${formatINR(rate.ratePerKm)}/km added from ${formatDate(rate.effectiveFrom)}` +
          (closedPrevious
            ? `. Previous rate closed on ${formatDate(closedPrevious.effectiveTo)}.`
            : ''),
      );
      queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
      queryClient.invalidateQueries({ queryKey: ['rates'] });
      onClose();
    },
    onError: (err) => {
      applyServerErrors(err, setError);
      toast.error(err.message);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add rate — ${vehicleType?.name ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rate-form" loading={mutation.isPending}>
            Add rate
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Rates are never edited. A new open-ended rate automatically ends the current rate the day
          before it starts. Trips already recorded keep the rate they were calculated with.
        </p>
      </div>
      <form
        id="rate-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Rate per km (₹)" required error={errors.ratePerKm?.message}>
          {(p) => (
            <input {...p} inputMode="decimal" placeholder="18.00" {...register('ratePerKm')} />
          )}
        </Field>
        <div />
        <Field label="Effective from" required error={errors.effectiveFrom?.message}>
          {(p) => <input {...p} type="date" {...register('effectiveFrom')} />}
        </Field>
        <Field
          label="Effective to"
          error={errors.effectiveTo?.message}
          hint="Leave blank for open-ended"
        >
          {(p) => <input {...p} type="date" {...register('effectiveTo')} />}
        </Field>
        <Field label="Notes" className="sm:col-span-2" error={errors.notes?.message}>
          {(p) => (
            <input {...p} placeholder="e.g. Revised as per contract" {...register('notes')} />
          )}
        </Field>
      </form>
    </Modal>
  );
}
