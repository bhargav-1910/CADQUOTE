import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { verifyEmail } from '@/services/api';

type State = 'working' | 'done' | 'failed';

/**
 * Lands from the confirmation link in the signup email.
 *
 * The token is consumed on mount. React 18 StrictMode double-invokes effects
 * in development, and the token is single-use, so a ref guards against the
 * second call turning a successful confirmation into a spurious failure.
 */
const VerifyEmailPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState('failed');
      setMessage('This link is missing its confirmation token.');
      return;
    }

    verifyEmail(token)
      .then((result) => {
        setState('done');
        setMessage(result.message);
      })
      .catch((error: unknown) => {
        setState('failed');
        setMessage(
          error instanceof Error
            ? error.message
            : 'This confirmation link is invalid or has expired.',
        );
      });
  }, [token]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0A0A0C] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0E0E11] p-8 text-center">
        {state === 'working' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-500" />
            <h1 className="mt-4 font-display text-2xl text-white">Confirming your email…</h1>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 font-display text-2xl text-white">Email confirmed</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
            <Link
              to="/workspace"
              className="mt-6 inline-block rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Go to workspace
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-4 font-display text-2xl text-white">Confirmation failed</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
            <p className="mt-4 text-sm text-slate-400">
              Sign in and request a fresh link from Settings.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;
