import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import TemplateEditorModal from './TemplateEditorModal';

/** Import batch history (spec §42). */
export function ImportHistory() {
  const navigate = useNavigate();
  const { params, update } = useListParams();
  const companies = useOptions('companies', { includeInactive: true });
  const query = useQuery({
    queryKey: ['trip-imports', 'list', params],
    queryFn: () => get('/trip-imports', params),
    placeholderData: keepPreviousData,
  });
  const n = (v) => v.toLocaleString('en-IN');

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Toolbar>
        <FilterSelect
          label="Company"
          value={params.companyId}
          onChange={(v) => update({ companyId: v })}
          options={(companies.data ?? []).map(toSelect.companies)}
        />
        <FilterSelect
          label="Status"
          value={params.status}
          onChange={(v) => update({ status: v })}
          options={['VALIDATED', 'IMPORTED', 'DISCARDED', 'FAILED'].map((s) => ({
            value: s,
            label: s.charAt(0) + s.slice(1).toLowerCase(),
          }))}
        />
      </Toolbar>
      <DataTable
        rows={query.data?.items}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        onRowClick={(b) => navigate(`/imports/${b.id}`)}
        empty={<EmptyState title="No imports yet" />}
        columns={[
          { key: 'id', header: '#' },
          { key: 'createdAt', header: 'Uploaded', render: (b) => formatDateTime(b.createdAt) },
          { key: 'company', important: true, header: 'Company', render: (b) => b.company.name },
          { key: 'fileName', header: 'File', className: 'max-w-xs truncate' },
          { key: 'template', header: 'Template', render: (b) => b.template?.name ?? '—' },
          { key: 'totalRows', header: 'Rows', align: 'right', render: (b) => n(b.totalRows) },
          {
            key: 'importedRows',
            header: 'Imported',
            align: 'right',
            render: (b) => n(b.importedRows),
          },
          { key: 'errorRows', header: 'Errors', align: 'right', render: (b) => n(b.errorRows) },
          {
            key: 'duplicateRows',
            header: 'Duplicates',
            align: 'right',
            render: (b) => n(b.duplicateRows),
          },
          {
            key: 'status',
            important: true,
            header: 'Status',
            render: (b) => <StatusBadge status={b.status} />,
          },
          { key: 'uploadedBy', header: 'By', render: (b) => b.uploadedBy?.name ?? '—' },
        ]}
      />
      <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
    </div>
  );
}

/** Company templates (mapping, formats, duplicate key). */
export function TemplateList() {
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const query = useQuery({
    queryKey: ['import-templates', 'all'],
    queryFn: () => get('/import-templates', { includeInactive: 'true' }),
  });
  const columns = [
    { key: 'company', header: 'Company', render: (t) => t.company.name },
    { key: 'name', header: 'Template', className: 'font-medium text-slate-900' },
    { key: 'dateFormat', header: 'Date format' },
    {
      key: 'kmMode',
      header: 'KM',
      render: (t) => (t.kmMode === 'START_END' ? 'Start + End' : 'Total'),
    },
    {
      key: 'driverMatchField',
      header: 'Driver by',
      render: (t) => t.driverMatchField.toLowerCase(),
    },
    { key: 'duplicateKey', header: 'Duplicate key', render: (t) => t.duplicateKey.join(' + ') },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
  ];
  if (can(PERMISSIONS.TRIP_IMPORT)) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (t) => (
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(t)}>
          Edit
        </Button>
      ),
    });
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <DataTable
        rows={query.data}
        loading={query.isLoading}
        error={query.error}
        columns={columns}
        empty={
          <EmptyState
            title="No templates"
            description="Create one from the New import tab using a sample file."
          />
        }
      />
      <TemplateEditorModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        template={editing}
        companyId={editing?.companyId}
      />
    </div>
  );
}
