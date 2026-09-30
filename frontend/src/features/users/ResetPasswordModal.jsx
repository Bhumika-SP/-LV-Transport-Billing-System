import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { post } from '../../lib/api';

const schema = z.object({ password: z.string().min(10, 'At least 10 characters').max(128) });

export default function ResetPasswordModal({ user, onClose }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '' } });

  const close = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (values) => post(`/users/${user.id}/reset-password`, values),
    onSuccess: () => {
      toast.success(`Password reset for ${user.name}. Their sessions were signed out.`);
      close();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Modal
      open={Boolean(user)}
      onClose={close}
      title={`Reset password — ${user?.name ?? ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" loading={mutation.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field
          label="New password"
          required
          error={errors.password?.message}
          hint="At least 10 characters"
        >
          {(p) => (
            <input {...p} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </Field>
      </form>
    </Modal>
  );
}
