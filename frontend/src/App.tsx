import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteList from './pages/QuoteList';
import QuoteDetail from './pages/QuoteDetail';
import CustomersPage from './pages/CustomersPage';
import CustomerDetail from './pages/CustomerDetail';
import AdminPricing from './pages/AdminPricing';
import BillingPage from './pages/BillingPage';
import AccountSettings from './pages/AccountSettings';
import SettingsShell from './components/SettingsShell';
import PublicQuotePage from './pages/PublicQuotePage';
import LegalPage from './pages/LegalPage';
import HelpPage from './pages/HelpPage';
import PricingPage from './pages/PricingPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import NotFoundPage from './pages/NotFoundPage';
import CookieConsent from './components/CookieConsent';
import { ToastProvider } from './components/Toast';
import { SkeletonPage } from './components/ui';

// Admin-only and heavy (charts): kept out of everyone else's bundle.
const AdminPage = lazy(() => import('./pages/AdminPage'));

// The admin page is unlinked and lives at a per-deployment path. Anyone who is
// not an admin (signed out included) gets the ordinary 404, so the URL does not
// reveal that it exists. The API enforces the role independently.
const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/control-room';

const AdminGate = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role === 'admin' ? children : <NotFoundPage />;
};

const app = (page: JSX.Element) => (
  <ProtectedRoute>
    <Layout>{page}</Layout>
  </ProtectedRoute>
);

/** Redirect a renamed route, keeping its :quoteId, query string and navigation state. */
const Moved = ({ to }: { to: string }) => {
  const location = useLocation();
  const { quoteId = '' } = useParams();
  return <Navigate to={`${to.replace(':quoteId', quoteId)}${location.search}`} state={location.state} replace />;
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/q/:token" element={<PublicQuotePage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Policy pages are public: they must be readable before signing up. */}
          <Route path="/legal" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/legal/:slug" element={<LegalPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/help/:slug" element={<HelpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/login"
            element={(
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            )}
          />
          <Route
            path="/signup"
            element={(
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            )}
          />
          <Route path="/dashboard" element={app(<HomePage />)} />
          <Route path="/quotes" element={app(<QuoteList />)} />
          <Route path="/quotes/new" element={app(<QuoteBuilder />)} />
          <Route path="/quotes/:quoteId" element={app(<QuoteDetail />)} />
          <Route path="/quotes/:quoteId/edit" element={app(<QuoteBuilder />)} />
          <Route path="/customers" element={app(<CustomersPage />)} />
          <Route path="/customers/:customerId" element={app(<CustomerDetail />)} />
          <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
          <Route path="/settings/account" element={app(<SettingsShell title="Account"><AccountSettings /></SettingsShell>)} />
          <Route path="/settings/rates" element={app(<SettingsShell title="Cost Master"><AdminPricing /></SettingsShell>)} />
          <Route path="/settings/billing" element={app(<SettingsShell title="Billing"><BillingPage /></SettingsShell>)} />
          <Route
            path={ADMIN_PATH}
            element={(
              <AdminGate>
                <Layout>
                  <Suspense fallback={<SkeletonPage />}>
                    <AdminPage />
                  </Suspense>
                </Layout>
              </AdminGate>
            )}
          />
          {/* Old addresses, kept so bookmarks and earlier links still land. */}
          <Route path="/workspace" element={<Moved to="/dashboard" />} />
          <Route path="/quote" element={<Moved to="/quotes/new" />} />
          <Route path="/quote/:quoteId/edit" element={<Moved to="/quotes/:quoteId/edit" />} />
          <Route path="/admin/pricing" element={<Moved to="/settings/rates" />} />
          <Route path="/billing" element={<Moved to="/settings/billing" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <CookieConsent />
      </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
