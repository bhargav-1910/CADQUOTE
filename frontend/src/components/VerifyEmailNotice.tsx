import { useState } from 'react';
import { MailCheck, MailWarning } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { resendVerification } from '@/services/api';

/**
 * Prompts an unverified account to confirm its address.
 *
 * Verification is not required for everyday use — it gates privileged roles —
 * so this is a nudge rather than a blocking wall.
 */
const VerifyEmailNotice = () => {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.email_verified) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <MailCheck className="h-4 w-4" />
        Email address confirmed.
      </p>
    );
  }

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await resendVerification();
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the confirmation email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <MailWarning className="h-4 w-4" />
        Confirm your email address
      </p>
      <p className="mt-1 text-sm leading-relaxed text-amber-800">
        We sent a confirmation link to <strong>{user.email}</strong>. Confirming keeps account
        recovery working and is required before an administrator role takes effect.
      </p>
      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Resend confirmation email'}
      </button>
    </div>
  );
};

export default VerifyEmailNotice;
