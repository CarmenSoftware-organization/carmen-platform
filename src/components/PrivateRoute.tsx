import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';

interface PrivateRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requireSuperAdmin?: boolean;
}

/**
 * Route guard. A failed permission check renders <Forbidden /> **in place**,
 * leaving the URL untouched, so the 403 page's "Go Back" returns to a page the
 * user could actually reach. Redirecting to /403 instead would trap them: back
 * would land on the blocked route and bounce forward again.
 */
const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, requiredPermission, requireSuperAdmin }) => {
  const { isAuthenticated, loading, hasPermission, isSuperAdmin } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Forbidden />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Forbidden />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
