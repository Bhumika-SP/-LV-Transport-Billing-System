import { useAuth } from '../../auth/auth-context';
import PageHeader from '../../components/PageHeader';
import Tabs from '../../components/ui/Tabs';
import { PERMISSIONS } from '../../config/permissions';
import { ImportHistory, TemplateList } from './ImportLists';
import NewImport from './NewImport';

export default function ImportsPage() {
  const { can } = useAuth();
  const tabs = [
    ...(can(PERMISSIONS.TRIP_IMPORT)
      ? [{ key: 'new', label: 'New import', content: <NewImport /> }]
      : []),
    { key: 'history', label: 'Import history', content: <ImportHistory /> },
    { key: 'templates', label: 'Templates', content: <TemplateList /> },
  ];
  return (
    <>
      <PageHeader
        title="Bulk Import"
        description="Import trips from company Excel/CSV files. Every row is validated and previewed before anything is saved."
      />
      <Tabs tabs={tabs} />
    </>
  );
}
