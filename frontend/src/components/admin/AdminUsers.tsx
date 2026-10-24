import { useCallback, useEffect, useState } from 'react';
import { Ban, Crown, Search, ShieldCheck, UserCheck, UserRound, Users } from 'lucide-react';
import type { AdminUser } from '@/types';
import { listAdminUsers, setAdminUserActive, setAdminUserPlan, type AdminUserFilters } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { Badge, Button, Dialog, Field, Input, Select, SkeletonList } from '@/components/ui';
import { AdminTable, EmptyState, ErrorState, Pager, errorMessage, formatDate, formatDateTime } from './shared';

const PAGE = 25;

const EXPIRY_OPTIONS = [
  { value: 'none', label: 'No expiry' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
  { value: '365', label: '1 year' },
  { value: 'custom', label: 'Pick a date' },
];

const AdminUsers = ({ onPrivacy }: { onPrivacy: (userId: string) => void }) => {
  const { user: me } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AdminUserFilters>({ skip: 0, limit: PAGE });
  const [page, setPage] = useState<{ items: AdminUser[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [granting, setGranting] = useState<AdminUser | null>(null);
  const [expiry, setExpiry] = useState('none');
  const [customDate, setCustomDate] = useState('');
  const [suspending, setSuspending] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setError(null);
    listAdminUsers(filters)
      .then(setPage)
      .catch((err) => setError(errorMessage(err, 'Could not load users.')));
  }, [filters]);

  useEffect(load, [load]);

  // Debounce typing into the search box.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.q === (query.trim() || undefined) ? prev : { ...prev, q: query.trim() || undefined, skip: 0 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const replaceRow = (updated: AdminUser) =>
    setPage((prev) => prev && { ...prev, items: prev.items.map((u) => (u.id === updated.id ? { ...updated, quote_count: u.quote_count } : u)) });

  const run = async (userId: string, action: () => Promise<AdminUser>, success: string) => {
    setBusyId(userId);
    try {
      replaceRow(await action());
      toast({ message: success });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'That change did not save.') });
    } finally {
      setBusyId(null);
    }
  };

  const confirmGrant = async () => {
    if (!granting) return;
    let expiresAt: string | null = null;
    if (expiry === 'custom') {
      if (!customDate) return;
      expiresAt = new Date(`${customDate}T23:59:59`).toISOString();
    } else if (expiry !== 'none') {
      expiresAt = new Date(Date.now() + Number(expiry) * 86400000).toISOString();
    }
    const target = granting;
    setGranting(null);
    await run(target.id, () => setAdminUserPlan(target.id, 'pro', expiresAt), `Pro granted to ${target.email}`);
  };

  const revoke = async (target: AdminUser) => {
    setBusyId(target.id);
    try {
      replaceRow(await setAdminUserPlan(target.id, 'free'));
      toast({
        message: `Pro revoked for ${target.email}`,
        action: {
          label: 'Undo',
          onClick: () => {
            setAdminUserPlan(target.id, 'pro', target.plan_expires_at).then(replaceRow).catch(() => undefined);
          },
        },
      });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not revoke Pro.') });
    } finally {
      setBusyId(null);
    }
  };

  const confirmSuspend = async () => {
    if (!suspending) return;
    const target = suspending;
    setSuspending(null);
    await run(target.id, () => setAdminUserActive(target.id, false), `${target.email} suspended and signed out`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email, name or company"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Plan"
          value={filters.plan ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, plan: (e.target.value || undefined) as AdminUserFilters['plan'], skip: 0 }))}
          className="sm:!w-40"
        >
          <option value="">All plans</option>
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </Select>
        <Select
          aria-label="Status"
          value={filters.status ?? ''}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: (e.target.value || undefined) as AdminUserFilters['status'], skip: 0 }))}
          className="sm:!w-44"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !page ? (
        <SkeletonList rows={6} />
      ) : page.items.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No users match">
          Try a different search or clear the filters.
        </EmptyState>
      ) : (
        <>
          <AdminTable
            head={[
              'User',
              { label: 'Plan', className: 'hidden md:table-cell' },
              { label: 'Status', className: 'hidden lg:table-cell' },
              { label: 'Quotes', className: 'hidden 2xl:table-cell' },
              { label: 'Joined', className: 'hidden 2xl:table-cell' },
              { label: 'Last active', className: 'hidden xl:table-cell' },
              '',
            ]}
          >
            {page.items.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} className={u.is_active ? '' : 'bg-red-50/50 dark:bg-red-500/5'}>
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-medium text-ink">
                      {u.full_name}
                      {u.is_admin && (
                        <Badge tone="primary">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </Badge>
                      )}
                      {isMe && <span className="text-xs text-ink-muted">(you)</span>}
                    </p>
                    <p className="break-all text-ink-secondary">{u.email}</p>
                                        <p className="mt-1 flex flex-wrap gap-1 lg:hidden">
                      {/* Plan column is hidden below md and Status below lg; show them here instead. */}
                      <span className="md:hidden">{u.plan_active ? <Badge tone="green">Pro</Badge> : <Badge>Free</Badge>}</span>
                      {!u.is_active && <Badge tone="red">Suspended</Badge>}
                    </p>
                    <p className="text-xs text-ink-muted">{u.company_name}</p>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">
                    {u.plan_active ? (
                      <Badge tone="green">
                        <Crown className="h-3 w-3" /> Pro
                      </Badge>
                    ) : (
                      <Badge>Free</Badge>
                    )}
                    {u.plan_active && (
                      <p className="mt-1 text-xs text-ink-muted">{u.plan_expires_at ? `until ${formatDate(u.plan_expires_at)}` : 'no expiry'}</p>
                    )}
                    {!u.plan_active && u.plan === 'pro' && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">expired</p>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">
                    {u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}
                    <p className="mt-1 text-xs text-ink-muted">{u.email_verified ? 'Email verified' : 'Email unverified'}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-ink-secondary 2xl:table-cell">{u.quote_count}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-ink-secondary 2xl:table-cell">{formatDate(u.created_at)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-ink-secondary xl:table-cell">{formatDateTime(u.last_activity_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                      {u.plan_active ? (
                        <Button variant="secondary" size="sm" loading={busyId === u.id} onClick={() => revoke(u)}>
                          Revoke Pro
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          loading={busyId === u.id}
                          onClick={() => {
                            setExpiry('none');
                            setCustomDate('');
                            setGranting(u);
                          }}
                        >
                          Grant Pro
                        </Button>
                      )}
                      {u.is_active ? (
                        <Button
                          variant="danger-subtle"
                          size="sm"
                          icon={<Ban className="h-3.5 w-3.5" />}
                          disabled={isMe || u.is_admin || busyId === u.id}
                          title={isMe ? 'You cannot suspend yourself' : u.is_admin ? 'Revoke the admin role (CLI) before suspending' : undefined}
                          onClick={() => setSuspending(u)}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<UserCheck className="h-3.5 w-3.5" />}
                          loading={busyId === u.id}
                          onClick={() => run(u.id, () => setAdminUserActive(u.id, true), `${u.email} reinstated`)}
                        >
                          Reinstate
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" icon={<UserRound className="h-3.5 w-3.5" />} onClick={() => onPrivacy(u.id)}>
                        Privacy
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <Pager skip={filters.skip ?? 0} limit={PAGE} total={page.total} onChange={(skip) => setFilters((prev) => ({ ...prev, skip }))} />
        </>
      )}

      <Dialog open={granting !== null} onClose={() => setGranting(null)} labelledBy="grant-pro-title" className="max-w-md">
        <div className="space-y-4 p-6">
          <div>
            <h2 id="grant-pro-title" className="text-lg font-semibold text-ink">Grant Pro</h2>
            <p className="mt-1 text-sm text-ink-muted">{granting?.email} can quote their own CAD files immediately.</p>
          </div>
          <Field label="Access ends">
            {(props) => (
              <Select {...props} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {expiry === 'custom' && (
            <Field label="End date" required>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              )}
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setGranting(null)}>
              Cancel
            </Button>
            <Button onClick={confirmGrant} disabled={expiry === 'custom' && !customDate}>
              Grant Pro
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={suspending !== null} onClose={() => setSuspending(null)} labelledBy="suspend-title" className="max-w-md">
        <div className="space-y-4 p-6">
          <h2 id="suspend-title" className="text-lg font-semibold text-ink">Suspend {suspending?.email}?</h2>
          <p className="text-sm text-ink-secondary">
            They are signed out on every device now and cannot sign in until you reinstate them. Their quotes and data stay as they are.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmSuspend}>
              Suspend account
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
