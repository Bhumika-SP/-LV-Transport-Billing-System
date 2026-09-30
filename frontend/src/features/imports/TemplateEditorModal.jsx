import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Button from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { get, patch, post } from '../../lib/api';

/** Common header names per field, used only to pre-fill the mapping. */
const SYNONYMS = {
  driver: ['driver', 'driver name', 'driver code', 'driver id', 'chauffeur'],
  vehicle: [
    'vehicle',
    'vehicle no',
    'vehicle number',
    'cab',
    'cab no',
    'registration',
    'reg no',
    'vehicle reg',
  ],
  tripDate: ['trip date', 'date', 'travel date', 'duty date'],
  externalTripId: ['trip id', 'trip no', 'booking id', 'duty id', 'trip number'],
  tripReference: ['reference', 'ref', 'trip reference', 'route'],
  pickup: ['pickup', 'pick up', 'start location', 'from', 'source'],
  dropLocation: ['drop', 'drop location', 'end location', 'to', 'destination'],
  startKm: ['start km', 'opening km', 'start odometer', 'open km'],
  endKm: ['end km', 'closing km', 'end odometer', 'close km'],
  totalKm: ['total km', 'km', 'kms', 'distance', 'total kms'],
  notes: ['notes', 'remarks', 'comments'],
};
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function suggestMappings(headers) {
  const out = {};
  for (const [field, names] of Object.entries(SYNONYMS)) {
    const hit = headers.find((h) => names.includes(norm(h)));
    if (hit && !Object.values(out).includes(hit)) out[field] = hit;
  }
  return out;
}

const DRIVER_MATCH_LABELS = {
  CODE: 'Driver code (e.g. DRV-0001)',
  LICENSE: 'Licence number',
  PHONE: 'Phone number',
  NAME: 'Full name (must be unique)',
};

/**
 * Create or edit a company import template: column mapping, date format, KM method,
 * driver matching and the configurable duplicate key. With `headers` (from an
 * inspected file) columns are chosen from a list; otherwise typed.
 */
export default function TemplateEditorModal({
  open,
  onClose,
  companyId,
  template,
  headers,
  onSaved,
}) {
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({
    queryKey: ['import-templates', 'meta'],
    queryFn: () => get('/import-templates/meta'),
  });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);

  const initial = useMemo(() => {
    if (template) return { ...template, mappings: { ...template.mappings } };
    const mappings = headers ? suggestMappings(headers) : {};
    return {
      name: '',
      dateFormat: 'DD/MM/YYYY',
      kmMode: mappings.startKm && mappings.endKm ? 'START_END' : 'DIRECT',
      driverMatchField: 'CODE',
      duplicateKey: mappings.externalTripId
        ? ['externalTripId']
        : ['tripDate', 'vehicle', 'driver', 'tripReference'].filter(
            (f) => f !== 'tripReference' || mappings.tripReference,
          ),
      keepUnmapped: true,
      mappings,
    };
  }, [template, headers]);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors([]);
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (body) =>
      template
        ? patch(`/import-templates/${template.id}`, body)
        : post('/import-templates', { ...body, companyId }),
    onSuccess: (t) => {
      toast.success(template ? 'Template updated' : 'Template created');
      queryClient.invalidateQueries({ queryKey: ['import-templates'] });
      onSaved?.(t);
      onClose();
    },
    onError: (err) => {
      setErrors(err.details?.map((d) => d.message) ?? [err.message]);
      toast.error(err.message);
    },
  });

  if (!open || !form || !meta) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setMapping = (field, col) =>
    setForm((f) => ({ ...f, mappings: { ...f.mappings, [field]: col || undefined } }));
  const toggleKey = (field) =>
    setForm((f) => ({
      ...f,
      duplicateKey: f.duplicateKey.includes(field)
        ? f.duplicateKey.filter((x) => x !== field)
        : [...f.duplicateKey, field],
    }));
  const isRequired = (fld) => fld.required || fld.requiredFor === form.kmMode;
  const relevant = meta.targetFields.filter((f) => !f.requiredFor || f.requiredFor === form.kmMode);

  const submit = () => {
    const mappings = Object.fromEntries(
      relevant.map((f) => [f.key, form.mappings[f.key] || undefined]),
    );
    save.mutate({
      name: form.name,
      dateFormat: form.dateFormat,
      kmMode: form.kmMode,
      driverMatchField: form.driverMatchField,
      duplicateKey: form.duplicateKey,
      keepUnmapped: form.keepUnmapped,
      mappings,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={template ? `Edit template — ${template.name}` : 'New import template'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save template
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {errors.length > 0 && (
          <ul role="alert" className="list-disc rounded-md bg-red-50 py-2 pr-3 pl-7 text-red-700">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Template name *</span>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Infosys monthly sheet"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Date format in the file *</span>
            <select
              className={inputClass}
              value={form.dateFormat}
              onChange={(e) => set('dateFormat', e.target.value)}
            >
              {meta.dateFormats.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-1 font-medium text-slate-700">How is KM given? *</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.kmMode === 'START_END'}
                  onChange={() => set('kmMode', 'START_END')}
                />{' '}
                Start + End KM
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={form.kmMode === 'DIRECT'}
                  onChange={() => set('kmMode', 'DIRECT')}
                />{' '}
                Total KM
              </label>
            </div>
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium text-slate-700">Driver column contains *</span>
            <select
              className={inputClass}
              value={form.driverMatchField}
              onChange={(e) => set('driverMatchField', e.target.value)}
            >
              {meta.driverMatchFields.map((f) => (
                <option key={f} value={f}>
                  {DRIVER_MATCH_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <h3 className="mb-2 font-medium text-slate-700">Column mapping</h3>
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">System field</th>
                  <th className="px-3 py-2 text-left">Column in the file</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relevant.map((f) => (
                  <tr key={f.key}>
                    <td className="px-3 py-2">
                      {f.label}
                      {isRequired(f) && <span className="ml-0.5 text-red-600">*</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {headers ? (
                        <select
                          aria-label={`Column for ${f.label}`}
                          className={inputClass}
                          value={form.mappings[f.key] ?? ''}
                          onChange={(e) => setMapping(f.key, e.target.value)}
                        >
                          <option value="">— not in file —</option>
                          {headers.map((h) => (
                            <option key={h}>{h}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label={`Column for ${f.label}`}
                          className={inputClass}
                          value={form.mappings[f.key] ?? ''}
                          onChange={(e) => setMapping(f.key, e.target.value)}
                          placeholder="Exact header text"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 font-medium text-slate-700">Duplicate detection key *</legend>
          <p className="mb-2 text-xs text-slate-500">
            A row is a duplicate when these fields (within this company) match an existing trip or
            an earlier row. Prefer External trip ID when the company provides one.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {meta.duplicateKeyFields.map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.duplicateKey.includes(k)}
                  onChange={() => toggleKey(k)}
                />
                {meta.targetFields.find((f) => f.key === k)?.label ?? k}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.keepUnmapped}
            onChange={(e) => set('keepUnmapped', e.target.checked)}
          />
          Keep other columns with the trip (as extra details)
        </label>
      </div>
    </Modal>
  );
}
