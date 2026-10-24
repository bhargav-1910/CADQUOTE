import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import LegalFooter from '@/components/LegalFooter';


const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Only ever redirect to a plain in-app path. Anything protocol-relative
  // ("//evil.tld"), backslash-prefixed or absolute is an open redirect —
  // react-router 6 does not reject these itself (GHSA-wrjc-x8rr-h8h6).
  const requestedFrom = location.state?.from?.pathname;
  const from =
    typeof requestedFrom === 'string' &&
    /^\/(?![/\\])/.test(requestedFrom) &&
    !requestedFrom.includes('\\')
      ? requestedFrom
      : '/workspace';
  const justSignedUp = Boolean(location.state?.justSignedUp);
  const prefillEmail = (location.state?.email as string | undefined) ?? '';

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  // Revealed only after the server says this account carries a second factor.
  const [totpCode, setTotpCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password, totp_code: totpCode || undefined });
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      // The server signals "password was right, second factor still needed"
      // with this prefix, so the code field appears without a scary error.
      if (message.startsWith('totp_required')) {
        setTotpRequired(true);
        setError(totpCode ? 'That code was not valid. Try the current one.' : null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center overflow-x-hidden p-4 pb-20 sm:p-6 sm:pb-20">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-edge bg-surface shadow-xl md:grid-cols-2">
        <aside className="dark relative hidden border-r border-edge bg-surface text-ink-secondary p-8 md:flex md:flex-col md:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white">
                <Box className="h-5 w-5" />
              </span>
              <span className="text-2xl text-ink">ForgeQuote</span>
            </Link>
            <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300">
              SEC-01 // Workspace Access
            </p>
            <h2 className="mt-3 max-w-sm text-3xl leading-tight text-ink">
              Back to the <span className="text-primary-600 dark:text-primary-300">shop floor.</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-subtle">
              Upload CAD, price the job, send the quote — every rupee itemized.
            </p>
          </div>
          <div className="rounded-xl border border-edge bg-surface-raised p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">Session security</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
              Access-token rotation with automatic logout on invalid refresh.
            </p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex w-full flex-col justify-center gap-4 bg-surface p-6 sm:p-9">
          <div className="mb-1 flex items-center gap-2 text-primary-700 dark:text-primary-300">
            <LockKeyhole className="h-5 w-5" />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">Secure Sign In</span>
          </div>

          <div>
            <h1 className="text-3xl text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-secondary">Login to continue building quotes.</p>
          </div>

          {justSignedUp && (
            <p className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              Account created successfully. Please log in.
            </p>
          )}

          <Field label="Email" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Password" required>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            )}
          </Field>

          <div className="-mt-1 text-right">
            <Link to="/forgot-password" className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-300">
              Forgot password?
            </Link>
          </div>

          {totpRequired && (
            <Field label="Authenticator code" required>
              {(props) => (
                <Input
                  {...props}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                  required
                  className="text-center font-mono text-lg tracking-[0.3em]"
                />
              )}
            </Field>
          )}

          {totpRequired && (
            <p className="-mt-2 text-xs text-ink-muted">
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-1 w-full">
            {loading ? 'Logging in…' : 'Login'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>

          <p className="text-center text-sm text-ink-secondary">
            New here?{' '}
            <Link to="/signup" className="font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-300">
              Create account
            </Link>
          </p>

          <p className="text-center text-xs leading-relaxed text-ink-muted">
            By signing in you agree to our{' '}
            <Link to="/legal/terms" className="underline underline-offset-2 hover:text-ink-secondary">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link to="/legal/privacy" className="underline underline-offset-2 hover:text-ink-secondary">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-4">
        <LegalFooter compact />
      </div>
    </div>
  );
};

export default LoginPage;
