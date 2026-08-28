import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/ui/button';
import { useI18n } from '../../hooks/useI18n';

/**
 * Shown when a request under /cluster-admin returns 403 after the guard already let the page
 * mount — the caller's admin membership was revoked mid-session. The guard cannot catch this:
 * it decides once, from the scope resolved at login.
 */
const ClusterAccessLost = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <EmptyState
      icon={ShieldAlert}
      title={t('pages.clusterAdmin.accessLostTitle')}
      description={t('pages.clusterAdmin.accessLostDescription')}
      action={
        <Button onClick={() => navigate('/cluster-admin', { replace: true })}>
          {t('pages.clusterAdmin.backToMyClusters')}
        </Button>
      }
    />
  );
};

export default ClusterAccessLost;
