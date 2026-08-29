import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../hooks/useI18n';

/**
 * Authentication only — no permission check and no view boundary.
 *
 * The one route that needs this is `/cluster-admin`, which `PrivateRoute` cannot guard: that
 * guard redirects a membership-only cluster admin *to* `/cluster-admin`, so using it here would
 * redirect the route to itself forever. `ClusterAdminEntry` resolves `adminScope` itself,
 * including the administers-nothing empty state, so nothing is lost by checking less here.
 */
const AuthedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return <div className="loading">{t('common.busy.loading')}</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthedRoute;
