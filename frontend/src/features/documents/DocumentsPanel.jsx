import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { inputClass } from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { api, del, get } from '../../lib/api';
import { formatDate } from '../../lib/format';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const CATEGORIES = {
  DRIVER: ['Driving licence', 'Aadhaar', 'PAN', 'Photo', 'Agreement'],
  VEHICLE: ['RC', 'Insurance', 'Fitness certificate', 'Permit', 'PUC'],
  COMPANY: ['Agreement', 'Purchase order', 'GST certificate'],
  EXPENSE: ['Bill', 'Receipt'],
  DRIVER_PAYMENT: ['Payment proof', 'Bank receipt'],
  COMPANY_SETTLEMENT: ['Statement', 'Remittance advice'],
  TRIP_IMPORT: ['Source file', 'Company statement'],
  GST_RECORD: ['Tax invoice', 'Purchase invoice', 'Credit note'],
};

const size = (b) =>
  b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const fileUrl = (id, inline) => `/api/documents/${id}/download${inline ? '?inline=1' : ''}`;

/**
 * Files attached to one record. Access mirrors the record: the API returns 403 when the
 * role may not view it, and `canManage` hides upload/delete for read-only roles.
 */
export default function DocumentsPanel({ entityType, entityId, canManage }) {
  const queryClient = useQueryClient();
  const key = ['documents', entityType, entityId];
  const fileRef = useRef(null);
  const [category, setCategory] = useState('');
  const [deleting, setDeleting] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => get('/documents', { entityType, entityId }),
  });

  const upload = useMutation({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('entityType', entityType);
      form.append('entityId', String(entityId));
      if (category.trim()) form.append('category', category.trim());
      form.append('file', file);
      return (await api.post('/documents', form, { timeout: 120_000 })).data.data;
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      setCategory('');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }) => del(`/documents/${id}`, { reason }),
    onSuccess: () => {
      toast.success('Document removed');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(err.message),
  });

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error('Files must be 10 MB or smaller');
    upload.mutate(file);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {canManage && (
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <input
            aria-label="Document category"
            list={`doc-cats-${entityType}`}
            placeholder="Category (optional)"
            maxLength={50}
            className={`${inputClass} sm:w-56`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id={`doc-cats-${entityType}`}>
            {(CATEGORIES[entityType] ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pick} />
          <Button icon={Upload} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            Upload file
          </Button>
          <span className="text-xs text-slate-500">PDF, JPEG, PNG or WEBP · up to 10 MB</span>
        </div>
      )}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No documents attached" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-800">{d.fileName}</div>
                <div className="text-xs text-slate-500">
                  {[d.category, size(d.sizeBytes), formatDate(d.createdAt), d.uploadedBy?.name]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <a
                href={fileUrl(d.id, true)}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={`View ${d.fileName}`}
              >
                <Eye className="h-4 w-4" />
              </a>
              <a
                href={fileUrl(d.id)}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={`Download ${d.fileName}`}
              >
                <Download className="h-4 w-4" />
              </a>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setDeleting(d)}
                  className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Remove ${d.fileName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Remove document"
        message={`Remove "${deleting?.fileName}"? It is hidden from this record but kept in the audit history.`}
        confirmLabel="Remove"
        requireReason
        loading={remove.isPending}
        onConfirm={(reason) => remove.mutate({ id: deleting.id, reason })}
      />
    </div>
  );
}

/** Paperclip button that opens a record's documents in a modal (for list rows). */
export function DocumentsButton({ entityType, entityId, title, canManage }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={Paperclip}
        aria-label="Documents"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={title ?? 'Documents'}>
        {open && (
          <DocumentsPanel entityType={entityType} entityId={entityId} canManage={canManage} />
        )}
      </Modal>
    </>
  );
}
