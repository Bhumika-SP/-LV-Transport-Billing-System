import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';

/**
 * Dropdown options from `/<resource>/options`.
 * resource: 'companies' | 'drivers' | 'vehicles' | 'vehicle-types'
 */
export function useOptions(resource, { includeInactive = false, enabled = true } = {}) {
  return useQuery({
    queryKey: [resource, 'options', { includeInactive }],
    queryFn: () => get(`/${resource}/options`, includeInactive ? { includeInactive: 'true' } : {}),
    staleTime: 60_000,
    enabled,
  });
}

export const toSelect = {
  companies: (c) => ({ value: String(c.id), label: c.code ? `${c.name} (${c.code})` : c.name }),
  drivers: (d) => ({ value: String(d.id), label: `${d.fullName} (${d.driverCode})` }),
  vehicles: (v) => ({
    value: String(v.id),
    label: `${v.registrationNumber} · ${v.vehicleType.name}`,
  }),
  'vehicle-types': (t) => ({ value: String(t.id), label: t.name }),
};
