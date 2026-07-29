import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, ShieldX } from 'lucide-react';
import Layout from '../components/Layout';
import { StatusPage } from '../components/StatusPage';
import { Button } from '../components/ui/button';
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
  const goBack = useBackOrFallback('/dashboard');

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
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </>
        }
      />
    </Layout>
  );
};

export default Forbidden;
