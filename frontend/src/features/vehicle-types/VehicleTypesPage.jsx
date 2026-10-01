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
import { formatDate, formatINR } from '../../lib/format';
import { STATUS_OPTIONS } from '../../lib/forms';
import VehicleTypeFormModal from './VehicleTypeFormModal';

const COLUMNS = [
  {
    key: 'name',
    important: true,
    header: 'Vehicle type',
    sortable: true,
  },
  { key: 'description', header: 'Description' },
  {
    key: 'currentRate',
    important: true,
    header: 'Current rate / km',
    align: 'right',
    render: (t) =>
      t.currentRate ? (
        formatINR(t.currentRate.ratePerKm)
      ) : (
        <span className="text-amber-700">No rate today</span>
      ),
  },
  {
    key: 'since',
    header: 'Since',
    render: (t) => (t.currentRate ? formatDate(t.currentRate.effectiveFrom) : '—'),
  },
  { key: 'vehicleCount', header: 'Vehicles', align: 'right' },
  {
    key: 'status',
    important: true,
    header: 'Status',
    sortable: true,
    render: (t) => <StatusBadge status={t.status} />,
  },
];

export default function VehicleTypesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { params, update, toggleSort } = useListParams({ sortBy: 'name' });

  const query = useQuery({
    queryKey: ['vehicle-types', 'list', params],
    queryFn: () => get('/vehicle-types', params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Vehicle Types"
        description="Trip earnings are calculated from the vehicle type's rate on the trip date"
        actions={
          can(PERMISSIONS.VEHICLE_MANAGE) && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New type
            </Button>
          )
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput value={params.search} onChange={(search) => update({ search })} />
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
          onRowClick={(t) => navigate(`/vehicle-types/${t.id}`)}
          empty={<EmptyState title="No vehicle types yet" />}
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <VehicleTypeFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(t) => navigate(`/vehicle-types/${t.id}`)}
      />
    </>
  );
}
