import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import PageHeader from '../../components/PageHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/States';
import Tabs from '../../components/ui/Tabs';
import { FilterSelect, Toolbar } from '../../components/ui/Toolbar';
import { PERMISSIONS } from '../../config/permissions';
import { useListParams } from '../../hooks/useListParams';
import { toSelect, useOptions } from '../../hooks/useOptions';
import { get } from '../../lib/api';
import { formatDate } from '../../lib/format';
import AssignmentFormModal from './AssignmentFormModal';
import { KINDS } from './kinds';

const LINKS = {
  vehicleId: (a) => ({ to: `/vehicles/${a.vehicle.id}`, label: a.vehicle.registrationNumber }),
  companyId: (a) => ({ to: `/companies/${a.company.id}`, label: a.company.name }),
  driverId: (a) => ({ to: `/drivers/${a.driver.id}`, label: a.driver.fullName }),
};

function AssignmentList({ kind }) {
  const k = KINDS[kind];
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ASSIGNMENT_MANAGE);
  const [editing, setEditing] = useState(undefined); // undefined closed, null new
  const { params, update, toggleSort } = useListParams({ sortBy: 'startDate', sortDir: 'desc' });
  const optionsA = useOptions(k.parties[0].resource, { includeInactive: true });
  const optionsB = useOptions(k.parties[1].resource, { includeInactive: true });

  const query = useQuery({
    queryKey: ['assignments', kind, params],
    queryFn: () => get(`/assignments/${k.path}`, params),
    placeholderData: keepPreviousData,
  });

  const columns = [
    ...k.parties.map((p) => ({
      key: p.field,
      header: p.label,
      render: (a) => {
        const { to, label } = LINKS[p.field](a);
        return (
          <Link to={to} className="font-medium text-brand-700 hover:underline">
            {label}
          </Link>
        );
      },
    })),
    { key: 'startDate', header: 'From', sortable: true, render: (a) => formatDate(a.startDate) },
    {
      key: 'endDate',
      header: 'To',
      sortable: true,
      render: (a) => (a.endDate ? formatDate(a.endDate) : 'Ongoing'),
    },
    {
      key: 'periodStatus',
      header: 'Status',
      render: (a) => <StatusBadge status={a.periodStatus} />,
    },
    { key: 'notes', header: 'Notes', className: 'whitespace-normal' },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (a) => (
        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(a)}>
          {a.endDate ? 'Edit' : 'Edit / end'}
        </Button>
      ),
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <Toolbar>
        {k.parties.map((p, i) => (
          <FilterSelect
            key={p.field}
            label={p.label}
            value={params[p.field]}
            onChange={(val) => update({ [p.field]: val })}
            options={((i === 0 ? optionsA : optionsB).data ?? []).map(toSelect[p.resource])}
          />
        ))}
        <FilterSelect
          label="Show"
          allLabel="All periods"
          value={params.current}
          onChange={(current) => update({ current })}
          options={[{ value: 'true', label: 'Current only' }]}
        />
        {canManage && (
          <Button className="sm:ml-auto" icon={Plus} onClick={() => setEditing(null)}>
            New assignment
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
        empty={<EmptyState title="No assignments found" />}
      />
      <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      <AssignmentFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        kind={kind}
        assignment={editing}
      />
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <>
      <PageHeader
        title="Assignments"
        description="Effective-dated history of which company each vehicle serves and which vehicle each driver drives"
      />
      <Tabs
        tabs={[
          {
            key: 'vehicle',
            label: KINDS.vehicle.title,
            content: <AssignmentList kind="vehicle" />,
          },
          { key: 'driver', label: KINDS.driver.title, content: <AssignmentList kind="driver" /> },
        ]}
      />
    </>
  );
}
