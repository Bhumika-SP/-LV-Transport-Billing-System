import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Eye,
  FileText,
  HandCoins,
  Link2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Route,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import PageHeader from '../../components/PageHeader';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import { inputClass } from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import RowMenu from '../../components/ui/RowMenu';
import { EmptyState } from '../../components/ui/States';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { get, patch } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { formatDate, today } from '../../lib/format';
import { STATUS_OPTIONS } from '../../lib/forms';
import DriverFormModal from './DriverFormModal';

const LICENCE_OPTIONS = [
  { value: 'valid', label: 'Valid' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'none', label: 'Not recorded' },
];

const ASSIGNED_OPTIONS = [
  { value: 'yes', label: 'Assigned' },
  { value: 'no', label: 'Not assigned' },
];

/** Whole days from today to a "YYYY-MM-DD" date (negative once past). */
function daysUntil(date) {
  const ms =
    Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Licence expiry with a text status, so the state never relies on colour alone. */
function LicenceExpiry({ date }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = daysUntil(date);
  const [tone, text] =
    days < 0
      ? ['red', `Expired · ${-days} day${days === -1 ? '' : 's'} ago`]
      : days <= 30
        ? ['amber', `Expiring soon · ${days} day${days === 1 ? '' : 's'}`]
        : ['green', `Valid · ${days} days`];
  return (
    <div className="leading-tight">
      <div>{formatDate(date)}</div>
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}

const CSV_COLUMNS = [
  ['Code', (d) => d.driverCode],
  ['Name', (d) => d.fullName],
  ['Phone', (d) => d.phone],
  ['Licence', (d) => d.licenseNumber],
  ['Licence expiry', (d) => d.licenseExpiryDate?.slice(0, 10)],
  ['Assigned vehicle', (d) => d.currentVehicle?.registrationNumber],
  ['Joined', (d) => d.joiningDate?.slice(0, 10)],
  ['Status', (d) => d.status],
];

export default function DriversPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = can(PERMISSIONS.DRIVER_MANAGE);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const [deactivating, setDeactivating] = useState(null);
  const { params, update, toggleSort } = useListParams({ sortBy: 'fullName' });

  const query = useQuery({
    queryKey: ['drivers', 'list', params],
    queryFn: () => get('/drivers', params),
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => patch(`/drivers/${id}`, { status }),
    onSuccess: (_, { status }) => {
      toast.success(`Driver ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      setDeactivating(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const filtersActive = [
    'search',
    'status',
    'licenceStatus',
    'assigned',
    'joinedFrom',
    'joinedTo',
  ].some((k) => params[k]);
  const resetFilters = () =>
    update({
      search: undefined,
      status: undefined,
      licenceStatus: undefined,
      assigned: undefined,
      joinedFrom: undefined,
      joinedTo: undefined,
    });

  const exportCsv = () => {
    const rows = query.data?.items ?? [];
    const chosen = selection.size ? rows.filter((d) => selection.has(d.id)) : rows;
    downloadCsv('drivers.csv', CSV_COLUMNS, chosen);
  };

  const columns = [
    {
      key: 'driverCode',
      header: 'Code',
      sortable: true,
      render: (d) => <span className="text-xs text-slate-500">{d.driverCode}</span>,
    },
    {
      key: 'fullName',
      important: true,
      header: 'Name',
      sortable: true,
      render: (d) => (
        <Link
          to={`/drivers/${d.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {d.fullName}
        </Link>
      ),
    },
    { key: 'phone', header: 'Phone' },
    { key: 'licenseNumber', header: 'Licence no.' },
    {
      key: 'licenseExpiryDate',
      header: 'Licence expiry',
      sortable: true,
      render: (d) => <LicenceExpiry date={d.licenseExpiryDate} />,
    },
    {
      key: 'currentVehicle',
      important: true,
      header: 'Assigned vehicle',
      render: (d) =>
        d.currentVehicle ? (
          <Link
            to={`/vehicles/${d.currentVehicle.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-brand-700 hover:underline"
          >
            {d.currentVehicle.registrationNumber}
          </Link>
        ) : (
          <span className="text-slate-400">Not assigned</span>
        ),
    },
    {
      key: 'joiningDate',
      header: 'Joined',
      sortable: true,
      render: (d) => formatDate(d.joiningDate),
    },
    {
      key: 'status',
      important: true,
      header: 'Status',
      sortable: true,
      render: (d) => <StatusBadge status={d.status} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (d) => (
        <RowMenu
          label={`Actions for ${d.fullName}`}
          items={[
            { label: 'View driver', icon: Eye, onClick: () => navigate(`/drivers/${d.id}`) },
            {
              label: 'Edit driver',
              icon: Pencil,
              hidden: !canManage,
              onClick: () => navigate(`/drivers/${d.id}`),
            },
            {
              label: 'Assign vehicle',
              icon: Link2,
              hidden: !can(PERMISSIONS.MASTER_VIEW),
              onClick: () => navigate('/assignments'),
            },
            {
              label: 'View trips',
              icon: Route,
              onClick: () => navigate(`/drivers/${d.id}?tab=trips`),
            },
            {
              label: 'View earnings',
              icon: HandCoins,
              hidden: !can(PERMISSIONS.DRIVER_FINANCE_VIEW),
              onClick: () => navigate(`/drivers/${d.id}?tab=earnings`),
            },
            {
              label: 'View documents',
              icon: FileText,
              onClick: () => navigate(`/drivers/${d.id}?tab=documents`),
            },
            {
              label: d.status === 'ACTIVE' ? 'Deactivate' : 'Activate',
              icon: Power,
              danger: d.status === 'ACTIVE',
              hidden: !canManage,
              onClick: () => setDeactivating(d),
            },
          ]}
        />
      ),
    },
  ];

  const activating = deactivating?.status !== 'ACTIVE';

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Manage drivers, licences, documents and payment details"
        actions={
          <>
            <Button
              variant="secondary"
              icon={Download}
              onClick={exportCsv}
              disabled={!query.data?.items?.length}
            >
              {selection.size ? `Export selected (${selection.size})` : 'Export'}
            </Button>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => query.refetch()}
              aria-label="Refresh"
              title="Refresh"
            />
            {canManage && (
              <Button icon={Plus} onClick={() => setCreating(true)}>
                New driver
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Search by name, code, phone or licence…"
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(status) => update({ status })}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Licence"
            value={params.licenceStatus}
            onChange={(licenceStatus) => update({ licenceStatus })}
            options={LICENCE_OPTIONS}
          />
          <FilterSelect
            label="Vehicle"
            value={params.assigned}
            onChange={(assigned) => update({ assigned })}
            options={ASSIGNED_OPTIONS}
          />
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            Joined
            <input
              type="date"
              aria-label="Joined from"
              className={`${inputClass} w-auto`}
              value={params.joinedFrom ?? ''}
              onChange={(e) => update({ joinedFrom: e.target.value })}
            />
            –
            <input
              type="date"
              aria-label="Joined to"
              className={`${inputClass} w-auto`}
              value={params.joinedTo ?? ''}
              onChange={(e) => update({ joinedTo: e.target.value })}
            />
          </label>
          {filtersActive && (
            <Button variant="ghost" icon={X} onClick={resetFilters}>
              Reset
            </Button>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          sort={params}
          onSort={toggleSort}
          onRowClick={(d) => navigate(`/drivers/${d.id}`)}
          selection={selection}
          onSelectionChange={setSelection}
          empty={
            <EmptyState
              title={filtersActive ? 'No drivers match these filters' : 'No drivers yet'}
              description={filtersActive ? 'Try changing or resetting the filters.' : undefined}
            />
          }
        />
        <Pagination
          meta={query.data?.meta}
          onPageChange={(page) => update({ page })}
          onPageSizeChange={(pageSize) => update({ pageSize })}
          noun="drivers"
        />
      </div>
      <DriverFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(d) => navigate(`/drivers/${d.id}`)}
      />
      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        title={`${activating ? 'Activate' : 'Deactivate'} ${deactivating?.fullName ?? ''}?`}
        message={
          activating
            ? 'The driver will be available for new entries again.'
            : 'Inactive drivers stay in history and reports but cannot be selected for new entries.'
        }
        confirmLabel={activating ? 'Activate' : 'Deactivate'}
        variant={activating ? 'primary' : 'danger'}
        loading={setStatus.isPending}
        onConfirm={() =>
          setStatus.mutate({ id: deactivating.id, status: activating ? 'ACTIVE' : 'INACTIVE' })
        }
      />
    </>
  );
}
