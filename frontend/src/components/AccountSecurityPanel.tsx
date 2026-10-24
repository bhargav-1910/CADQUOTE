import { FormEvent, useState } from 'react';
import { AlertTriangle, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import PasswordRequirements, { meetsPasswordPolicy } from '@/components/PasswordRequirements';
import TwoFactorSection from '@/components/TwoFactorSection';
import VerifyEmailNotice from '@/components/VerifyEmailNotice';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
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
    <div className="space-y-6 border-t border-edge px-6 py-6">
      <VerifyEmailNotice />
      <TwoFactorSection />
      <hr className="border-edge" />
      <section>
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <KeyRound className="h-4 w-4" aria-hidden />
          Change password
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Changing your password signs out every device, including this one.
        </p>

        {pwDone ? (
          <p className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Password updated. Signing you out…
          </p>
        ) : (
          <form onSubmit={onChangePassword} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Current password">
                {(props) => (
                  <PasswordInput {...props} autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                )}
              </Field>
              <Field label="New password">
                {(props) => (
                  <PasswordInput {...props} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} />
                )}
              </Field>
            </div>

            {newPassword.length > 0 && <PasswordRequirements value={newPassword} />}

            {pwError && (
              <p role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {pwError}
              </p>
            )}

            <Button type="submit" loading={pwSaving}>
              Update password
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-red-900 dark:text-red-300">
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete account
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-red-800 dark:text-red-300">
          Permanently deletes {user?.email ? <strong>{user.email}</strong> : 'your account'} along
          with every CAD file, quotation, generated PDF, customer record and points balance. This
          cannot be undone.
        </p>

        {!deleteOpen ? (
          <Button variant="danger-subtle" onClick={() => setDeleteOpen(true)} className="mt-3">
            Delete my account
          </Button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-500/30 bg-surface px-3 py-2 text-sm text-red-800 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Confirm with your password and type DELETE to proceed.</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Password">
                {(props) => (
                  <PasswordInput {...props} autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
                )}
              </Field>
              <Field label="Type DELETE">
                {(props) => (
                  <Input {...props} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" autoComplete="off" />
                )}
              </Field>
            </div>

            {deleteError && (
              <p role="alert" className="rounded-lg border border-red-300 dark:border-red-500/30 bg-surface px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {deleteError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                onClick={onDelete}
                loading={deleting}
                disabled={deleteConfirm.trim().toUpperCase() !== 'DELETE' || !deletePassword}
              >
                Permanently delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeletePassword('');
                  setDeleteConfirm('');
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AccountSecurityPanel;
