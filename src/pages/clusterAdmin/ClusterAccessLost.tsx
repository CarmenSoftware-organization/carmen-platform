import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/ui/button';

/**
 * Shown when a request under /cluster-admin returns 403 after the guard already let the page
 * mount — the caller's admin membership was revoked mid-session. The guard cannot catch this:
 * it decides once, from the scope resolved at login.
 */
const ClusterAccessLost = () => {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You no longer administer this cluster"
      description="Your administrator access to this cluster was removed. Choose another cluster, or ask a platform administrator to restore it."
      action={
        <Button onClick={() => navigate('/cluster-admin', { replace: true })}>
          Back to my clusters
        </Button>
      }
    />
  );
};

export default ClusterAccessLost;
