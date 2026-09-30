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
import DriverItemsTable from '../driver-finance/DriverItemsTable';
import { LV_EXPENSES } from '../driver-finance/itemConfigs';
import TripTable from '../trips/TripTable';
import { get } from '../../lib/api';
import { formatDate, formatDateTime, formatINR } from '../../lib/format';
import RateHistoryTable from '../vehicle-types/RateHistoryTable';
import VehicleFormModal from './VehicleFormModal';
import DocumentsPanel from '../documents/DocumentsPanel';

const periodColumns = [
  { key: 'startDate', header: 'From', render: (r) => formatDate(r.startDate) },
  { key: 'endDate', header: 'To', render: (r) => (r.endDate ? formatDate(r.endDate) : 'Present') },
  { key: 'periodStatus', header: 'Status', render: (r) => <StatusBadge status={r.periodStatus} /> },
];

function Assignments({ vehicleId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vehicles', vehicleId, 'assignments'],
    queryFn: () => get(`/vehicles/${vehicleId}/assignments`),
  });
  return (
    <div className="space-y-4">
      <Card title="Company assignments">
        <DataTable
          loading={isLoading}
          error={error}
          rows={data?.companies}
          columns={[
            {
              key: 'company',
              header: 'Company',
              render: (r) => (
                <Link
                  className="font-medium text-brand-700 hover:underline"
                  to={`/companies/${r.company.id}`}
                >
                  {r.company.name}
                </Link>
              ),
            },
            ...periodColumns,
          ]}
        />
      </Card>
      <Card title="Driver assignments">
        <DataTable
          loading={isLoading}
          error={error}
          rows={data?.drivers}
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
            ...periodColumns,
          ]}
        />
      </Card>
    </div>
  );
}

export default function VehicleDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const {
    data: vehicle,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vehicles', id],
    queryFn: () => get(`/vehicles/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <DetailHeader
        backTo="/vehicles"
        backLabel="Vehicles"
        title={vehicle.registrationNumber}
        status={vehicle.status}
        subtitle={[vehicle.vehicleType.name, vehicle.make, vehicle.model, vehicle.year]
          .filter(Boolean)
          .join(' · ')}
        actions={
          can(PERMISSIONS.VEHICLE_MANAGE) && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <StatusToggle
                url={`/vehicles/${id}`}
                status={vehicle.status}
                name={vehicle.registrationNumber}
                invalidateKeys={[['vehicles']]}
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
              <div className="space-y-4">
                <Card title="Current assignment">
                  <DetailList
                    items={[
                      {
                        label: 'Current company',
                        value: vehicle.currentCompany && (
                          <Link
                            className="text-brand-700 hover:underline"
                            to={`/companies/${vehicle.currentCompany.id}`}
                          >
                            {vehicle.currentCompany.name}
                          </Link>
                        ),
                      },
                      {
                        label: 'Current driver',
                        value: vehicle.currentDriver && (
                          <Link
                            className="text-brand-700 hover:underline"
                            to={`/drivers/${vehicle.currentDriver.id}`}
                          >
                            {vehicle.currentDriver.fullName}
                          </Link>
                        ),
                      },
                      {
                        label: 'Vehicle type',
                        value: (
                          <Link
                            className="text-brand-700 hover:underline"
                            to={`/vehicle-types/${vehicle.vehicleType.id}`}
                          >
                            {vehicle.vehicleType.name}
                          </Link>
                        ),
                      },
                      {
                        label: 'Current rate per km',
                        value: vehicle.currentRate
                          ? formatINR(vehicle.currentRate.ratePerKm)
                          : 'No rate today',
                      },
                    ]}
                  />
                </Card>
                <Card title="Vehicle details">
                  <DetailList
                    items={[
                      { label: 'Make', value: vehicle.make },
                      { label: 'Model', value: vehicle.model },
                      { label: 'Year', value: vehicle.year },
                      { label: 'Fuel type', value: vehicle.fuelType },
                      {
                        label: 'Insurance',
                        value:
                          [vehicle.insuranceProvider, vehicle.insurancePolicyNumber]
                            .filter(Boolean)
                            .join(' · ') || null,
                      },
                      { label: 'Insurance expiry', value: formatDate(vehicle.insuranceExpiryDate) },
                      { label: 'Fitness certificate', value: vehicle.fitnessCertificateNumber },
                      { label: 'Fitness expiry', value: formatDate(vehicle.fitnessExpiryDate) },
                      { label: 'Permit', value: vehicle.permitNumber },
                      { label: 'Permit expiry', value: formatDate(vehicle.permitExpiryDate) },
                      { label: 'Notes', value: vehicle.notes },
                      { label: 'Last updated', value: formatDateTime(vehicle.updatedAt) },
                    ]}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'rates',
            label: 'Rate History',
            content: (
              <Card title={`${vehicle.vehicleType.name} rate history`}>
                <RateHistoryTable
                  vehicleTypeId={vehicle.vehicleType.id}
                  currentRateId={vehicle.currentRate?.id}
                />
              </Card>
            ),
          },
          { key: 'assignments', label: 'Assignments', content: <Assignments vehicleId={id} /> },
          { key: 'trips', label: 'Trips', content: <TripTable fixed={{ vehicleId: id }} /> },
          {
            key: 'expenses',
            label: 'Fuel / Toll / Maintenance / EMI',
            content: <DriverItemsTable config={LV_EXPENSES} fixed={{ vehicleId: id }} />,
          },
          {
            key: 'documents',
            label: 'Documents',
            content: <PhasePlaceholder what="Documents" phase={15} />,
          },
          {
            key: 'documents',
            label: 'Documents',
            content: (
              <DocumentsPanel
                entityType="VEHICLE"
                entityId={id}
                canManage={can(PERMISSIONS.VEHICLE_MANAGE)}
              />
            ),
          },
        ]}
      />
      <VehicleFormModal open={editing} onClose={() => setEditing(false)} vehicle={vehicle} />
    </>
  );
}
