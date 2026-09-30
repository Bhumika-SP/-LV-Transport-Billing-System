import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import PageHeader from '../../components/PageHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { get } from '../../lib/api';
import { STATUS_OPTIONS } from '../../lib/forms';
import CompanyFormModal from './CompanyFormModal';

const COLUMNS = [
  { key: 'name', header: 'Company', sortable: true, className: 'font-medium text-slate-900' },
  { key: 'code', header: 'Code', sortable: true },
  { key: 'contactPerson', header: 'Contact' },
  { key: 'phone', header: 'Phone' },
  { key: 'gstin', header: 'GSTIN' },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (c) => <StatusBadge status={c.status} />,
  },
];

export default function CompaniesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { params, update, toggleSort } = useListParams({ sortBy: 'name' });

  const query = useQuery({
    queryKey: ['companies', 'list', params],
    queryFn: () => get('/companies', params),
    placeholderData: keepPreviousData,
  });

  const canManage = can(PERMISSIONS.COMPANY_MANAGE);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Corporate clients served by LV Transport"
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New company
            </Button>
          )
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Name, code, contact, GSTIN"
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(status) => update({ status })}
            options={STATUS_OPTIONS}
          />
        </Toolbar>
        <DataTable
          columns={COLUMNS}
          rows={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          sort={params}
          onSort={toggleSort}
          onRowClick={(c) => navigate(`/companies/${c.id}`)}
          empty={<EmptyState title="No companies found" />}
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <CompanyFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(c) => navigate(`/companies/${c.id}`)}
      />
    </>
  );
}
