import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Network, ShieldX } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useBackOrFallback } from '../hooks/useBackOrFallback';

/**
 * 403. Reached two ways, both of which guarantee an authenticated user:
 * `PrivateRoute` renders it in place of a blocked page (keeping the original
 * URL, so "Go Back" cannot bounce off the guard), and the `/403` route renders
 * it directly. The shell is therefore unconditional.
 *
 * The title string "Access Denied" is asserted by
 * `src/pages/SuperAdminManagement.test.tsx` through the live guard — treat it as
 * a contract, not a wording choice.
 */
const Forbidden: React.FC = () => {
  const navigate = useNavigate();
  const { hasPlatformAuthority, hasClusterAdminScope } = useAuth();
  // Only a user who is *confined* to the cluster-admin space goes there. A user with neither
  // authority would land on the picker's "No clusters to administer" empty state — a second dead
  // end — and can reach the dashboard.
  const isClusterAdminOnly = !hasPlatformAuthority && hasClusterAdminScope;
  const home = isClusterAdminOnly ? '/cluster-admin' : '/dashboard';
  const goBack = useBackOrFallback(home);

  return (
    <Layout>
      <StatusPage
        icon={ShieldX}
        tone="danger"
        code="403"
        title="Access Denied"
        description="You don't have permission to access this page."
        actions={
          <>
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button variant="ghost" onClick={() => navigate(home)}>
              {isClusterAdminOnly
                ? <Network className="mr-2 h-4 w-4" />
                : <LayoutDashboard className="mr-2 h-4 w-4" />}
              {isClusterAdminOnly ? 'Go to Cluster Admin' : 'Go to Dashboard'}
            </Button>
          </>
        }
      />
    </Layout>
  );
};

export default Forbidden;
