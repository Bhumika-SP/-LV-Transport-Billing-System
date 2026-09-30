import PageHeader from '../../components/PageHeader';
import TripTable from './TripTable';

export default function TripsPage() {
  return (
    <>
      <PageHeader
        title="Trips"
        description="Trip earnings = total KM × the vehicle type's rate on the trip date"
      />
      <TripTable />
    </>
  );
}
