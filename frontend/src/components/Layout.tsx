import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Upload,
  FolderOpen,
  Settings,
  User,
  Layers,
  LogOut,
  Building2,
  Mail,
  CreditCard,
  Moon,
  Sun,
  Search,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import ProfileEditModal from '@/components/ProfileEditModal';
import CommandPalette from '@/components/CommandPalette';

interface LayoutProps {
  children: ReactNode;
}

const NAV = [
  { path: '/workspace', icon: Upload, label: 'Dashboard', exact: true },
  { path: '/quote', icon: Layers, label: 'New Quote', exact: true },
  { path: '/quotes', icon: FolderOpen, label: 'My Quotes', exact: false },
  { path: '/admin/pricing', icon: Settings, label: 'Cost Master', exact: false },
  { path: '/billing', icon: CreditCard, label: 'Billing', exact: false },
];

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
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
        aria-expanded={profileMenuOpen}
        aria-haspopup="menu"
      >
        <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          {user?.company_logo_url ? (
            <img src={user.company_logo_url} alt="" className="w-full h-full rounded-lg object-contain bg-white" />
          ) : (
            <User className="w-4 h-4" />
          )}
        </span>
        <span className="min-w-0 text-left hidden lg:block">
          <span className="block text-xs font-semibold truncate text-slate-200">{user?.full_name || 'User'}</span>
          <span className="block text-[10px] text-slate-500 truncate">{user?.company_name || 'Workspace'}</span>
        </span>
      </button>

      {profileMenuOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-2 z-50" role="menu">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'User'}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{user?.email || 'No email'}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
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
            className="w-full mt-1 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
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
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-slate-950 border-r border-slate-800/80">
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
            <p className="text-[11px] text-slate-500 leading-none mt-1">CNC Cost Studio</p>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-500 hover:border-slate-700 hover:text-slate-300 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-semibold border border-slate-700 rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>

        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ path, icon: Icon, label, exact }) => {
            const active = isActive(path, exact);
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-sky-600/15 text-sky-300 border border-sky-500/25'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-1 border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-slate-100 transition-colors"
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
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setProfileSettingsOpen(true)}
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white/80 text-slate-600 flex items-center justify-center"
            >
              <User className="w-4 h-4" />
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onToggleTheme={toggleTheme} />

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 surface-strong border border-slate-200 rounded-2xl p-1.5 shadow-lg">
        <div className="flex items-center gap-1.5">
          {NAV.map(({ path, icon: Icon, label, exact }) => {
            const active = isActive(path, exact);
            return (
              <Link
                key={path}
                to={path}
                className={`px-2.5 py-2 rounded-xl ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              logout();
            }}
            className="px-2.5 py-2 rounded-xl text-red-500"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
