import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';

/**
 * Scope guard for /cluster-admin/:clusterId/*. Resolves once, here, so every page beneath it
 * inherits the answer instead of re-deriving it.
 *
 * This is navigation, not security: each request underneath still meets isClusterAdmin on the
 * server. That is what makes deciding from the cached scope acceptable.
 *
 * A failed check renders <Forbidden /> in place rather than redirecting, matching PrivateRoute —
 * redirecting to /403 would trap the user, since Back returns to the blocked route.
 */
const ClusterAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, adminScope, isClusterAdminOf } = useAuth();
  const { clusterId } = useParams<{ clusterId: string }>();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminScope === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!clusterId || !isClusterAdminOf(clusterId)) {
    return <Forbidden />;
  }

  return <>{children}</>;
};

export default ClusterAdminRoute;
