import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileQuestion, LayoutDashboard, Network } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useBackOrFallback } from '../hooks/useBackOrFallback';
import { useI18n } from '../hooks/useI18n';

/**
 * 404 catch-all. Always inside <Layout>.
 *
 * An anonymous visitor never reaches this page: `AuthProvider` hard-redirects
 * any path outside `publicPaths` (`/`, `/login`, `/changelog`) to `/login` on
 * mount — see `src/context/AuthContext.tsx`. An earlier revision rendered a
 * shell-less variant for logged-out users; browser verification showed that
 * branch could never execute, so it was removed rather than left as dead code.
 *
 * `loading` is still gated: during the resolve-and-redirect window
 * `isAuthenticated` is false and rendering the shell would flash an empty
 * sidebar and an avatar reading "User" before the redirect fires.
 */
const NotFound: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { loading, hasPlatformAuthority, hasClusterAdminScope } = useAuth();
  // Only a user who is *confined* to the cluster-admin space goes there. A user with neither
  // authority would land on the picker's "No clusters to administer" empty state — a second dead
  // end — and can reach the dashboard.
  const isClusterAdminOnly = !hasPlatformAuthority && hasClusterAdminScope;
  const home = isClusterAdminOnly ? '/cluster-admin' : '/dashboard';
  const goBack = useBackOrFallback(home);

  if (loading) {
    return <div className="loading">{t('common.busy.loading')}</div>;
  }

  return (
    <Layout hideBreadcrumbs>
      <StatusPage
        icon={FileQuestion}
        tone="neutral"
        code="404"
        title={t('pages.statusPage.notFoundTitle')}
        description={t('pages.statusPage.notFoundBody')}
        actions={
          <>
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('pages.statusPage.goBack')}
            </Button>
            <Button variant="ghost" onClick={() => navigate(home)}>
              {isClusterAdminOnly
                ? <Network className="mr-2 h-4 w-4" />
                : <LayoutDashboard className="mr-2 h-4 w-4" />}
              {isClusterAdminOnly ? t('pages.statusPage.goToClusterAdmin') : t('pages.statusPage.goToDashboard')}
            </Button>
          </>
        }
      />
    </Layout>
  );
};

export default NotFound;
