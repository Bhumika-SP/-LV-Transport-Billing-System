import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import DetailHeader from '../../components/DetailHeader';
import StatusToggle from '../../components/StatusToggle';
import Button from '../../components/ui/Button';
import Card, { DetailList } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { get } from '../../lib/api';
import { formatDate, formatINR } from '../../lib/format';
import RateFormModal from './RateFormModal';
import RateHistoryTable from './RateHistoryTable';
import VehicleTypeFormModal from './VehicleTypeFormModal';

export default function VehicleTypeDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [addingRate, setAddingRate] = useState(false);
  const {
    data: type,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['vehicle-types', id],
    queryFn: () => get(`/vehicle-types/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <DetailHeader
        backTo="/vehicle-types"
        backLabel="Vehicle types"
        title={type.name}
        status={type.status}
        subtitle={type.description}
        actions={
          can(PERMISSIONS.VEHICLE_MANAGE) && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <StatusToggle
                url={`/vehicle-types/${id}`}
                status={type.status}
                name={type.name}
                invalidateKeys={[['vehicle-types']]}
              />
            </>
          )
        }
      />

      <Card className="mb-4">
        <DetailList
          items={[
            {
              label: 'Current rate per km',
              value: type.currentRate ? (
                <span className="text-base font-semibold">
                  {formatINR(type.currentRate.ratePerKm)}
                </span>
              ) : (
                <span className="text-amber-700">No rate effective today</span>
              ),
            },
            {
              label: 'Effective since',
              value: type.currentRate && formatDate(type.currentRate.effectiveFrom),
            },
            { label: 'Vehicles of this type', value: type.vehicleCount },
          ]}
        />
      </Card>

      <Card
        title="Rate history"
        actions={
          can(PERMISSIONS.RATE_MANAGE) && (
            <Button size="sm" icon={Plus} onClick={() => setAddingRate(true)}>
              Add rate
            </Button>
          )
        }
      >
        <RateHistoryTable vehicleTypeId={id} currentRateId={type.currentRate?.id} />
      </Card>

      <VehicleTypeFormModal open={editing} onClose={() => setEditing(false)} vehicleType={type} />
      <RateFormModal open={addingRate} onClose={() => setAddingRate(false)} vehicleType={type} />
    </>
  );
}
