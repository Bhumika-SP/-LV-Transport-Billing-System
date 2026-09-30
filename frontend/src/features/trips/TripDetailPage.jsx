import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../auth/auth-context';
import DetailHeader from '../../components/DetailHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { DetailList } from '../../components/ui/Card';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PERMISSIONS } from '../../config/permissions';
import { get, post } from '../../lib/api';
import { formatDate, formatDateTime, formatINR, formatKm, formatMonth } from '../../lib/format';
import TripFormModal from './TripFormModal';

const linkClass = 'text-brand-700 hover:underline';

/** The stored calculation, shown component by component (spec §73). */
function Calculation({ trip }) {
  return (
    <Card title="Earnings calculation">
      <dl className="divide-y divide-slate-100 text-sm">
        {trip.kmSource === 'START_END' && (
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-slate-500">Odometer</dt>
            <dd className="tabular-nums">
              {formatKm(trip.endKm)} − {formatKm(trip.startKm)}
            </dd>
          </div>
        )}
        <div className="flex justify-between px-4 py-2.5">
          <dt className="text-slate-500">
            Total KM{' '}
            <span className="text-xs">
              ({trip.kmSource === 'START_END' ? 'from start/end KM' : 'entered directly'})
            </span>
          </dt>
          <dd className="tabular-nums">{formatKm(trip.totalKm)} km</dd>
        </div>
        <div className="flex justify-between px-4 py-2.5">
          <dt className="text-slate-500">
            Rate per km <span className="text-xs">({trip.vehicleType.name})</span>
          </dt>
          <dd className="tabular-nums">× {formatINR(trip.ratePerKm)}</dd>
        </div>
        <div className="flex justify-between bg-slate-50 px-4 py-3">
          <dt className="font-medium text-slate-700">Trip earnings</dt>
          <dd className="text-base font-semibold tabular-nums">{formatINR(trip.earnings)}</dd>
        </div>
      </dl>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Rate used: {formatINR(trip.rate.ratePerKm)}/km effective{' '}
        {formatDate(trip.rate.effectiveFrom)}
        {' – '}
        {trip.rate.effectiveTo ? formatDate(trip.rate.effectiveTo) : 'open'}
        {trip.rate.status === 'CANCELLED' &&
          ' (this rate has since been cancelled — recalculate if needed)'}
        . Stored with the trip; later rate changes do not alter it.
      </p>
    </Card>
  );
}

export default function TripDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const {
    data: trip,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['trips', id],
    queryFn: () => get(`/trips/${id}`),
  });

  const onDone = (message, close) => (data) => {
    toast.success(typeof message === 'function' ? message(data) : message);
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    close(false);
  };
  const cancel = useMutation({
    mutationFn: (reason) => post(`/trips/${id}/cancel`, { reason }),
    onSuccess: onDone('Trip cancelled', setCancelling),
    onError: (err) => toast.error(err.message),
  });
  const recalc = useMutation({
    mutationFn: (reason) => post(`/trips/${id}/recalculate`, { reason }),
    onSuccess: onDone(
      (r) =>
        r.changed
          ? `Recalculated: ${formatINR(r.trip.earnings)}`
          : 'No change: the stored rate is still the applicable one',
      setRecalculating,
    ),
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const active = trip.status === 'ACTIVE';

  return (
    <>
      <DetailHeader
        backTo="/trips"
        backLabel="Trips"
        title={`Trip #${trip.id}${trip.externalTripId ? ` · ${trip.externalTripId}` : ''}`}
        status={trip.status}
        subtitle={`${formatDate(trip.tripDate)} · ${trip.company.name} · settlement month ${formatMonth(trip.settlementMonth)}`}
        actions={
          active && (
            <>
              {can(PERMISSIONS.TRIP_MANAGE) && (
                <>
                  <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button variant="secondary" icon={Ban} onClick={() => setCancelling(true)}>
                    Cancel trip
                  </Button>
                </>
              )}
              {can(PERMISSIONS.TRIP_RECALCULATE) && (
                <Button variant="secondary" icon={RefreshCw} onClick={() => setRecalculating(true)}>
                  Recalculate
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Trip">
          <DetailList
            items={[
              {
                label: 'Company',
                value: (
                  <Link className={linkClass} to={`/companies/${trip.company.id}`}>
                    {trip.company.name}
                  </Link>
                ),
              },
              {
                label: 'Driver',
                value: (
                  <Link className={linkClass} to={`/drivers/${trip.driver.id}`}>
                    {trip.driver.fullName}
                  </Link>
                ),
              },
              {
                label: 'Vehicle',
                value: (
                  <Link className={linkClass} to={`/vehicles/${trip.vehicle.id}`}>
                    {trip.vehicle.registrationNumber}
                  </Link>
                ),
              },
              { label: 'Vehicle type (priced as)', value: trip.vehicleType.name },
              { label: 'Trip date', value: formatDate(trip.tripDate) },
              { label: 'External trip ID', value: trip.externalTripId },
              { label: 'Trip reference', value: trip.tripReference },
              { label: 'Pickup', value: trip.pickup },
              { label: 'Drop', value: trip.dropLocation },
              {
                label: 'Source',
                value: (
                  <Badge tone={trip.source === 'IMPORT' ? 'blue' : 'gray'}>
                    {trip.source === 'IMPORT' ? `Import #${trip.importId}` : 'Manual entry'}
                  </Badge>
                ),
              },
              { label: 'Notes', value: trip.notes },
            ]}
          />
        </Card>
        <div className="space-y-4">
          <Calculation trip={trip} />
          <Card title="History">
            <DetailList
              items={[
                {
                  label: 'Created',
                  value: `${formatDateTime(trip.createdAt)} by ${trip.createdBy?.name ?? '—'}`,
                },
                {
                  label: 'Last updated',
                  value: trip.updatedBy
                    ? `${formatDateTime(trip.updatedAt)} by ${trip.updatedBy.name}`
                    : null,
                },
                ...(trip.status === 'CANCELLED'
                  ? [
                      {
                        label: 'Cancelled',
                        value: `${formatDateTime(trip.cancelledAt)} by ${trip.cancelledBy?.name ?? '—'}`,
                      },
                      { label: 'Cancel reason', value: trip.cancelReason },
                    ]
                  : []),
              ]}
            />
          </Card>
        </div>
      </div>

      <TripFormModal open={editing} onClose={() => setEditing(false)} trip={trip} />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel trip"
        message="The trip will be kept for history but excluded from earnings. This cannot be undone."
        confirmLabel="Cancel trip"
        requireReason
        loading={cancel.isPending}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
      <ConfirmDialog
        open={recalculating}
        onClose={() => setRecalculating(false)}
        title="Recalculate trip earnings"
        message="Re-applies the rate currently effective on the trip date (from the vehicle's current type). The old and new values are recorded in the audit log."
        confirmLabel="Recalculate"
        variant="primary"
        requireReason
        loading={recalc.isPending}
        onConfirm={(reason) => recalc.mutate(reason)}
      />
    </>
  );
}
