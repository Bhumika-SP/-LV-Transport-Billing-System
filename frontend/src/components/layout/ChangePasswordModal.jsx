import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { applyServerErrors, post } from '../../lib/api';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(10, 'At least 10 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export default function ChangePasswordModal({ open, onClose }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      await post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed. Other sessions have been signed out.');
      close();
    } catch (err) {
      if (err.code === 'INVALID_CURRENT_PASSWORD') {
        setError('currentPassword', { message: err.message });
      } else if (!applyServerErrors(err, setError)) {
        toast.error(err.message);
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="change-password-form" loading={isSubmitting}>
            Change password
          </Button>
        </>
      }
    >
      <form
        id="change-password-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <Field label="Current password" required error={errors.currentPassword?.message}>
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
          )}
        </Field>
        <Field
          label="New password"
          required
          error={errors.newPassword?.message}
          hint="At least 10 characters"
        >
          {(p) => (
            <input
              {...p}
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
            />
          )}
        </Field>
        <Field label="Confirm new password" required error={errors.confirm?.message}>
          {(p) => (
            <input {...p} type="password" autoComplete="new-password" {...register('confirm')} />
          )}
        </Field>
      </form>
    </Modal>
  );
}
