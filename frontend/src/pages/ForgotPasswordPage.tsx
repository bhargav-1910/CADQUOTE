import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { requestPasswordReset } from '@/services/api';
import LegalFooter from '@/components/LegalFooter';

const blueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(143,174,245,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.05) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
};

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      // The API answers identically for known and unknown addresses, and so
      // does this screen — revealing which emails are registered here would
      // undo that.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset instructions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden bg-[#0A0A0C] p-4 sm:p-6"
      style={blueprintGrid}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-white shadow-2xl shadow-black/60">
        <div className="flex flex-col gap-4 p-6 sm:p-9">
          <div className="flex items-center gap-2 text-sky-700">
            <KeyRound className="h-5 w-5" aria-hidden />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">
              Password recovery
            </span>
          </div>

          {sent ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <h1 className="font-display text-lg text-emerald-900">Check your inbox</h1>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-800">
                    If an account exists for that email, we've sent password reset instructions.
                    The link expires in 15 minutes and can be used once.
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Didn't get it? Check spam, then{' '}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="font-semibold text-sky-700 hover:text-sky-800"
                >
                  try again
                </button>
                .
              </p>
            </>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <h1 className="font-display text-2xl text-slate-900">Forgot your password?</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Enter your email and we'll send a link to set a new one.
                </p>
              </div>

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

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button type="submit" variant="accent" size="lg" loading={loading} className="w-full">
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}

          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to sign in
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <LegalFooter compact />
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
