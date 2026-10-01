import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import PageHeader from '../../components/PageHeader';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DataTable from '../../components/ui/DataTable';
import Pagination from '../../components/ui/Pagination';
import { FilterSelect, SearchInput, Toolbar } from '../../components/ui/Toolbar';
import { useListParams } from '../../hooks/useListParams';
import { get, patch } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import ResetPasswordModal from './ResetPasswordModal';
import { ROLE_OPTIONS } from './roleOptions';
import UserFormModal from './UserFormModal';

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { params, update, toggleSort } = useListParams({ sortBy: 'name' });
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [resetting, setResetting] = useState(null);
  const [toggling, setToggling] = useState(null);

  const query = useQuery({
    queryKey: ['users', params],
    queryFn: () => get('/users', params),
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => patch(`/users/${id}`, { status }),
    onSuccess: (u) => {
      toast.success(`${u.name} ${u.status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setToggling(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const columns = [
    {
      key: 'name',
      important: true,
      header: 'Name',
      sortable: true,
    },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'role', important: true, header: 'Role', render: (u) => u.role.name },
    {
      key: 'status',
      important: true,
      header: 'Status',
      render: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      sortable: true,
      render: (u) => formatDateTime(u.lastLoginAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={Pencil}
            onClick={() => setEditing(u)}
            aria-label={`Edit ${u.name}`}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={KeyRound}
            onClick={() => setResetting(u)}
            aria-label={`Reset password for ${u.name}`}
          />
          {u.id !== me.id && (
            <Button
              variant="ghost"
              size="sm"
              icon={Power}
              onClick={() => setToggling(u)}
              aria-label={`${u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${u.name}`}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage who can sign in and their role"
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)}>
            New user
          </Button>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <Toolbar>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Search name or email"
          />
          <FilterSelect
            label="Role"
            value={params.role}
            onChange={(role) => update({ role })}
            options={ROLE_OPTIONS}
          />
          <FilterSelect
            label="Status"
            value={params.status}
            onChange={(status) => update({ status })}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ]}
          />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          sort={params}
          onSort={toggleSort}
        />
        <Pagination meta={query.data?.meta} onPageChange={(page) => update({ page })} />
      </div>

      <UserFormModal
        open={editing !== undefined}
        user={editing}
        onClose={() => setEditing(undefined)}
      />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        title={toggling?.status === 'ACTIVE' ? 'Deactivate user' : 'Activate user'}
        message={
          toggling?.status === 'ACTIVE'
            ? `${toggling?.name} will be signed out and unable to sign in.`
            : `${toggling?.name} will be able to sign in again.`
        }
        confirmLabel={toggling?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        variant={toggling?.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={statusMutation.isPending}
        onConfirm={() =>
          statusMutation.mutate({
            id: toggling.id,
            status: toggling.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
          })
        }
      />
    </>
  );
}
