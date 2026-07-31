import { FormEvent, useEffect, useState } from 'react';
import { Copy, Loader2, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import {
  disableTotp,
  enableTotp,
  getTotpStatus,
  setupTotp,
  type TotpSetup,
  type TotpStatus,
} from '@/services/api';

/**
 * Two-factor authentication enrolment and removal.
 *
 * The secret and recovery codes are shown exactly once, at setup — the server
 * stores only hashes of the codes, so they cannot be re-displayed later. The
 * flow deliberately does not activate 2FA until a valid code is submitted, so
 * a half-finished enrolment can never lock anyone out of their account.
 */
const TwoFactorSection = () => {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () =>
    getTotpStatus()
      .then(setStatus)
      .catch(() => setError('Could not load two-factor status'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  const beginSetup = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSetup(await setupTotp());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start setup');
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await enableTotp(code);
      setNotice(result.message);
      setSetup(null);
      setCode('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable two-factor authentication');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await disableTotp(password);
      setNotice(result.message);
      setPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable two-factor authentication');
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.backup_codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the codes and copy them manually.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading two-factor status…
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        {status?.enabled ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        )}
        <div>
          <h3 className="font-semibold text-slate-900">Two-factor authentication</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {status?.enabled
              ? `On. ${status.backup_codes_remaining} recovery code${
                  status.backup_codes_remaining === 1 ? '' : 's'
                } left.`
              : 'Off. Add a second step so a stolen password alone cannot sign in.'}
          </p>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Enrolment: secret + recovery codes, shown once. */}
      {!status?.enabled && setup && (
        <form onSubmit={confirmSetup} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Smartphone className="h-4 w-4" /> 1. Add this key to your authenticator app
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Google Authenticator, Authy, 1Password — any of them. Enter the key manually:
            </p>
            <code className="mt-2 block break-all rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wide text-slate-900">
              {setup.secret}
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">2. Save your recovery codes</p>
              <button
                type="button"
                onClick={copyCodes}
                className="flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy all'}
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Each works once if you lose your phone. <strong>They are shown only now</strong> —
              store them somewhere safe.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800">
              {setup.backup_codes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>
          </div>

          <div>
            <label htmlFor="totp-code" className="text-sm font-semibold text-slate-800">
              3. Enter the 6-digit code to confirm
            </label>
            <input
              id="totp-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              className="mt-1.5 w-40 rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Turn on two-factor
            </button>
            <button
              type="button"
              onClick={() => setSetup(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!status?.enabled && !setup && (
        <button
          type="button"
          onClick={beginSetup}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Set up two-factor authentication
        </button>
      )}

      {status?.enabled && (
        <form onSubmit={turnOff} className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="totp-off-password" className="text-sm text-slate-600">
              Confirm your password to turn it off
            </label>
            <input
              id="totp-off-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1.5 w-full min-w-[15rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Turn off
          </button>
        </form>
      )}
    </section>
  );
};

export default TwoFactorSection;
