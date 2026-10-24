import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, Field, PasswordInput } from '@/components/ui';
import PasswordRequirements, { meetsPasswordPolicy } from '@/components/PasswordRequirements';
import { confirmPasswordReset } from '@/services/api';
import LegalFooter from '@/components/LegalFooter';


const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const policyOk = useMemo(() => meetsPasswordPolicy(password), [password]);
  const matches = password.length > 0 && password === confirmPassword;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!policyOk) {
      setError('Password does not meet the requirements below.');
      return;
    }
    if (!matches) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden p-4 sm:p-6"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl">
        <div className="flex flex-col gap-4 p-6 sm:p-9">{children}</div>
      </div>
      <div className="mt-8">
        <LegalFooter compact />
      </div>
    </div>
  );

  // A missing token means the link was truncated or hand-typed — say so
  // without hinting at what a valid token looks like.
  if (!token) {
    return shell(
      <>
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div>
            <h1 className="text-lg text-amber-900 dark:text-amber-300">Reset link incomplete</h1>
            <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
              This page needs the link from your reset email. Open it directly from the email, or
              request a new one.
            </p>
          </div>
        </div>
        <Link
          to="/forgot-password"
          className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-300"
        >
          Request a new reset link
        </Link>
      </>,
    );
  }

  if (done) {
    return shell(
      <>
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <h1 className="text-lg text-emerald-900 dark:text-emerald-300">Password updated</h1>
            <p className="mt-1 text-sm leading-relaxed text-emerald-800 dark:text-emerald-300">
              Your password has been changed and every other session was signed out. You can sign
              in with your new password now.
            </p>
          </div>
        </div>
        <Button variant="accent" size="lg" className="w-full" onClick={() => navigate('/login')}>
          Go to sign in
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </>,
    );
  }

  return shell(
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
        <ShieldCheck className="h-5 w-5" aria-hidden />
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">
          Choose a new password
        </span>
      </div>

      <div>
        <h1 className="text-2xl text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Pick something you have not used on this account before.
        </p>
      </div>

      <Field label="New password" required>
        {(props) => (
          <PasswordInput
            {...props}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
          />
        )}
      </Field>

      <PasswordRequirements value={password} />

      <Field label="Confirm new password" required>
        {(props) => (
          <PasswordInput
            {...props}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
          />
        )}
      </Field>

      {confirmPassword.length > 0 && !matches && (
        <p className="text-xs text-red-600 dark:text-red-400">The two passwords do not match.</p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="accent"
        size="lg"
        loading={loading}
        disabled={!policyOk || !matches}
        className="w-full"
      >
        {loading ? 'Updating…' : 'Update password'}
      </Button>

      <Link to="/login" className="text-center text-sm font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-300">
        Back to sign in
      </Link>
    </form>,
  );
};

export default ResetPasswordPage;
