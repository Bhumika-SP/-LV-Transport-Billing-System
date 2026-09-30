import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Power } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { patch } from '../lib/api';
import Button from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';

/** Activate/deactivate button with confirmation. `url` is the PATCH endpoint. */
export default function StatusToggle({ url, status, name, invalidateKeys = [] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const active = status === 'ACTIVE';

  const mutation = useMutation({
    mutationFn: () => patch(url, { status: active ? 'INACTIVE' : 'ACTIVE' }),
    onSuccess: () => {
      toast.success(`${name} ${active ? 'deactivated' : 'activated'}`);
      invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Button variant="secondary" icon={Power} onClick={() => setOpen(true)}>
        {active ? 'Deactivate' : 'Activate'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={active ? `Deactivate ${name}?` : `Activate ${name}?`}
        message={
          active
            ? 'Inactive records stay in history and reports but cannot be selected for new entries.'
            : 'The record will be available for new entries again.'
        }
        confirmLabel={active ? 'Deactivate' : 'Activate'}
        variant={active ? 'danger' : 'primary'}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}
