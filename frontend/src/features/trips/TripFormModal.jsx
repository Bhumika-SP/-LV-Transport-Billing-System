import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { applyServerErrors, patch, post } from '../../lib/api';
import { formatDate, formatINR, formatKm, today } from '../../lib/format';
import { v } from '../../lib/forms';

const km = (label) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (s) => !s || /^\d{1,10}(\.\d{1,2})?$/.test(s),
      `${label} must be a non-negative number`,
    );

const schema = z
  .object({
    companyId: v.required('Company'),
    vehicleId: v.required('Vehicle'),
    driverId: v.required('Driver'),
    tripDate: v.required('Trip date').refine((d) => d <= today(), 'Cannot be in the future'),
    externalTripId: v.optional(),
    tripReference: v.optional(),
    pickup: v.optional(),
    dropLocation: v.optional(),
    kmSource: z.enum(['START_END', 'DIRECT']),
    startKm: km('Start KM'),
    endKm: km('End KM'),
    totalKm: km('Total KM'),
    notes: v.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kmSource === 'START_END') {
      if (!d.startKm)
        ctx.addIssue({ code: 'custom', path: ['startKm'], message: 'Start KM is required' });
      if (!d.endKm)
        ctx.addIssue({ code: 'custom', path: ['endKm'], message: 'End KM is required' });
      if (d.startKm && d.endKm && Number(d.endKm) < Number(d.startKm)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endKm'],
          message: 'End KM cannot be less than Start KM',
        });
      }
    } else if (!d.totalKm) {
      ctx.addIssue({ code: 'custom', path: ['totalKm'], message: 'Total KM is required' });
    }
  });

const EMPTY = {
  companyId: '',
  vehicleId: '',
  driverId: '',
  tripDate: '',
  externalTripId: '',
  tripReference: '',
  pickup: '',
  dropLocation: '',
  kmSource: 'START_END',
  startKm: '',
  endKm: '',
  totalKm: '',
  notes: '',
};

function toValues(trip, defaults) {
  if (!trip) return { ...EMPTY, tripDate: today(), ...defaults };
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) out[k] = trip[k] == null ? '' : String(trip[k]);
  if (trip.kmSource === 'DIRECT') out.totalKm = trip.totalKm;
  return out;
}

/** Only fields relevant to the chosen KM method are sent. */
function toPayload(values) {
  const base = { ...values };
  if (values.kmSource === 'START_END') delete base.totalKm;
  else {
    base.startKm = null;
    base.endKm = null;
  }
  return base;
}

function useDebounced(value, ms = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Server-side calculation preview. The formula lives only on the backend; the form
 * shows exactly what the API will store.
 */
function CalculationPreview({ values, enabled }) {
  const payload = useDebounced(toPayload(values));
  const ready =
    enabled &&
    payload.companyId &&
    payload.vehicleId &&
    payload.driverId &&
    payload.tripDate &&
    (payload.kmSource === 'DIRECT' ? payload.totalKm : payload.startKm && payload.endKm);

  const { data, error, isFetching } = useQuery({
    queryKey: ['trips', 'preview', payload],
    queryFn: () => post('/trips/preview', payload),
    enabled: Boolean(ready),
    retry: false,
  });

  if (!ready) {
    return <p className="text-sm text-slate-500">Fill in the trip to see the calculation.</p>;
  }
  if (error) {
    return (
      <p className="flex items-start gap-2 text-sm text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {error.message}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-slate-500">{isFetching ? 'Calculating…' : ''}</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700 tabular-nums">
        {formatKm(data.totalKm)} km × {formatINR(data.rate.ratePerKm)}/km{' '}
        <span className="text-slate-500">
          ({data.vehicleType.name} rate from {formatDate(data.rate.effectiveFrom)})
        </span>{' '}
        = <span className="text-base font-semibold text-slate-900">{formatINR(data.earnings)}</span>
      </p>
      {data.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {w}
        </p>
      ))}
    </div>
  );
}

/** Create (trip = null) or edit a manual trip. `defaults` pre-fills company/driver/vehicle. */
export default function TripFormModal({ open, onClose, trip, defaults, onSaved }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(trip);
  const companies = useOptions('companies', { enabled: open });
  const vehicles = useOptions('vehicles', { enabled: open });
  const drivers = useOptions('drivers', { enabled: open });

  const initial = useMemo(() => toValues(trip, defaults), [trip, defaults]);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: initial });

  useEffect(() => {
    if (open) reset(initial);
  }, [open, initial, reset]);

  const values = useWatch({ control });

  const mutation = useMutation({
    mutationFn: (vals) =>
      isEdit ? patch(`/trips/${trip.id}`, toPayload(vals)) : post('/trips', toPayload(vals)),
    onSuccess: ({ trip: saved, warnings }) => {
      toast.success(`Trip saved · earnings ${formatINR(saved.earnings)}`);
      warnings.forEach((w) => toast.warning(w));
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => {
      if (!applyServerErrors(err, setError) || err.status >= 409) toast.error(err.message);
    },
  });

  const select = (name, label, opts, map) => (
    <Field label={label} required error={errors[name]?.message}>
      {(p) => (
        <select {...p} {...register(name)}>
          <option value="">Select {label.toLowerCase()}</option>
          {(opts.data ?? []).map(map).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  const text = (name, label, props = {}) => (
    <Field label={label} required={props.required} error={errors[name]?.message} hint={props.hint}>
      {(p) => (
        <input
          {...p}
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          max={props.max}
          {...register(name)}
        />
      )}
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit trip #${trip.id}` : 'New trip'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="trip-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Save trip'}
          </Button>
        </>
      }
    >
      <form
        id="trip-form"
        onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
        noValidate
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {select('companyId', 'Company', companies, toSelect.companies)}
          {text('tripDate', 'Trip date', { type: 'date', required: true, max: today() })}
          {select('vehicleId', 'Vehicle', vehicles, toSelect.vehicles)}
          {select('driverId', 'Driver', drivers, toSelect.drivers)}
          {text('externalTripId', 'External trip ID', {
            hint: "Company's own trip ID (unique per company)",
          })}
          {text('tripReference', 'Trip reference')}
          {text('pickup', 'Pickup')}
          {text('dropLocation', 'Drop')}
        </div>

        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Distance</legend>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="START_END" {...register('kmSource')} /> Start KM + End KM
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="DIRECT" {...register('kmSource')} /> Total KM
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {values.kmSource === 'START_END' ? (
              <>
                {text('startKm', 'Start KM (odometer)', { required: true, inputMode: 'decimal' })}
                {text('endKm', 'End KM (odometer)', { required: true, inputMode: 'decimal' })}
              </>
            ) : (
              text('totalKm', 'Total KM', { required: true, inputMode: 'decimal' })
            )}
          </div>
        </fieldset>

        <div className="rounded-md bg-slate-50 p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Calculator className="h-4 w-4" aria-hidden="true" /> Trip earnings
          </div>
          <CalculationPreview values={values} enabled={open} />
          {isEdit && (
            <p className="mt-2 text-xs text-slate-500">
              The stored rate ({formatINR(trip.ratePerKm)}/km) is kept unless you change the trip
              date or vehicle.
            </p>
          )}
        </div>

        <Field label="Notes" error={errors.notes?.message}>
          {(p) => <textarea {...p} rows={2} {...register('notes')} />}
        </Field>
      </form>
    </Modal>
  );
}
