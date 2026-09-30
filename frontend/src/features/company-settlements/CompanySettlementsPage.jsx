import PageHeader from '../../components/PageHeader';
import CompanySettlementTable from './CompanySettlementTable';

export default function CompanySettlementsPage() {
  return (
    <>
      <PageHeader
        title="Company Settlements"
        description="One settlement per company per month. Only RECEIVED amounts count as money actually received."
      />
      <CompanySettlementTable />
    </>
  );
}
