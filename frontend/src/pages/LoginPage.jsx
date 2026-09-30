import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/auth-context';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

/** Only allow same-app relative redirects after login. */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-800 text-lg font-bold text-white">
            LV
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">LV Transport Billing</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {formError}
            </div>
          )}
          <Field label="Email" error={errors.email?.message}>
            {(p) => <input {...p} type="email" autoComplete="username" {...register('email')} />}
          </Field>
          <Field label="Password" error={errors.password?.message}>
            {(p) => (
              <input
                {...p}
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
