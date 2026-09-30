import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { ROLE_OPTIONS } from './roleOptions';
import { applyServerErrors, patch, post } from '../../lib/api';

const base = {
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email').max(191),
  roleCode: z.enum(['ADMIN', 'BILLER', 'AUDITOR']),
};
const createSchema = z.object({
  ...base,
  password: z.string().min(10, 'At least 10 characters').max(128),
});
const editSchema = z.object(base);

/** Create (user = null) or edit a user. */
export default function UserFormModal({ open, onClose, user }) {
  const isEdit = Boolean(user);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(isEdit ? editSchema : createSchema) });

  useEffect(() => {
    if (open) {
      reset(
        user
          ? { name: user.name, email: user.email, roleCode: user.role.code }
          : { name: '', email: '', roleCode: 'BILLER', password: '' },
      );
    }
  }, [open, user, reset]);

  const mutation = useMutation({
    mutationFn: (values) => (isEdit ? patch(`/users/${user.id}`, values) : post('/users', values)),
    onSuccess: () => {
      toast.success(isEdit ? 'User updated' : 'User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => {
      if (err.code === 'EMAIL_TAKEN') setError('email', { message: err.message });
      else if (!applyServerErrors(err, setError)) toast.error(err.message);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit user' : 'New user'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Full name" required error={errors.name?.message}>
          {(p) => <input {...p} {...register('name')} />}
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          {(p) => <input {...p} type="email" {...register('email')} />}
        </Field>
        <Field label="Role" required error={errors.roleCode?.message}>
          {(p) => (
            <select {...p} {...register('roleCode')}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {!isEdit && (
          <Field
            label="Initial password"
            required
            error={errors.password?.message}
            hint="At least 10 characters. Share it securely."
          >
            {(p) => (
              <input {...p} type="password" autoComplete="new-password" {...register('password')} />
            )}
          </Field>
        )}
      </form>
    </Modal>
  );
}
