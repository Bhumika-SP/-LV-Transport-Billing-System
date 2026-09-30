import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import DetailHeader from '../../components/DetailHeader';
import PhasePlaceholder from '../../components/PhasePlaceholder';
import StatusToggle from '../../components/StatusToggle';
import { StatusBadge } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { DetailList } from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { ErrorState, LoadingState } from '../../components/ui/States';
import Tabs from '../../components/ui/Tabs';
import { PERMISSIONS } from '../../config/permissions';
import TripTable from '../trips/TripTable';
import { get } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import CompanySettlementTable from '../company-settlements/CompanySettlementTable';
import { MonthlyProfitView } from '../profit/ProfitPages';
import CompanyFormModal from './CompanyFormModal';
import EntityHistory from '../audit/EntityHistory';
import DocumentsPanel from '../documents/DocumentsPanel';

const period = (r) =>
  `${formatDate(r.startDate)} – ${r.endDate ? formatDate(r.endDate) : 'present'}`;

function CompanyVehicles({ companyId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['companies', companyId, 'vehicles'],
    queryFn: () => get(`/companies/${companyId}/vehicles`),
  });
  return (
    <Card>
      <DataTable
        loading={isLoading}
        error={error}
        rows={data}
        columns={[
          {
            key: 'vehicle',
            header: 'Vehicle',
            render: (r) => (
              <Link
                className="font-medium text-brand-700 hover:underline"
                to={`/vehicles/${r.vehicle.id}`}
              >
                {r.vehicle.registrationNumber}
              </Link>
            ),
          },
          { key: 'type', header: 'Type', render: (r) => r.vehicle.vehicleType.name },
          { key: 'period', header: 'Assigned', render: period },
          {
            key: 'periodStatus',
            header: 'Status',
            render: (r) => <StatusBadge status={r.periodStatus} />,
          },
        ]}
      />
    </Card>
  );
}

function CompanyDrivers({ companyId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['companies', companyId, 'drivers'],
    queryFn: () => get(`/companies/${companyId}/drivers`),
  });
  return (
    <Card>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Drivers who drove a vehicle while it was assigned to this company.
      </p>
      <DataTable
        loading={isLoading}
        error={error}
        rows={data}
        rowKey={(r) => `${r.driver.id}-${r.vehicle.id}-${r.startDate}`}
        columns={[
          {
            key: 'driver',
            header: 'Driver',
            render: (r) => (
              <Link
                className="font-medium text-brand-700 hover:underline"
                to={`/drivers/${r.driver.id}`}
              >
                {r.driver.fullName}
              </Link>
            ),
          },
          { key: 'code', header: 'Code', render: (r) => r.driver.driverCode },
          { key: 'vehicle', header: 'Vehicle', render: (r) => r.vehicle.registrationNumber },
          { key: 'period', header: 'Period', render: period },
          {
            key: 'periodStatus',
            header: 'Status',
            render: (r) => <StatusBadge status={r.periodStatus} />,
          },
        ]}
      />
    </Card>
  );
}

export default function CompanyDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const {
    data: company,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['companies', id],
    queryFn: () => get(`/companies/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const canManage = can(PERMISSIONS.COMPANY_MANAGE);

  return (
    <>
      <DetailHeader
        backTo="/companies"
        backLabel="Companies"
        title={company.name}
        status={company.status}
        subtitle={company.code ? `Code ${company.code}` : undefined}
        actions={
          canManage && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <StatusToggle
                url={`/companies/${id}`}
                status={company.status}
                name={company.name}
                invalidateKeys={[['companies']]}
              />
            </>
          )
        }
      />
      <Tabs
        tabs={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <Card title="Company details">
                <DetailList
                  items={[
                    { label: 'Contact person', value: company.contactPerson },
                    { label: 'Phone', value: company.phone },
                    { label: 'Email', value: company.email },
                    { label: 'GSTIN', value: company.gstin },
                    { label: 'Vehicles currently assigned', value: company.currentVehicleCount },
                    { label: 'Address', value: company.address },
                    { label: 'Notes', value: company.notes },
                    { label: 'Created', value: formatDateTime(company.createdAt) },
                    { label: 'Last updated', value: formatDateTime(company.updatedAt) },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'settlements',
            label: 'Settlement History',
            content: <CompanySettlementTable companyId={id} />,
          },
          { key: 'trips', label: 'Trips', content: <TripTable fixed={{ companyId: id }} /> },
          { key: 'drivers', label: 'Drivers', content: <CompanyDrivers companyId={id} /> },
          { key: 'vehicles', label: 'Vehicles', content: <CompanyVehicles companyId={id} /> },
          ...(can(PERMISSIONS.PROFIT_VIEW)
            ? [{ key: 'profit', label: 'Profit', content: <MonthlyProfitView companyId={id} /> }]
            : []),
          {
            key: 'documents',
            label: 'Documents',
            content: (
              <DocumentsPanel
                entityType="COMPANY"
                entityId={id}
                canManage={can(PERMISSIONS.COMPANY_MANAGE)}
              />
            ),
          },
          ...(can(PERMISSIONS.AUDIT_VIEW)
            ? [
                {
                  key: 'history',
                  label: 'History',
                  content: <EntityHistory entityType="Company" entityId={id} />,
                },
              ]
            : []),
        ]}
      />
      <CompanyFormModal open={editing} onClose={() => setEditing(false)} company={company} />
    </>
  );
}
