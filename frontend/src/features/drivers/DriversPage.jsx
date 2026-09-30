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
import { formatDate } from '../../lib/format';
import { STATUS_OPTIONS } from '../../lib/forms';
import DriverFormModal from './DriverFormModal';

const COLUMNS = [
  { key: 'driverCode', header: 'Code', sortable: true },
  { key: 'fullName', header: 'Name', sortable: true, className: 'font-medium text-slate-900' },
  { key: 'phone', header: 'Phone' },
  { key: 'licenseNumber', header: 'Licence' },
  {
    key: 'licenseExpiryDate',
    header: 'Licence expiry',
    sortable: true,
    render: (d) => formatDate(d.licenseExpiryDate),
  },
  {
    key: 'joiningDate',
    header: 'Joined',
    sortable: true,
    render: (d) => formatDate(d.joiningDate),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (d) => <StatusBadge status={d.status} />,
  },
];

export default function DriversPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { params, update, toggleSort } = useListParams({ sortBy: 'fullName' });

  const query = useQuery({
    queryKey: ['drivers', 'list', params],
    queryFn: () => get('/drivers', params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Drivers, their licences and payment details"
        actions={
          can(PERMISSIONS.DRIVER_MANAGE) && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New driver
            </Button>
          )
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Name, code, phone, licence"
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
          onRowClick={(d) => navigate(`/drivers/${d.id}`)}
          empty={<EmptyState title="No drivers found" />}
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <DriverFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(d) => navigate(`/drivers/${d.id}`)}
      />
    </>
  );
}
