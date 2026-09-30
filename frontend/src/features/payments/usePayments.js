import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { post } from '../../lib/api';

/** Reverse a payment (Admin); refreshes payments and settlements. */
export function useReversePayment(onDone) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => post(`/payments/${id}/reverse`, { reason }),
    onSuccess: () => {
      toast.success('Payment reversed; outstanding restored');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });
}
