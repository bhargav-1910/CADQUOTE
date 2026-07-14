import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  FolderOpen,
  Settings,
  User,
  Layers,
  LogOut,
  Building2,
  Mail,
  CreditCard,
  Users,
  Moon,
  Sun,
  Search,
  Lock,
  Sparkles,
  LayoutDashboard,
  SlidersHorizontal,
  Plus,
  Bell,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';
import { useAuth } from '@/components/AuthProvider';
import ProfileEditModal from '@/components/ProfileEditModal';
import CommandPalette from '@/components/CommandPalette';

interface LayoutProps {
  children: ReactNode;
}

const NAV = [
  { path: '/workspace', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { path: '/quote', icon: Layers, label: 'New Quote', exact: true },
  { path: '/quotes', icon: FolderOpen, label: 'My Quotes', exact: false },
  { path: '/customers', icon: Users, label: 'Customers', exact: false },
  { path: '/admin/pricing', icon: SlidersHorizontal, label: 'Cost Master', exact: false },
  { path: '/billing', icon: CreditCard, label: 'Billing', exact: false },
];

// Desktop sidebar renders NAV grouped; New Quote is promoted to a CTA button.
const NAV_GROUPS: Array<{ label: string; paths: string[] }> = [
  { label: 'Workspace', paths: ['/workspace', '/quotes', '/customers'] },
  { label: 'Setup', paths: ['/admin/pricing', '/billing'] },
];

const RESPONSES_SEEN_KEY = 'fq-responses-seen';

const THEME_KEY = 'fq-theme';

const getInitialTheme = (): 'light' | 'dark' => {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'light';
};

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [responsesBadge, setResponsesBadge] = useState(0);
  const [notifQuotes, setNotifQuotes] = useState<QuoteListItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const isFreePlan = user?.plan !== 'pro';

  // "Responses waiting" badge: customer accept/declines newer than the last
  // visit to My Quotes. Cleared (and remembered) whenever that page is open
  // or the bell is opened. Same fetch feeds the notification dropdown.
  // Polled every 60s (and on window focus) so responses arriving while the
  // app is open surface without a reload.
  useEffect(() => {
    const load = () => {
      listQuotes(0, 50)
        .then((quotes) => {
          setNotifQuotes(quotes);
          const lastSeen = Number(localStorage.getItem(RESPONSES_SEEN_KEY) || 0);
          setResponsesBadge(
            quotes.filter(
              (q) =>
                (q.status === 'accepted' || q.status === 'declined') &&
                q.responded_at &&
                new Date(q.responded_at).getTime() > lastSeen,
            ).length,
          );
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', load);
    };
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/quotes')) {
      localStorage.setItem(RESPONSES_SEEN_KEY, String(Date.now()));
      setResponsesBadge(0);
    }
  }, [location.pathname]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const openNotifications = () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen) {
      localStorage.setItem(RESPONSES_SEEN_KEY, String(Date.now()));
      setResponsesBadge(0);
    }
  };

  const notifResponses = notifQuotes
    .filter((q) => (q.status === 'accepted' || q.status === 'declined') && q.responded_at)
    .sort((a, b) => new Date(b.responded_at!).getTime() - new Date(a.responded_at!).getTime())
    .slice(0, 5);
  const notifExpiring = notifQuotes
    .filter((q) => {
      if (q.status !== 'sent' && q.status !== 'generated') return false;
      const validUntil = new Date(q.valid_until).getTime();
      return validUntil > Date.now() && validUntil - Date.now() < 7 * 86400000;
    })
    .sort((a, b) => new Date(a.valid_until).getTime() - new Date(b.valid_until).getTime())
    .slice(0, 5);

  // The API client fires this whenever the backend answers 402 to a gated
  // action — one global prompt instead of per-page handling.
  useEffect(() => {
    const onSubscriptionRequired = () => setUpgradeOpen(true);
    window.addEventListener('billing:subscription-required', onSubscriptionRequired);
    return () => window.removeEventListener('billing:subscription-required', onSubscriptionRequired);
  }, []);

  // Pages can request the profile modal (e.g. the complete-your-profile
  // banner); fresh signups get it opened for them once.
  useEffect(() => {
    const onOpenProfile = () => setProfileSettingsOpen(true);
    window.addEventListener('profile:open', onOpenProfile);
    return () => window.removeEventListener('profile:open', onOpenProfile);
  }, []);

  useEffect(() => {
    if ((location.state as { justSignedUp?: boolean } | null)?.justSignedUp) {
      setProfileSettingsOpen(true);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      const target = event.target as Node | null;
      if (target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const profileMenu = (
    <div className="relative" ref={profileMenuRef}>
      <button
        type="button"
        onClick={() => setProfileMenuOpen((open) => !open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-zinc-300 hover:bg-zinc-800/80 hover:text-white transition-colors"
        aria-expanded={profileMenuOpen}
        aria-haspopup="menu"
      >
        <span className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          {user?.company_logo_url ? (
            <img src={user.company_logo_url} alt="" className="w-full h-full rounded-lg object-contain bg-white" />
          ) : (
            <User className="w-4 h-4" />
          )}
        </span>
        <span className="min-w-0 text-left hidden lg:block">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
            <span className="truncate">{user?.full_name || 'User'}</span>
            {!isFreePlan && (
              <span className="shrink-0 rounded border border-sky-500/40 bg-sky-500/15 px-1 py-px text-[9px] font-bold tracking-wide text-sky-300">
                PRO
              </span>
            )}
          </span>
          <span className="block text-[10px] text-zinc-500 truncate">{user?.company_name || 'Workspace'}</span>
        </span>
      </button>

      {profileMenuOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-2 z-50" role="menu">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'User'}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{user?.email || 'No email'}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <Building2 className="w-3.5 h-3.5" />
              <span className="truncate">{user?.company_name || 'No company'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setProfileMenuOpen(false);
              setProfileSettingsOpen(true);
            }}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
            role="menuitem"
          >
            <Settings className="w-4 h-4" />
            Profile Settings
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileMenuOpen(false);
              logout();
            }}
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2"
            role="menuitem"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen relative">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-[#0b0c0f] border-r border-zinc-800/80">
        <Link to="/workspace" className="flex items-center gap-3 px-4 py-5 group">
          <div
            className="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-lg shadow-sky-900/40 group-hover:scale-105 transition-transform"
            style={
              user?.brand_color
                ? { backgroundColor: user.brand_color }
                : { background: 'linear-gradient(to bottom right, #0ea5e9, #0369a1)' }
            }
          >
            <Box className="w-5 h-5" />
          </div>
          <div>
            <p className="font-display font-semibold text-white leading-none">
              {user?.company_name || 'ForgeQuote'}
            </p>
            <p className="text-[11px] text-zinc-500 leading-none mt-1">CNC Cost Studio</p>
          </div>
        </Link>

        <div className="mx-3 mb-3 flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] font-semibold border border-zinc-700 rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              className="relative h-full w-9 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              {responsesBadge > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-400 border-2 border-[#0b0c0f]" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute left-full top-0 ml-2 w-80 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl p-2 z-50">
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Customer responses
                </p>
                {notifResponses.length === 0 ? (
                  <p className="px-3 pb-2 text-xs text-zinc-500">No responses yet.</p>
                ) : (
                  notifResponses.map((q) => (
                    <Link
                      key={q.id}
                      to={`/quotes/${q.id}`}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-zinc-800 transition-colors"
                    >
                      {q.status === 'accepted' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-zinc-200 truncate">
                          {q.quote_number} {q.status === 'accepted' ? 'accepted' : 'declined'}
                        </span>
                        <span className="block text-[11px] text-zinc-500 truncate">
                          {q.customer_name || 'No customer'} ·{' '}
                          {new Date(q.responded_at!).toLocaleDateString('en-IN')}
                        </span>
                      </span>
                    </Link>
                  ))
                )}

                <p className="px-3 py-1.5 mt-1 border-t border-zinc-800 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Expiring within 7 days
                </p>
                {notifExpiring.length === 0 ? (
                  <p className="px-3 pb-2 text-xs text-zinc-500">Nothing expiring this week.</p>
                ) : (
                  notifExpiring.map((q) => (
                    <Link
                      key={q.id}
                      to={`/quotes/${q.id}`}
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-zinc-800 transition-colors"
                    >
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-zinc-200 truncate">{q.quote_number}</span>
                        <span className="block text-[11px] text-zinc-500 truncate">
                          valid until {new Date(q.valid_until).toLocaleDateString('en-IN')}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <Link
          to="/quote"
          className="mx-3 mb-4 flex items-center justify-center gap-2 rounded-xl bg-accent-400 px-3 py-2.5 text-sm font-semibold text-slate-950 shadow-sm hover:bg-accent-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Quote
        </Link>

        <nav className="flex-1 px-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {group.label}
              </p>
              <div className="space-y-1">
                {NAV.filter((item) => group.paths.includes(item.path)).map(
                  ({ path, icon: Icon, label, exact }) => {
                    const active = isActive(path, exact);
                    return (
                      <Link
                        key={path}
                        to={path}
                        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          active
                            ? 'bg-sky-600/15 text-sky-300 border border-sky-500/25'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 border border-transparent'
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-sky-400" />
                        )}
                        <Icon className="w-4 h-4" />
                        {label}
                        {path === '/quotes' && responsesBadge > 0 && (
                          <span className="ml-auto rounded-full bg-sky-500/20 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-bold leading-none text-sky-300">
                            {responsesBadge}
                          </span>
                        )}
                      </Link>
                    );
                  },
                )}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 pb-4 space-y-1 border-t border-zinc-800/80 pt-3">
          {isFreePlan && (
            <Link
              to="/billing"
              className="block mb-2 rounded-xl border border-sky-500/30 bg-sky-600/10 px-3 py-2.5 hover:bg-sky-600/20 transition-colors"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Sparkles className="w-3.5 h-3.5" />
                Free plan
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Sample part only. Upgrade to quote your own CAD files.
              </p>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {profileMenu}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-slate-200/70 surface-panel">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/workspace" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white flex items-center justify-center">
              <Box className="w-5 h-5" />
            </div>
            <p className="font-display font-semibold text-slate-900 leading-none">ForgeQuote</p>
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="w-11 h-11 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-11 h-11 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setProfileSettingsOpen(true)}
              aria-label="Profile settings"
              className="w-11 h-11 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              <User className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={logout}
              aria-label="Logout"
              className="w-11 h-11 rounded-lg border border-red-200 bg-white/80 text-red-500 flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="lg:pl-60 w-full pb-24 lg:pb-6 relative z-10 min-h-screen">
        {children}
      </main>

      <ProfileEditModal
        open={profileSettingsOpen}
        onClose={() => setProfileSettingsOpen(false)}
      />

      {/* Subscription-required prompt (triggered by any gated 402) */}
      {upgradeOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setUpgradeOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Subscription required"
          >
            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">Subscription required</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Your free plan includes the sample part so you can try the full quoting flow.
              To upload and quote your own CAD files, upgrade to a plan.
            </p>
            <div className="mt-5 flex gap-2">
              <Link
                to="/billing"
                onClick={() => setUpgradeOpen(false)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                View plans
              </Link>
              <button
                type="button"
                onClick={() => setUpgradeOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onToggleTheme={toggleTheme} />

      {/* Mobile bottom nav — labeled, top-level destinations only */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 surface-strong border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="flex items-stretch justify-around px-1 py-1">
          {NAV.map(({ path, icon: Icon, label, exact }) => {
            const active = isActive(path, exact);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors ${
                  active ? 'text-sky-700 bg-sky-600/10' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
