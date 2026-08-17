import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider } from './components/AuthProvider';
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
import PublicQuotePage from './pages/PublicQuotePage';
import LegalPage from './pages/LegalPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import NotFoundPage from './pages/NotFoundPage';
import CookieConsent from './components/CookieConsent';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/q/:token" element={<PublicQuotePage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Policy pages are public: they must be readable before signing up. */}
          <Route path="/legal" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/legal/:slug" element={<LegalPage />} />
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
          <Route
            path="/workspace"
            element={(
              <ProtectedRoute>
                <Layout>
                  <HomePage />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/quote"
            element={(
              <ProtectedRoute>
                <Layout>
                  <QuoteBuilder />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/quote/:quoteId/edit"
            element={(
              <ProtectedRoute>
                <Layout>
                  <QuoteBuilder />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/quotes"
            element={(
              <ProtectedRoute>
                <Layout>
                  <QuoteList />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/quotes/:quoteId"
            element={(
              <ProtectedRoute>
                <Layout>
                  <QuoteDetail />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/customers"
            element={(
              <ProtectedRoute>
                <Layout>
                  <CustomersPage />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/customers/:customerId"
            element={(
              <ProtectedRoute>
                <Layout>
                  <CustomerDetail />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/pricing"
            element={(
              <ProtectedRoute requireAdmin>
                <Layout>
                  <AdminPricing />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route
            path="/billing"
            element={(
              <ProtectedRoute>
                <Layout>
                  <BillingPage />
                </Layout>
              </ProtectedRoute>
            )}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <CookieConsent />
      </Router>
    </AuthProvider>
  );
}

export default App;
