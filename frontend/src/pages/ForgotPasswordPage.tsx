import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { requestPasswordReset } from '@/services/api';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await requestPasswordReset({ email });
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-sky-50 via-white to-amber-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/60">
        <div className="flex items-center gap-2 text-sky-700">
          <Mail className="h-5 w-5" />
          <span className="text-sm font-medium">Password Recovery</span>
        </div>

        <h1 className="mt-3 font-display text-3xl text-slate-900">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter your account email and we will send you a reset link.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-sky-600 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
