import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CreditCard, LayoutDashboard, ScrollText, ShieldCheck, SlidersHorizontal, UserRound, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AdminOverview from '@/components/admin/AdminOverview';
import AdminUsers from '@/components/admin/AdminUsers';
import AdminPackages from '@/components/admin/AdminPackages';
import AdminCadFailures from '@/components/admin/AdminCadFailures';
import AdminAuditLog from '@/components/admin/AdminAuditLog';
import AdminPrivacy from '@/components/admin/AdminPrivacy';
import AdminPricing from '@/pages/AdminPricing';

const TABS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'packages', label: 'Points packages', icon: CreditCard },
  { id: 'rates', label: 'Default rates', icon: SlidersHorizontal },
  { id: 'cad', label: 'Failed CAD', icon: AlertTriangle },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
  { id: 'privacy', label: 'Privacy', icon: UserRound },
];

/**
 * Platform administration. Admin-only by route and, independently, by every
 * API call behind it. The active tab lives in the URL (?tab=) so a section can
 * be linked or bookmarked.
 */
const AdminPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'overview';

  const go = (id: string, extra: Record<string, string> = {}) => setParams({ tab: id, ...extra });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Admin</h1>
          <p className="text-sm text-ink-muted">Platform-wide controls. Every change here is recorded in the audit log.</p>
        </div>
      </div>

      <nav aria-label="Admin sections" className="flex flex-wrap gap-1 rounded-xl border border-edge bg-surface p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${
              tab === id ? 'bg-primary-600 text-white' : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <AdminOverview onOpen={go} />}
      {tab === 'users' && <AdminUsers onPrivacy={(userId) => go('privacy', { user: userId })} />}
      {tab === 'packages' && <AdminPackages />}
      {tab === 'rates' && <AdminPricing scope="global" />}
      {tab === 'cad' && <AdminCadFailures />}
      {tab === 'audit' && <AdminAuditLog />}
      {tab === 'privacy' && <AdminPrivacy userId={params.get('user')} onSelect={(userId) => go('privacy', userId ? { user: userId } : {})} />}
    </div>
  );
};

export default AdminPage;
