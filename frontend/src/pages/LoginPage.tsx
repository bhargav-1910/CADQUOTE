import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Button, Field, Input, PasswordInput } from '@/components/ui';

// Same blueprint-grid texture as the landing hero, so auth feels like the
// same product the visitor just left.
const blueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(143,174,245,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.05) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
};

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/workspace';
  const justSignedUp = Boolean(location.state?.justSignedUp);
  const prefillEmail = (location.state?.email as string | undefined) ?? '';

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center overflow-x-hidden bg-[#0A0A0C] p-4 sm:p-6" style={blueprintGrid}>
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0E0E11] shadow-2xl shadow-black/60 md:grid-cols-2">
        <aside className="relative hidden border-r border-slate-800/80 p-8 md:flex md:flex-col md:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white">
                <Box className="h-5 w-5" />
              </span>
              <span className="font-display text-2xl text-white">ForgeQuote</span>
            </Link>
            <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#8FAEF5]">
              SEC-01 // Workspace Access
            </p>
            <h2 className="mt-3 max-w-sm font-display text-3xl leading-tight text-white">
              Back to the <span className="text-[#A8C2FF]">shop floor.</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              Upload CAD, price the job, send the quote — every rupee itemized.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#131317] p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Session security</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Access-token rotation with automatic logout on invalid refresh.
            </p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex w-full flex-col justify-center gap-4 bg-white p-6 sm:p-9">
          <div className="mb-1 flex items-center gap-2 text-sky-700">
            <LockKeyhole className="h-5 w-5" />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">Secure Sign In</span>
          </div>

          <div>
            <h1 className="font-display text-3xl text-slate-900">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-600">Login to continue building quotes.</p>
          </div>

          {justSignedUp && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
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

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-1 w-full">
            {loading ? 'Logging in…' : 'Login'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>

          <p className="text-center text-sm text-slate-600">
            New here?{' '}
            <Link to="/signup" className="font-semibold text-sky-700 hover:text-sky-800">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
