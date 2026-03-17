import { useState, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Home, List, Settings, PlusCircle, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const mainNav = [
    { path: '/', label: 'Home', icon: Home, exact: true },
    { path: '/quote', label: 'New Quote', icon: PlusCircle, exact: true },
    { path: '/quotes', label: 'My Quotes', icon: List, exact: false },
  ];

  const isActive = (path: string, exact: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <Box className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-gray-900 leading-tight">CNC Quote</p>
                <p className="text-[11px] text-gray-400 leading-tight">Instant Pricing Platform</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5">
              {mainNav.map(({ path, label, icon: Icon, exact }) => {
                const active = isActive(path, exact);
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}

              {/* Divider */}
              <span className="w-px h-5 bg-gray-200 mx-2" />

              {/* Admin */}
              <Link
                to="/admin/pricing"
                title="Pricing Admin"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden lg:inline">Admin</span>
              </Link>
            </nav>

            {/* New Quote CTA (desktop) */}
            <Link
              to="/quote"
              className="hidden md:flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              New Quote
            </Link>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {mainNav.map(({ path, label, icon: Icon, exact }) => {
              const active = isActive(path, exact);
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <Link
                to="/admin/pricing"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                Pricing Admin
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row sm:justify-between items-center gap-2 text-xs text-gray-400">
            <p>© 2026 CNC Quote Platform</p>
            <div className="flex items-center gap-3">
              <span>Rule-based pricing</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>Transparent calculations</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <Link to="/admin/pricing" className="hover:text-gray-600 transition-colors">Admin</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
