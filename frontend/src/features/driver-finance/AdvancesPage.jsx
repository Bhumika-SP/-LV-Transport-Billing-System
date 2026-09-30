import PageHeader from '../../components/PageHeader';
import AdvancesTable from './AdvancesTable';

export default function AdvancesPage() {
  return (
    <>
      <PageHeader
        title="Advances"
        description="Money already paid to drivers, recovered (fully or partially) through their monthly settlements. Click an advance to see or record recoveries."
      />
      <AdvancesTable />
    </>
  );
}
