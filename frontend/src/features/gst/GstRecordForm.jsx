import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { applyServerErrors, get, post } from '../../lib/api';
import { formatINR, today } from '../../lib/format';
import { v } from '../../lib/forms';

const schema = z.object({
  direction: z.enum(['OUTWARD', 'INWARD']),
  companyId: v.optional(),
  counterpartyName: v.required('Party name'),
  counterpartyGstin: v.optionalMatch(
    /^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/,
    'Enter a valid GSTIN',
  ),
  invoiceNumber: v.required('Invoice number'),
  invoiceDate: v.required('Invoice date'),
  taxRateConfigId: v.optional(),
  hsnSac: v
    .optionalMatch(/^\d{4,8}$/, 'HSN/SAC must be 4–8 digits')
    .refine((s) => Boolean(s), 'HSN/SAC is required'),
  taxableValue: v.amount('Taxable value').refine((s) => Number(s) > 0, 'Must be greater than zero'),
  taxRate: v.amount('Rate').refine((s) => Number(s) <= 100, 'At most 100%'),
  cessRate: v.amount('Cess rate'),
  supplyType: z.enum(['INTRA_STATE', 'INTER_STATE']),
  placeOfSupply: v
    .optionalMatch(/^\d{2}$/, 'Use the 2-digit state code')
    .refine((s) => Boolean(s), 'Required'),
  reverseCharge: z.boolean(),
  notes: v.optional(),
});

const DEFAULTS = {
  direction: 'OUTWARD',
  companyId: '',
  counterpartyName: '',
  counterpartyGstin: '',
  invoiceNumber: '',
  invoiceDate: today(),
  taxRateConfigId: '',
  hsnSac: '',
  taxableValue: '',
  taxRate: '',
  cessRate: '0',
  supplyType: 'INTRA_STATE',
  placeOfSupply: '',
  reverseCharge: false,
  notes: '',
};

/** Record a GST invoice/purchase. Tax is computed and previewed by the server. */
export default function GstRecordForm({ open, onClose }) {
  const queryClient = useQueryClient();
  const companies = useOptions('companies', { enabled: open });
  const rates = useQuery({
    queryKey: ['gst', 'tax-rates'],
    queryFn: () => get('/gst/tax-rates'),
    enabled: open,
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const values = useWatch({ control });
  const clean = (vals) => ({
    ...vals,
    companyId: vals.companyId || undefined,
    taxRateConfigId: vals.taxRateConfigId || undefined,
  });
  const ready =
    values.taxableValue && values.taxRate !== '' && values.hsnSac && values.placeOfSupply;
  const preview = useQuery({
    queryKey: [
      'gst',
      'preview',
      values.taxableValue,
      values.taxRate,
      values.cessRate,
      values.supplyType,
    ],
    queryFn: () =>
      post(
        '/gst/records/preview',
        clean({
          ...DEFAULTS,
          ...values,
          counterpartyName: values.counterpartyName || 'x',
          invoiceNumber: values.invoiceNumber || 'x',
        }),
      ),
    enabled: Boolean(open && ready),
    retry: false,
  });

  const pickRate = (id) => {
    const r = rates.data?.find((x) => String(x.id) === id);
    if (r) {
      setValue('hsnSac', r.hsnSac);
      setValue('taxRate', r.gstRate);
      setValue('cessRate', r.cessRate);
    }
  };

  const save = useMutation({
    mutationFn: (vals) => post('/gst/records', clean(vals)),
    onSuccess: () => {
      toast.success('GST record saved');
      queryClient.invalidateQueries({ queryKey: ['gst'] });
      onClose();
    },
    onError: (err) => {
      if (!applyServerErrors(err, setError) || err.status === 409) toast.error(err.message);
    },
  });

  const text = (name, label, props = {}) => (
    <Field label={label} required={props.required} error={errors[name]?.message} hint={props.hint}>
      {(p) => (
        <input {...p} type={props.type ?? 'text'} inputMode={props.inputMode} {...register(name)} />
      )}
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New GST record"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="gst-form" loading={save.isPending}>
            Save record
          </Button>
        </>
      }
    >
      <form
        id="gst-form"
        noValidate
        onSubmit={handleSubmit((vals) => save.mutate(vals))}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Direction" required>
          {(p) => (
            <select {...p} {...register('direction')}>
              <option value="OUTWARD">Outward (LV tax invoice)</option>
              <option value="INWARD">Inward (purchase / expense)</option>
            </select>
          )}
        </Field>
        <Field label="Company (for outward invoices)">
          {(p) => (
            <select {...p} {...register('companyId')}>
              <option value="">—</option>
              {(companies.data ?? []).map(toSelect.companies).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {text('counterpartyName', 'Party name', { required: true })}
        {text('counterpartyGstin', 'Party GSTIN', { hint: 'Blank for unregistered (B2C)' })}
        {text('invoiceNumber', 'Invoice number', { required: true })}
        {text('invoiceDate', 'Invoice date', { type: 'date', required: true })}
        <Field label="Tax rate (from configuration)" hint="Fills HSN/SAC and rates">
          {(p) => (
            <select
              {...p}
              {...register('taxRateConfigId', { onChange: (e) => pickRate(e.target.value) })}
            >
              <option value="">—</option>
              {(rates.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.hsnSac} · {r.description} · {r.gstRate}%
                </option>
              ))}
            </select>
          )}
        </Field>
        {text('hsnSac', 'HSN/SAC', { required: true })}
        {text('taxableValue', 'Taxable value (₹)', { required: true, inputMode: 'decimal' })}
        {text('taxRate', 'GST rate %', { required: true, inputMode: 'decimal' })}
        {text('cessRate', 'Cess rate %', { inputMode: 'decimal' })}
        <Field label="Supply type" required>
          {(p) => (
            <select {...p} {...register('supplyType')}>
              <option value="INTRA_STATE">Intra-state (CGST + SGST)</option>
              <option value="INTER_STATE">Inter-state (IGST)</option>
            </select>
          )}
        </Field>
        {text('placeOfSupply', 'Place of supply (state code)', {
          required: true,
          hint: 'e.g. 29 for Karnataka',
        })}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" {...register('reverseCharge')} /> Reverse charge applies
        </label>
        <div className="rounded-md bg-slate-50 p-3 text-sm sm:col-span-2">
          {!ready ? (
            <span className="text-slate-500">
              Enter taxable value, rate, HSN/SAC and place of supply to see the tax.
            </span>
          ) : preview.data ? (
            <span className="tabular-nums">
              CGST {formatINR(preview.data.cgst)} · SGST {formatINR(preview.data.sgst)} · IGST{' '}
              {formatINR(preview.data.igst)} · Cess {formatINR(preview.data.cess)} →{' '}
              <strong>Invoice value {formatINR(preview.data.invoiceValue)}</strong>
            </span>
          ) : (
            <span className="text-slate-500">{preview.error?.message ?? 'Calculating…'}</span>
          )}
        </div>
      </form>
    </Modal>
  );
}
