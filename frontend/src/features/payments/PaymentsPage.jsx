import PageHeader from '../../components/PageHeader';
import PaymentsTable from './PaymentsTable';

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Driver Payments"
        description="Payments against finalized settlements. Outstanding = final settlement − valid payments. Record payments from the settlement page."
      />
      <PaymentsTable />
    </>
  );
}
