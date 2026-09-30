import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import Stat from '../../components/ui/Stat';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatDate, formatINR, formatKm } from '../../lib/format';
import TripFormModal from './TripFormModal';

const FILTER_KEYS = [
  'search',
  'companyId',
  'driverId',
  'vehicleId',
  'status',
  'source',
  'month',
  'fromDate',
  'toDate',
];

/**
 * Trip list with totals and filters. `fixed` pins filters (e.g. { companyId }) for use
 * inside company / driver / vehicle detail tabs.
 */
export default function TripTable({ fixed = {} }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { params, update, toggleSort } = useListParams({ sortBy: 'tripDate', sortDir: 'desc' });
  const companies = useOptions('companies', { includeInactive: true, enabled: !fixed.companyId });
  const drivers = useOptions('drivers', { includeInactive: true, enabled: !fixed.driverId });
  const vehicles = useOptions('vehicles', { includeInactive: true, enabled: !fixed.vehicleId });

  const query_ = { ...params, ...fixed };
  const filters = Object.fromEntries(
    FILTER_KEYS.filter((k) => query_[k]).map((k) => [k, query_[k]]),
  );

  const list = useQuery({
    queryKey: ['trips', 'list', query_],
    queryFn: () => get('/trips', query_),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['trips', 'summary', filters],
    queryFn: () => get('/trips/summary', filters),
    placeholderData: keepPreviousData,
  });

  const columns = [
    { key: 'tripDate', header: 'Date', sortable: true, render: (t) => formatDate(t.tripDate) },
    ...(fixed.companyId
      ? []
      : [{ key: 'company', header: 'Company', render: (t) => t.company.name }]),
    ...(fixed.driverId
      ? []
      : [{ key: 'driver', header: 'Driver', render: (t) => t.driver.fullName }]),
    ...(fixed.vehicleId
      ? []
      : [{ key: 'vehicle', header: 'Vehicle', render: (t) => t.vehicle.registrationNumber }]),
    {
      key: 'externalTripId',
      header: 'Trip ID',
      render: (t) => t.externalTripId ?? t.tripReference ?? '—',
    },
    {
      key: 'route',
      header: 'Pickup → Drop',
      className: 'max-w-xs truncate',
      render: (t) =>
        t.pickup || t.dropLocation ? `${t.pickup ?? '?'} → ${t.dropLocation ?? '?'}` : '—',
    },
    {
      key: 'totalKm',
      header: 'KM',
      align: 'right',
      sortable: true,
      render: (t) => formatKm(t.totalKm),
    },
    { key: 'ratePerKm', header: 'Rate', align: 'right', render: (t) => formatINR(t.ratePerKm) },
    {
      key: 'earnings',
      header: 'Earnings',
      align: 'right',
      sortable: true,
      render: (t) => (
        <span className={t.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'font-medium'}>
          {formatINR(t.earnings)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) =>
        t.status === 'CANCELLED' ? (
          <StatusBadge status="CANCELLED" />
        ) : (
          <Badge tone={t.source === 'IMPORT' ? 'blue' : 'gray'}>
            {t.source === 'IMPORT' ? 'Imported' : 'Manual'}
          </Badge>
        ),
    },
  ];

  const s = summary.data;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Trips (active)" value={s ? s.tripCount.toLocaleString('en-IN') : '—'} />
        <Stat label="Total KM" value={s ? formatKm(s.totalKm) : '—'} />
        <Stat
          label="Trip earnings"
          value={formatINR(s?.totalEarnings)}
          tone="positive"
          hint="Cancelled trips excluded"
        />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Trip ID, reference, pickup, drop"
          />
          {!fixed.companyId && (
            <FilterSelect
              label="Company"
              value={params.companyId}
              onChange={(v) => update({ companyId: v })}
              options={(companies.data ?? []).map(toSelect.companies)}
            />
          )}
          {!fixed.driverId && (
            <FilterSelect
              label="Driver"
              value={params.driverId}
              onChange={(v) => update({ driverId: v })}
              options={(drivers.data ?? []).map(toSelect.drivers)}
            />
          )}
          {!fixed.vehicleId && (
            <FilterSelect
              label="Vehicle"
              value={params.vehicleId}
              onChange={(v) => update({ vehicleId: v })}
              options={(vehicles.data ?? []).map(toSelect.vehicles)}
            />
          )}
          <input
            type="month"
            aria-label="Month"
            className={`${inputClass} w-full sm:w-40`}
            value={params.month ?? ''}
            onChange={(e) =>
              update({ month: e.target.value || undefined, fromDate: undefined, toDate: undefined })
            }
          />
          <input
            type="date"
            aria-label="From date"
            className={`${inputClass} w-full sm:w-40`}
            value={params.fromDate ?? ''}
            onChange={(e) => update({ fromDate: e.target.value || undefined, month: undefined })}
          />
          <input
            type="date"
            aria-label="To date"
            className={`${inputClass} w-full sm:w-40`}
            value={params.toDate ?? ''}
            onChange={(e) => update({ toDate: e.target.value || undefined, month: undefined })}
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(v) => update({ status: v })}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />
          <FilterSelect
            label="Source"
            value={params.source}
            onChange={(v) => update({ source: v })}
            options={[
              { value: 'MANUAL', label: 'Manual' },
              { value: 'IMPORT', label: 'Imported' },
            ]}
          />
          {can(PERMISSIONS.TRIP_MANAGE) && (
            <Button className="sm:ml-auto" icon={Plus} onClick={() => setCreating(true)}>
              New trip
            </Button>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          loading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={params}
          onSort={toggleSort}
          onRowClick={(t) => navigate(`/trips/${t.id}`)}
          empty={<EmptyState title="No trips found" />}
        />
        <Pagination meta={list.data?.meta} onPageChange={(page) => update({ page })} />
      </div>
      <TripFormModal
        open={creating}
        onClose={() => setCreating(false)}
        defaults={Object.fromEntries(Object.entries(fixed).map(([k, v]) => [k, String(v)]))}
      />
    </>
  );
}
