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
import DriverFormModal from './DriverFormModal';

function AssignmentHistory({ driverId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['drivers', driverId, 'assignments'],
    queryFn: () => get(`/drivers/${driverId}/assignments`),
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
          { key: 'startDate', header: 'From', render: (r) => formatDate(r.startDate) },
          {
            key: 'endDate',
            header: 'To',
            render: (r) => (r.endDate ? formatDate(r.endDate) : 'Present'),
          },
          {
            key: 'periodStatus',
            header: 'Status',
            render: (r) => <StatusBadge status={r.periodStatus} />,
          },
          { key: 'notes', header: 'Notes' },
        ]}
      />
    </Card>
  );
}

export default function DriverDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const {
    data: driver,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['drivers', id],
    queryFn: () => get(`/drivers/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const canManage = can(PERMISSIONS.DRIVER_MANAGE);

  return (
    <>
      <DetailHeader
        backTo="/drivers"
        backLabel="Drivers"
        title={driver.fullName}
        status={driver.status}
        subtitle={`${driver.driverCode} · ${driver.phone}`}
        actions={
          canManage && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <StatusToggle
                url={`/drivers/${id}`}
                status={driver.status}
                name={driver.fullName}
                invalidateKeys={[['drivers']]}
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
                <Card title="Personal">
                  <DetailList
                    items={[
                      { label: 'Driver code', value: driver.driverCode },
                      { label: 'Phone', value: driver.phone },
                      { label: 'Alternate phone', value: driver.alternatePhone },
                      { label: 'Date of joining', value: formatDate(driver.joiningDate) },
                      {
                        label: 'Current vehicle',
                        value: driver.currentVehicle ? (
                          <Link
                            className="text-brand-700 hover:underline"
                            to={`/vehicles/${driver.currentVehicle.id}`}
                          >
                            {driver.currentVehicle.registrationNumber}
                          </Link>
                        ) : null,
                      },
                      { label: 'Address', value: driver.address },
                    ]}
                  />
                </Card>
                <Card title="Licence">
                  <DetailList
                    items={[
                      { label: 'Licence number', value: driver.licenseNumber },
                      { label: 'Licence expiry', value: formatDate(driver.licenseExpiryDate) },
                    ]}
                  />
                </Card>
                <Card title="Payment details">
                  <DetailList
                    items={[
                      { label: 'Account holder', value: driver.bankAccountName },
                      { label: 'Account number', value: driver.bankAccountNumber },
                      { label: 'IFSC', value: driver.bankIfsc },
                      { label: 'Bank', value: driver.bankName },
                      { label: 'UPI ID', value: driver.upiId },
                    ]}
                  />
                </Card>
                <Card title="Other">
                  <DetailList
                    items={[
                      { label: 'Notes', value: driver.notes },
                      { label: 'Created', value: formatDateTime(driver.createdAt) },
                      { label: 'Last updated', value: formatDateTime(driver.updatedAt) },
                    ]}
                  />
                </Card>
              </div>
            ),
          },
          { key: 'trips', label: 'Trips', content: <TripTable fixed={{ driverId: id }} /> },
          {
            key: 'earnings',
            label: 'Earnings',
            content: <PhasePlaceholder what="Earnings" phase={7} />,
          },
          {
            key: 'expenses',
            label: 'Expenses',
            content: <PhasePlaceholder what="Expenses" phase={8} />,
          },
          {
            key: 'advances',
            label: 'Advances',
            content: <PhasePlaceholder what="Advances" phase={8} />,
          },
          {
            key: 'deductions',
            label: 'Deductions',
            content: <PhasePlaceholder what="Deductions" phase={8} />,
          },
          {
            key: 'settlements',
            label: 'Settlements',
            content: <PhasePlaceholder what="Monthly settlements" phase={9} />,
          },
          {
            key: 'payments',
            label: 'Payments',
            content: <PhasePlaceholder what="Payments" phase={10} />,
          },
          {
            key: 'documents',
            label: 'Documents',
            content: <PhasePlaceholder what="Documents" phase={15} />,
          },
          {
            key: 'assignments',
            label: 'Assignment History',
            content: <AssignmentHistory driverId={id} />,
          },
        ]}
      />
      <DriverFormModal open={editing} onClose={() => setEditing(false)} driver={driver} />
    </>
  );
}
