import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';
import NotFound from '../pages/NotFound';
import ComingSoon from '../pages/ComingSoon';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import { useI18n } from '../hooks/useI18n';

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
const ClusterAdminRoute: React.FC<{ children: React.ReactNode; feature?: string }> = ({ children, feature }) => {
  const { isAuthenticated, loading, adminScope, isClusterAdminOf } = useAuth();
  const { flagOf, isReady: flagsReady } = useFeatureFlags();
  const { clusterId } = useParams<{ clusterId: string }>();
  const { t } = useI18n();

  if (loading) {
    return <div className="loading">{t('common.busy.loading')}</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminScope === null) {
    return <div className="loading">{t('common.busy.loading')}</div>;
  }

  if (!clusterId || !isClusterAdminOf(clusterId)) {
    return <Forbidden />;
  }

  // ด่านฟีเจอร์ท้ายสุด ด้วยเหตุผลเดียวกับใน PrivateRoute: ขอบเขตต้องตอบก่อน flag
  // The feature gate comes last, same reasoning as PrivateRoute: scope answers before the flag.
  if (feature) {
    if (!flagsReady) {
      return <div className="loading">{t('common.busy.loading')}</div>;
    }
    const state = flagOf(feature);
    if (state === 'hide') return <NotFound />;
    if (state === 'inactive') return <ComingSoon />;
  }

  // Remount the whole subtree when the cluster changes. React Router reuses a component
  // instance when only a route param differs, so a history jump straight from one cluster's
  // page to another's — which the browser's long-press Back/Forward menu can do in a single
  // popstate — would otherwise leave state captured from the previous cluster in place. One
  // key here spares every page under this guard from having to remember that.
  return <React.Fragment key={clusterId}>{children}</React.Fragment>;
};

export default ClusterAdminRoute;
