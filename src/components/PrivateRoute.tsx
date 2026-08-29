import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';
import { useI18n } from '../hooks/useI18n';

interface PrivateRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requireSuperAdmin?: boolean;
}

/**
 * Guard for the platform-administration view.
 *
 * A failed permission check renders <Forbidden /> **in place**, leaving the URL untouched, so the
 * 403 page's "Go Back" returns to a page the user could actually reach. Redirecting to /403
 * instead would trap them: back would land on the blocked route and bounce forward again.
 *
 * A user with no platform authority is *redirected* rather than shown a 403, because for them
 * every route behind this guard is permanently unreachable — a 403 whose recovery button leads
 * to another 403 is the trap the paragraph above is about.
 *
 * This is also the only place that decides the boundary, which is what makes it correct: it can
 * wait for `adminScope` to resolve. Entry points like Login and Landing cannot — they read a
 * pre-login snapshot of the context — so they keep sending everyone to /dashboard and let this
 * guard route the ones who do not belong there.
 */
const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, requiredPermission, requireSuperAdmin }) => {
  const {
    isAuthenticated,
    loading,
    hasPermission,
    isSuperAdmin,
    hasPlatformAuthority,
    hasClusterAdminScope,
    adminScope,
    effectivePermissions,
  } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return <div className="loading">{t('common.busy.loading')}</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // `hasPlatformAuthority` reads false both for a user who genuinely has none and for a session
  // whose permissions have not resolved — or whose fetch failed, which nulls the value and drops
  // its cache. Only the first is a boundary decision. Requiring a resolved payload keeps a
  // transient fetch failure from ejecting a platform admin into the cluster-admin space for the
  // rest of the session, with no way back: the degraded session falls through to the checks below
  // instead, which is exactly how it behaved before this guard existed.
  if (effectivePermissions !== null && !hasPlatformAuthority) {
    // Still resolving. Rendering the page for even one frame mounts it — for /dashboard that
    // means a burst of platform-wide list requests that all 403.
    if (adminScope === null) {
      return <div className="loading">{t('common.busy.loading')}</div>;
    }
    if (hasClusterAdminScope) {
      return <Navigate to="/cluster-admin" replace />;
    }
    // Neither authority. Deliberately falls through rather than returning <Forbidden /> here:
    // `hasPlatformAuthority` also reads false while `userCount` is still in flight — it is never
    // cached, so every cold reload passes through that state — and returning here would 403 a
    // bootstrap administrator on the page they exist to set up, permanently if that one request
    // fails. Falling through reproduces the pre-guard behaviour for a state the login gate
    // already refuses to create.
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
