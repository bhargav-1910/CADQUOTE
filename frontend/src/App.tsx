import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import PublicOnlyRoute from './components/PublicOnlyRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import HomePage from './pages/HomePage';
import QuoteBuilder from './pages/QuoteBuilder';
import QuoteList from './pages/QuoteList';
import QuoteDetail from './pages/QuoteDetail';
import AdminPricing from './pages/AdminPricing';
import BillingPage from './pages/BillingPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
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
            path="/forgot-password"
            element={(
              <PublicOnlyRoute>
                <ForgotPasswordPage />
              </PublicOnlyRoute>
            )}
          />
          <Route
            path="/reset-password"
            element={(
              <PublicOnlyRoute>
                <ResetPasswordPage />
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
            path="/admin/pricing"
            element={(
              <ProtectedRoute>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
