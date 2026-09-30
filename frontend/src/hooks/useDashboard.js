import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';

/** Role-aware dashboard data (GET /api/dashboard), refreshed every minute. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => get('/dashboard'),
    refetchInterval: 60_000,
  });
}
