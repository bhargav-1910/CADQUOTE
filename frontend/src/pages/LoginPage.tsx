import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

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
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-sky-50 via-white to-amber-50 p-4 sm:p-6">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 md:grid-cols-2">
        <aside className="relative hidden p-8 md:flex md:flex-col md:justify-between">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sky-100 via-white to-amber-100" />
          <div>
            <p className="font-display text-3xl text-slate-900">ForgeQuote</p>
            <p className="mt-2 max-w-sm text-sm text-slate-600">Secure access to your CNC quotation workspace.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
            <p className="text-sm text-slate-600">Session security includes access-token rotation and automatic logout on invalid refresh.</p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex w-full flex-col justify-center gap-4 p-6 sm:p-9">
          <div className="mb-1 flex items-center gap-2 text-sky-700">
            <LockKeyhole className="h-5 w-5" />
            <span className="text-sm font-medium">Secure Sign In</span>
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

          <label className="block text-sm text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500"
            />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-center text-sm text-slate-600">
            New here? <Link to="/signup" className="font-semibold text-sky-700">Create account</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
