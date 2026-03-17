import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Upload, FolderOpen, Settings, User, Layers } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const NAV = [
  { path: '/',            icon: Upload,     label: 'File Upload',  exact: true },
  { path: '/quotes',      icon: FolderOpen, label: 'My Quotes',    exact: false },
  { path: '/quote',       icon: Layers,     label: 'New Quote',    exact: true },
  { path: '/admin/pricing', icon: Settings, label: 'Cost Master',  exact: false },
];

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Left Sidebar ── */}
      <aside className="w-[68px] bg-white border-r border-gray-100 flex flex-col items-center py-4 gap-1 shrink-0 z-40">

        {/* Logo */}
        <Link to="/" className="mb-4 flex items-center justify-center w-10 h-10 bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors">
          <Box className="w-5 h-5 text-white" />
        </Link>

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV.map(({ path, icon: Icon, label, exact }) => {
            const active = isActive(path, exact);
            return (
              <Link
                key={path}
                to={path}
                title={label}
                className={`group relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                  {label}
                </span>
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary-600 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom – user + credits */}
        <div className="flex flex-col items-center gap-2 mt-auto">
          {/* Credits badge */}
          <div className="flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl bg-primary-50 w-12 text-center">
            <span className="text-[10px] font-bold text-primary-600 leading-tight">FREE</span>
            <span className="text-[9px] text-primary-400 leading-tight">Plan</span>
          </div>

          {/* User icon */}
          <Link
            to="/"
            title="Account"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </aside>

      {/* ── Main scrollable area ── */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default Layout;
