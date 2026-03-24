import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, ArrowLeft } from 'lucide-react';
import { resetPassword } from '@/services/api';

const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError('Reset token is missing. Please use the link from your email.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await resetPassword({ token, new_password: newPassword });
      setMessage(response.message);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-amber-50 via-white to-sky-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/60">
        <div className="flex items-center gap-2 text-amber-700">
          <KeyRound className="h-5 w-5" />
          <span className="text-sm font-medium">Set New Password</span>
        </div>

        <h1 className="mt-3 font-display text-3xl text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a strong password to secure your account.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-700">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={10}
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500"
            />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-500 py-2.5 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? 'Resetting...' : 'Reset password'}
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

export default ResetPasswordPage;
