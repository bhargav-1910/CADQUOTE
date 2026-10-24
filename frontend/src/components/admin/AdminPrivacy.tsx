import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, Search, Trash2, UserRound } from 'lucide-react';
import type { AdminPrivacySummary, AdminUser } from '@/types';
import { deleteAdminUser, exportAdminUserData, getAdminPrivacy, listAdminUsers } from '@/services/api';
import { useToast } from '@/components/Toast';
import { Badge, Button, Dialog, Field, Input, SkeletonList } from '@/components/ui';
import { AdminTable, EmptyState, ErrorState, errorMessage, formatDate, formatDateTime } from './shared';

const COUNT_LABELS: Record<string, string> = {
  quotes: 'Quotes',
  cad_files: 'CAD files',
  customers: 'Customers',
  points_ledger_entries: 'Points entries',
  consent_records: 'Consent records',
};

/** Data-subject requests: find the person, see what we hold, export or erase. */
const AdminPrivacy = ({ userId, onSelect }: { userId: string | null; onSelect: (userId: string | null) => void }) => {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUser[] | null>(null);
  const [summary, setSummary] = useState<AdminPrivacySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Search mode.
  useEffect(() => {
    if (userId) return;
    const term = query.trim();
    if (!term) {
      setResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      listAdminUsers({ q: term, limit: 10 })
        .then((page) => setResults(page.items))
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, userId]);

  // Detail mode.
  const load = useCallback(() => {
    if (!userId) return;
    setSummary(null);
    setError(null);
    getAdminPrivacy(userId)
      .then(setSummary)
      .catch((err) => setError(errorMessage(err, 'Could not load this account.')));
  }, [userId]);

  useEffect(load, [load]);

  const doExport = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      await exportAdminUserData(userId);
      toast({ message: 'Export downloaded' });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Export failed.') });
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    if (!summary) return;
    setDeleting(true);
    try {
      await deleteAdminUser(summary.user.id, confirmEmail);
      setConfirmOpen(false);
      toast({ message: `${summary.user.email} and all their data were erased` });
      onSelect(null);
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Erasure failed.') });
    } finally {
      setDeleting(false);
    }
  };

  if (!userId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          For access or erasure requests: find the account, review what is held, then export it or erase it.
        </p>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email, name or company" aria-label="Find account" className="pl-9" />
        </div>
        {results && results.length === 0 && <p className="text-sm text-ink-muted">No accounts match.</p>}
        {results && results.length > 0 && (
          <ul className="max-w-xl divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-surface">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelect(u.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-ink-subtle" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{u.email}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {u.full_name} · {u.company_name}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!summary) return <SkeletonList rows={4} />;

  const { user, counts, consents } = summary;
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => onSelect(null)}>
        Find another account
      </Button>

      <div className="flex flex-col gap-4 rounded-2xl border border-edge bg-surface p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-semibold text-ink">{user.full_name}</p>
          <p className="text-ink-secondary">{user.email}</p>
          <p className="text-sm text-ink-muted">
            {user.company_name} · joined {formatDate(user.created_at)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}
            {user.plan_active ? <Badge tone="green">Pro</Badge> : <Badge>Free</Badge>}
            {user.is_admin && <Badge tone="primary">Admin</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={doExport}>
            Export data
          </Button>
          <Button
            variant="danger-subtle"
            icon={<Trash2 className="h-4 w-4" />}
            disabled={user.is_admin}
            title={user.is_admin ? 'Revoke the admin role (CLI) before erasing this account' : undefined}
            onClick={() => {
              setConfirmEmail('');
              setConfirmOpen(true);
            }}
          >
            Delete account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="rounded-2xl border border-edge bg-surface p-4">
            <p className="text-xs font-medium text-ink-muted">{COUNT_LABELS[key] ?? key}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-ink">Cookie consent history</h2>
        {consents.length === 0 ? (
          <EmptyState icon={<UserRound className="h-6 w-6" />} title="No consent records while signed in" />
        ) : (
          <AdminTable head={['When', 'Policy', 'Preferences', 'Analytics', 'Marketing', 'Source']} minWidth={640}>
            {consents.map((c, index) => (
              <tr key={index}>
                <td className="px-4 py-3 text-ink-secondary">{formatDateTime(c.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{c.policy_version}</td>
                {[c.preferences, c.analytics, c.marketing].map((on, i) => (
                  <td key={i} className="px-4 py-3">
                    {on ? <Badge tone="green">Allowed</Badge> : <Badge>Declined</Badge>}
                  </td>
                ))}
                <td className="px-4 py-3 text-ink-secondary">{c.source}</td>
              </tr>
            ))}
          </AdminTable>
        )}
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} labelledBy="erase-title" className="max-w-md">
        <div className="space-y-4 p-6">
          <h2 id="erase-title" className="text-lg font-semibold text-ink">Erase this account permanently?</h2>
          <p className="text-sm text-ink-secondary">
            Deletes {user.email} with every quote, CAD file, PDF, customer record and points balance. This cannot be undone.
            Export the data first if the request asked for a copy.
          </p>
          <Field label={`Type ${user.email} to confirm`}>
            {(props) => <Input {...props} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()}
              onClick={doDelete}
            >
              Erase account
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default AdminPrivacy;
