import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';

const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/workspace" replace />;
  }

  return <>{children}</>;
};

export default PublicOnlyRoute;
