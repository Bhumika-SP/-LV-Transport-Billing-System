import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import DetailHeader from '../../components/DetailHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import Stat from '../../components/ui/Stat';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { get, post } from '../../lib/api';
import { formatDate, formatDateTime, formatINR, formatKm } from '../../lib/format';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const ROW_FILTERS = ['', 'VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'IMPORTED'];
const MESSAGE_CLASS = {
  error: 'text-red-700',
  duplicate: 'text-slate-600',
  warning: 'text-amber-700',
};

function Rows({ batch }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const headers = batch.templateSnapshot.sourceHeaders ?? [];
  const map = batch.templateSnapshot.mappings;
  const { data, isLoading, error } = useQuery({
    queryKey: ['trip-imports', batch.id, 'rows', status, page],
    queryFn: () =>
      get(`/trip-imports/${batch.id}/rows`, { status: status || undefined, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  const raw = (r, field) => (map[field] ? r.raw[map[field]] : null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2" role="tablist">
        {ROW_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded px-3 py-1 text-sm ${status === s ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All rows'}
          </button>
        ))}
      </div>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        error={error}
        empty={<EmptyState title="No rows" />}
        columns={[
          { key: 'rowNumber', header: 'Row' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'trip',
            header: 'Trip',
            render: (r) =>
              r.normalized ? (
                <span>
                  {formatDate(r.normalized.tripDate)} · {String(raw(r, 'vehicle') ?? '')} ·{' '}
                  {String(raw(r, 'driver') ?? '')}
                </span>
              ) : (
                <span className="text-slate-500">
                  {headers
                    .slice(0, 4)
                    .map((h) => r.raw[h])
                    .filter((v) => v !== null && v !== '')
                    .join(' · ')}
                </span>
              ),
          },
          {
            key: 'km',
            header: 'KM',
            align: 'right',
            render: (r) => (r.normalized ? formatKm(r.normalized.totalKm) : '—'),
          },
          {
            key: 'earnings',
            header: 'Earnings',
            align: 'right',
            render: (r) => (r.normalized ? formatINR(r.normalized.earnings) : '—'),
          },
          {
            key: 'messages',
            header: 'Problems / notes',
            className: 'whitespace-normal min-w-64',
            render: (r) =>
              r.tripId ? (
                <Link className="text-brand-700 hover:underline" to={`/trips/${r.tripId}`}>
                  Trip #{r.tripId}
                </Link>
              ) : (
                <ul className="space-y-0.5">
                  {r.messages.map((m, i) => (
                    <li key={i} className={MESSAGE_CLASS[m.level]}>
                      {m.message}
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <Pagination meta={data?.meta} onPageChange={setPage} />
    </div>
  );
}

export default function ImportBatchPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [discarding, setDiscarding] = useState(false);

  const {
    data: batch,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trip-imports', id],
    queryFn: () => get(`/trip-imports/${id}`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['trip-imports'] });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
  };
  const confirm = useMutation({
    mutationFn: () => post(`/trip-imports/${id}/confirm`, { includeWarnings }),
    onSuccess: (b) => {
      toast.success(`${b.importedRows} trips imported`);
      refresh();
      setConfirming(false);
    },
    onError: (err) => {
      toast.error(err.message);
      refresh();
      setConfirming(false);
    },
  });
  const discard = useMutation({
    mutationFn: () => post(`/trip-imports/${id}/discard`),
    onSuccess: () => {
      toast.success('Import discarded');
      refresh();
      setDiscarding(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const pending = batch.status === 'VALIDATED';
  const importable = batch.validRows + (includeWarnings ? batch.warningRows : 0);
  const problems = batch.errorRows + batch.duplicateRows;

  return (
    <>
      <DetailHeader
        backTo="/imports?tab=history"
        backLabel="Import history"
        title={`Import #${batch.id} · ${batch.fileName}`}
        status={batch.status}
        subtitle={`${batch.company.name} · template "${batch.template?.name ?? batch.templateSnapshot.name}" · uploaded ${formatDateTime(batch.createdAt)} by ${batch.uploadedBy?.name ?? '—'}`}
        actions={
          <>
            {problems > 0 && (
              <a
                href={`${API_BASE}/trip-imports/${id}/errors.csv?includeWarnings=true`}
                download
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> Download problems (CSV)
              </a>
            )}
            {pending && can(PERMISSIONS.TRIP_IMPORT) && (
              <>
                <Button variant="secondary" icon={Trash2} onClick={() => setDiscarding(true)}>
                  Discard
                </Button>
                <Button
                  icon={CheckCircle2}
                  onClick={() => setConfirming(true)}
                  disabled={batch.validRows + batch.warningRows === 0}
                >
                  Import trips
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total rows" value={batch.totalRows} />
        <Stat label="Valid" value={batch.validRows} tone="positive" />
        <Stat label="Warnings" value={batch.warningRows} tone="warning" />
        <Stat label="Errors" value={batch.errorRows} tone={batch.errorRows ? 'warning' : 'muted'} />
        <Stat label="Duplicates" value={batch.duplicateRows} tone="muted" />
        <Stat
          label="Imported"
          value={batch.importedRows}
          tone={batch.importedRows ? 'positive' : 'muted'}
        />
      </div>
      {batch.status === 'FAILED' && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          The import failed and was rolled back — no trips were created. {batch.errorDetails}
        </p>
      )}
      {pending && problems > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Rows with errors or duplicates are never imported. Download the problems file, correct the
          source file and upload it again.
        </p>
      )}

      <Rows batch={batch} />

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Import trips"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              loading={confirm.isPending}
              disabled={importable === 0}
              onClick={() => confirm.mutate()}
            >
              Import {importable} trips
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Rows are re-checked against current data, then all importable rows are saved together in
          one transaction. If anything fails, nothing is saved.
        </p>
        {batch.warningRows > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeWarnings}
              onChange={(e) => setIncludeWarnings(e.target.checked)}
            />
            Include {batch.warningRows} row(s) with warnings
          </label>
        )}
      </Modal>
      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Discard import"
        message="The validation results are kept in history, but no trips will be imported from this file."
        confirmLabel="Discard"
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </>
  );
}
