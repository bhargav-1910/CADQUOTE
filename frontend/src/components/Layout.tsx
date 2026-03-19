import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Upload, FolderOpen, Settings, User, Layers } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const NAV = [
  { path: '/', icon: Upload, label: 'Upload Hub', exact: true },
  { path: '/quote', icon: Layers, label: 'New Quote', exact: true },
  { path: '/quotes', icon: FolderOpen, label: 'My Quotes', exact: false },
  { path: '/admin/pricing', icon: Settings, label: 'Cost Master', exact: false },
];

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-r from-sky-200/30 via-transparent to-orange-200/30" />

      <header className="sticky top-0 z-40 border-b border-slate-200/70 surface-panel">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm group-hover:bg-slate-800 transition-colors">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <p className="font-display font-semibold text-slate-900 leading-none">ForgeQuote</p>
                <p className="text-[11px] text-slate-500 leading-none mt-1">CNC Cost Studio</p>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-2">
              {NAV.map(({ path, icon: Icon, label, exact }) => {
                const active = isActive(path, exact);

                return (
                  <Link
                    key={path}
                    to={path}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end px-3 py-1.5 rounded-lg bg-white/80 border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-700">Workspace</span>
                <span className="text-[10px] text-slate-500">Production</span>
              </div>

              <Link
                to="/"
                title="Account"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <User className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="lg:hidden mt-3 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max pb-1">
              {NAV.map(({ path, icon: Icon, label, exact }) => {
                const active = isActive(path, exact);
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-white/80 text-slate-700 border border-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto pb-24 lg:pb-10 relative z-10">
        {children}
      </main>

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
        </div>
      </nav>
    </div>
  );
};

export default Layout;
