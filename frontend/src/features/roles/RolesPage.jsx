import { useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { get } from '../../lib/api';

/** Read-only view of the three roles and the backend permission matrix. */
export default function RolesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: () => get('/roles'),
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const modules = [...new Set(data.permissions.map((p) => p.module))];

  return (
    <>
      <PageHeader
        title="Roles"
        description="The three application roles and what each may do. Permissions are enforced by the server."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {data.roles.map((r) => (
          <Card key={r.code} bodyClassName="p-4">
            <div className="text-sm font-semibold text-slate-900">{r.name}</div>
            <p className="mt-1 text-sm text-slate-500">{r.description}</p>
            <p className="mt-3 text-xs text-slate-500">
              {r.userCount} user{r.userCount === 1 ? '' : 's'} · {r.permissions.length} permissions
            </p>
          </Card>
        ))}
      </div>

      <Card title="Permission matrix">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase"
                >
                  Permission
                </th>
                {data.roles.map((r) => (
                  <th
                    key={r.code}
                    scope="col"
                    className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase"
                  >
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            {modules.map((module) => (
              <tbody key={module} className="divide-y divide-slate-100">
                <tr className="bg-slate-50/60">
                  <th
                    colSpan={data.roles.length + 1}
                    scope="colgroup"
                    className="px-4 py-2 text-left text-xs font-semibold text-slate-600"
                  >
                    {module}
                  </th>
                </tr>
                {data.permissions
                  .filter((p) => p.module === module)
                  .map((p) => (
                    <tr key={p.code}>
                      <td className="px-4 py-2 text-slate-700">
                        {p.description}
                        <span className="ml-2 font-mono text-xs text-slate-400">{p.code}</span>
                      </td>
                      {data.roles.map((r) => (
                        <td key={r.code} className="px-4 py-2 text-center">
                          {r.permissions.includes(p.code) ? (
                            <Check
                              className="mx-auto h-4 w-4 text-emerald-600"
                              aria-label="Granted"
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 text-slate-300"
                              aria-label="Not granted"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </>
  );
}
