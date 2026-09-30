import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { inputClass } from '../../components/ui/Field';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { api, get } from '../../lib/api';
import TemplateEditorModal from './TemplateEditorModal';

const Step = ({ n, title, children, disabled }) => (
  <Card className={disabled ? 'opacity-50' : ''}>
    <div className="flex gap-4 p-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  </Card>
);

async function upload(url, file, fields = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);
  return (await api.post(url, form, { timeout: 120_000 })).data.data;
}

/**
 * Upload → company → template (select or create with column mapping) → validate.
 * Validation produces a preview batch; nothing is imported until it is confirmed.
 */
export default function NewImport() {
  const navigate = useNavigate();
  const companies = useOptions('companies');
  const [companyId, setCompanyId] = useState('');
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [editor, setEditor] = useState(null); // { template? }

  const templates = useQuery({
    queryKey: ['import-templates', 'company', companyId],
    queryFn: () => get('/import-templates', { companyId }),
    enabled: Boolean(companyId),
  });
  const selected = templates.data?.find((t) => String(t.id) === templateId);
  const missingColumns =
    selected && inspection
      ? Object.values(selected.mappings).filter((c) => !inspection.headers.includes(c))
      : [];

  const inspect = useMutation({
    mutationFn: (f) => upload('/trip-imports/inspect', f),
    onSuccess: setInspection,
    onError: (err) => {
      setInspection(null);
      toast.error(err.message);
    },
  });

  const validate = useMutation({
    mutationFn: () => upload('/trip-imports', file, { companyId, templateId }),
    onSuccess: (batch) => {
      toast.success(`Validated ${batch.totalRows} rows`);
      navigate(`/imports/${batch.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const onFile = (f) => {
    setFile(f);
    setInspection(null);
    if (f) inspect.mutate(f);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Step n={1} title="Company and file">
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="Company"
            className={inputClass}
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setTemplateId('');
            }}
          >
            <option value="">Select company</option>
            {(companies.data ?? []).map(toSelect.companies).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className={`${inputClass} flex cursor-pointer items-center gap-2 text-slate-600`}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{file ? file.name : 'Choose .xlsx or .csv (max 5 MB)'}</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {inspect.isPending && <p className="mt-2 text-sm text-slate-500">Reading file…</p>}
        {inspection && (
          <div className="mt-3 text-sm text-slate-600">
            <p className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              {inspection.rowCount} data rows · {inspection.headers.length} columns
            </p>
            <div className="mt-2 overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {inspection.headers.map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspection.sampleRows.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-slate-100">
                      {inspection.headers.map((h) => (
                        <td key={h} className="px-2 py-1 whitespace-nowrap">
                          {r.values[h] == null ? '' : String(r.values[h])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Step>

      <Step n={2} title="Import template (column mapping)" disabled={!companyId || !inspection}>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Template"
            className={`${inputClass} sm:w-72`}
            value={templateId}
            disabled={!companyId || !inspection}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">
              {templates.data?.length ? 'Select template' : 'No templates yet'}
            </option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selected && (
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => setEditor({ template: selected })}
            >
              Edit mapping
            </Button>
          )}
          <Button
            variant="secondary"
            icon={Plus}
            disabled={!companyId || !inspection}
            onClick={() => setEditor({})}
          >
            New template from this file
          </Button>
        </div>
        {missingColumns.length > 0 && (
          <p className="mt-2 text-sm text-red-700">
            This file does not contain mapped column(s):{' '}
            {missingColumns.map((c) => `"${c}"`).join(', ')}. Edit the mapping or choose another
            template.
          </p>
        )}
      </Step>

      <Step n={3} title="Validate" disabled={!selected || missingColumns.length > 0}>
        <p className="mb-3 text-sm text-slate-600">
          Every row is checked (drivers, vehicles, dates, KM, rates, duplicates). You will see a
          preview before anything is imported.
        </p>
        <Button
          icon={FileSpreadsheet}
          disabled={!selected || missingColumns.length > 0 || !file}
          loading={validate.isPending}
          onClick={() => validate.mutate()}
        >
          Validate file
        </Button>
      </Step>

      <TemplateEditorModal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        companyId={Number(companyId)}
        template={editor?.template}
        headers={inspection?.headers}
        onSaved={(t) => setTemplateId(String(t.id))}
      />
    </div>
  );
}
