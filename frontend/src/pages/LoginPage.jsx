import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/auth-context';
import Field from '../components/ui/Field';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

/** Only allow same-app relative redirects after login. */
function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/**
 * Wide screens show the approved design (public/login-design.png, 1672x941) as a stage scaled to
 * fit the window, with the live sign-in card placed exactly over the card in the picture.
 * Narrow screens get a stacked layout over the plain transport photo.
 */
const STAGE = { width: 1672, height: 941 };
const CARD = { left: 939, top: 99, width: 611, height: 766 };
const WIDE_MIN = 900;

function measure() {
  return {
    wide: window.innerWidth >= WIDE_MIN,
    scale: Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height),
  };
}

function useLayout() {
  const [layout, setLayout] = useState(measure);
  useEffect(() => {
    const onResize = () => setLayout(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layout;
}

function Logo({ className = '' }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[#14b8bd] to-[#0a82a8] font-bold text-white shadow-sm ${className}`}
    >
      LV
    </div>
  );
}

function LoginForm({ stage }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });


  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFormError(err.message);
    }
  };


  const iconClass =
    'pointer-events-none absolute top-1/2 left-[18px] h-[22px] w-[22px] -translate-y-1/2 text-[#6b7a90]';
  const labelHack =
    '[&_label]:mb-2 [&_label]:text-[20px] [&_label]:font-semibold [&_label]:text-[#0f2a5c]';

  return (
    <>
      <div className="flex items-center gap-[27px]">
        <Logo
          className={
            stage
              ? 'h-[78px] w-[78px] rounded-[18px] text-[32px]'
              : 'h-16 w-16 rounded-2xl text-2xl'
          }
        />
        <div className="leading-tight">
          <div className={`font-bold text-[#0f2a5c] ${stage ? 'text-[29px]' : 'text-xl'}`}>
            LV Transport
          </div>
          <div className={`text-[#7d8cab] ${stage ? 'text-[23px]' : 'text-sm'}`}>
            Billing System
          </div>
        </div>
      </div>

      <h1
        className={`font-extrabold text-[#0f2a5c] ${stage ? 'mt-[34px] text-[43px] leading-[1.1]' : 'mt-8 text-4xl'}`}
      >
        Welcome back
      </h1>
      <p className={`text-[#8a98b3] ${stage ? 'mt-[10px] text-[18px]' : 'mt-2 text-[15px]'}`}>
        Sign in to continue to your transport billing dashboard
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className={`${labelHack} ${stage ? 'mt-[44px] space-y-[24px]' : 'mt-8 space-y-5'}`}
      >
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {formError}
          </div>
        )}
        <Field label="Email address" error={errors.email?.message}>
          {(p) => (
            <div className="relative">
              <Mail className={iconClass} aria-hidden="true" />
              <input
                {...p}
                className={`${inputClass} pr-4`}

                type="email"
                autoComplete="username"
                placeholder="Enter your email address"
                {...register('email')}
              />
            </div>
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => (
            <div className="relative">
              <Lock className={iconClass} aria-hidden="true" />
              <input
                {...p}
                className={`${inputClass} pr-14`}

                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#6b7a90] hover:text-[#0f2a5c] focus-visible:ring-2 focus-visible:ring-[#1a6fd6] focus-visible:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="h-[22px] w-[22px]" aria-hidden="true" />
                ) : (
                  <Eye className="h-[22px] w-[22px]" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <label className="group flex cursor-pointer items-center gap-3 text-[15px] text-[#0f2a5c]">
              <input type="checkbox" className="peer sr-only" {...register('rememberMe')} />
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-[#c5d0e0] bg-white text-transparent transition-colors peer-checked:border-[#1a6fd6] peer-checked:bg-[#1a6fd6] peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-[#1a6fd6]/20">
                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
              </span>
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-expanded={showHelp}
              className="text-[15px] font-medium text-[#1565d8] hover:underline focus-visible:ring-2 focus-visible:ring-[#1a6fd6] focus-visible:outline-none"
            >
              Forgot password?
            </button>
          </div>
          {showHelp && (
            <p className="mt-3 rounded-lg bg-[#f6f8fc] p-3 text-sm text-slate-600">
              Passwords are reset by your administrator. Contact them to get a temporary password,
              then change it after signing in.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`relative flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#0a58a6] to-[#1b79d1] font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:ring-4 focus-visible:ring-[#1a6fd6]/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 ${
            stage ? 'h-[60px] text-[22px]' : 'h-[54px] text-lg'
          }`}
        >
          {isSubmitting ? 'Signing in…' : 'Sign In'}
          {!isSubmitting && <ArrowRight className="absolute right-6 h-6 w-6" aria-hidden="true" />}
        </button>
      </form>

      <p
        className={`flex items-center justify-center gap-2 text-[#5b6b82] ${stage ? 'mt-[26px] text-[14px]' : 'mt-6 text-sm'}`}
      >
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        Secure access to LV Transport Billing System
      </p>
    </>
  );
}

function CardFooter() {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3 text-sm text-[#5b6b82]">
        <span className="h-px flex-1 bg-[#e1e8f2]" aria-hidden="true" />
        <span>
          Powered by <strong className="font-bold text-[#0f2a5c]">AK Cloud Solutions</strong>
        </span>
        <span className="h-px flex-1 bg-[#e1e8f2]" aria-hidden="true" />
      </div>
      <p className="mt-4 text-xs text-[#8a98b3]">
        © {new Date().getFullYear()} LV Transport Billing System
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { wide, scale } = useLayout();

  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  if (!wide) {
    return (
      <div
        className="flex h-dvh flex-col overflow-hidden bg-slate-900 bg-cover bg-[position:20%_center]"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      >
        <div className="flex flex-1 flex-col justify-between bg-gradient-to-t from-brand-900/60 via-transparent to-brand-900/10 p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <Logo className="h-12 w-12 rounded-xl text-lg" />
            <div className="leading-tight">
              <div className="text-lg font-semibold text-white">LV Transport</div>
              <div className="text-sm text-brand-100">Billing System</div>
            </div>
          </div>
          <p className="max-w-xs text-2xl leading-tight font-semibold text-white">
            Simplifying transport operations, billing and settlements.
          </p>
        </div>
        <main className="max-h-[88%] overflow-y-auto rounded-t-3xl bg-white px-6 pt-6 pb-4 shadow-2xl sm:px-10">
          <LoginForm />
          <div className="mt-6">
            <CardFooter />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#1d4a7a]">
      {/* Blurred copy of the picture fills any space around the stage. */}
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: "url('/login-design.png')" }}
        aria-hidden="true"
      />
      <div
        className="absolute top-1/2 left-1/2"
        style={{
          width: STAGE.width,
          height: STAGE.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          backgroundImage: "url('/login-design.png')",
          backgroundSize: '100% 100%',
        }}
      >
        <main
          className="absolute flex flex-col justify-between rounded-3xl bg-gradient-to-b from-white to-[#f7faff] pt-[40px] pr-[48px] pb-[28px] pl-[63px] shadow-2xl"
          style={CARD}
        >
          <div>
            <LoginForm stage />
          </div>
          <CardFooter />
        </main>
      </div>
    </div>
  );
}
