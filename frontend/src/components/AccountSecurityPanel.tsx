import { FormEvent, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import PasswordRequirements, { meetsPasswordPolicy } from '@/components/PasswordRequirements';
import TwoFactorSection from '@/components/TwoFactorSection';
import VerifyEmailNotice from '@/components/VerifyEmailNotice';
import { changePassword, clearAuthTokens, deleteAccount } from '@/services/api';

/**
 * Account security controls: change password and delete account.
 *
 * Both actions end the current session, so each one signs the user out and
 * sends them back to the landing page rather than leaving a dead UI behind.
 */
const AccountSecurityPanel = () => {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const signOutAndLeave = (destination: string) => {
    clearAuthTokens();
    try {
      localStorage.removeItem('forgequote.auth.user-profile');
    } catch {
      /* storage unavailable; the redirect below still ends the session */
    }
    window.location.href = destination;
  };

  const onChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwError(null);

    if (!meetsPasswordPolicy(newPassword)) {
      setPwError('New password does not meet the requirements below.');
      return;
    }

    setPwSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwDone(true);
      // The server invalidated every session including this one.
      window.setTimeout(() => signOutAndLeave('/login'), 1800);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPwSaving(false);
    }
  };

  const onDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword, deleteConfirm);
      signOutAndLeave('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the account');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 border-t border-slate-100 px-6 py-6">
      <VerifyEmailNotice />
      <TwoFactorSection />
      <hr className="border-slate-200" />
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <KeyRound className="h-4 w-4" aria-hidden />
          Change password
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Changing your password signs out every device, including this one.
        </p>

        {pwDone ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Password updated. Signing you out…
          </p>
        ) : (
          <form onSubmit={onChangePassword} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="font-medium">Current password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none"
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="font-medium">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none"
                />
              </label>
            </div>

            {newPassword.length > 0 && <PasswordRequirements value={newPassword} />}

            {pwError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {pwError}
              </p>
            )}

            <button
              type="submit"
              disabled={pwSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {pwSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Update password
            </button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50/60 p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-red-900">
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete account
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-red-800">
          Permanently deletes {user?.email ? <strong>{user.email}</strong> : 'your account'} along
          with every CAD file, quotation, generated PDF, customer record and points balance. This
          cannot be undone.
        </p>

        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Confirm with your password and type DELETE to proceed.</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-red-900">
                <span className="font-medium">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none"
                />
              </label>
              <label className="text-sm text-red-900">
                <span className="font-medium">Type DELETE</span>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-slate-900 focus:border-red-500 focus:outline-none"
                />
              </label>
            </div>

            {deleteError && (
              <p role="alert" className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-700">
                {deleteError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE' || !deletePassword}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Permanently delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeletePassword('');
                  setDeleteConfirm('');
                  setDeleteError(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AccountSecurityPanel;
