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
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { STATUS_OPTIONS } from '../../lib/forms';
import VehicleFormModal from './VehicleFormModal';

const COLUMNS = [
  {
    key: 'registrationNumber',
    important: true,
    header: 'Registration',
    sortable: true,
  },
  { key: 'vehicleType', header: 'Type', render: (v) => v.vehicleType.name },
  {
    key: 'makeModel',
    header: 'Make / model',
    render: (v) => [v.make, v.model].filter(Boolean).join(' ') || '—',
  },
  { key: 'year', header: 'Year', sortable: true },
  {
    key: 'currentCompany',
    header: 'Current company',
    render: (v) => v.currentCompany?.name ?? '—',
  },
  {
    key: 'currentDriver',
    important: true,
    header: 'Current driver',
    render: (v) => v.currentDriver?.fullName ?? '—',
  },
  {
    key: 'status',
    important: true,
    header: 'Status',
    sortable: true,
    render: (v) => <StatusBadge status={v.status} />,
  },
];

export default function VehiclesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { params, update, toggleSort } = useListParams({ sortBy: 'registrationNumber' });
  const types = useOptions('vehicle-types', { includeInactive: true });
  const companies = useOptions('companies', { includeInactive: true });

  const query = useQuery({
    queryKey: ['vehicles', 'list', params],
    queryFn: () => get('/vehicles', params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Fleet, documents and current assignments"
        actions={
          can(PERMISSIONS.VEHICLE_MANAGE) && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New vehicle
            </Button>
          )
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Registration, make, model"
          />
          <FilterSelect
            label="Type"
            value={params.vehicleTypeId}
            onChange={(vehicleTypeId) => update({ vehicleTypeId })}
            options={(types.data ?? []).map(toSelect['vehicle-types'])}
          />
          <FilterSelect
            label="Company"
            value={params.companyId}
            onChange={(companyId) => update({ companyId })}
            options={(companies.data ?? []).map(toSelect.companies)}
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
          onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
          empty={<EmptyState title="No vehicles found" />}
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <VehicleFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(v) => navigate(`/vehicles/${v.id}`)}
      />
    </>
  );
}
