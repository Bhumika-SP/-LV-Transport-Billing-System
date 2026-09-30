import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../lib/api';

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => get('/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  return {
    markRead: useMutation({
      mutationFn: (id) => post(`/notifications/${id}/read`),
      onSuccess: refresh,
    }),
    markAllRead: useMutation({
      mutationFn: () => post('/notifications/read-all'),
      onSuccess: refresh,
    }),
  };
}
