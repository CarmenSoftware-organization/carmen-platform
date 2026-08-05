import { Navigate, useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import { EmptyState } from '../../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

/**
 * Entry point for the cluster-administration space. One administered cluster goes straight in;
 * several (or super-admin reach) present a picker. None is a 403 in substance, shown as an
 * empty state because the user is authenticated and simply administers nothing.
 */
const ClusterAdminEntry = () => {
  const { adminScope } = useAuth();
  const navigate = useNavigate();

  if (adminScope === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!adminScope.all && adminScope.clusters.length === 1) {
    return <Navigate to={`/cluster-admin/${adminScope.clusters[0].id}/cluster`} replace />;
  }

  return (
    <Layout navItems={[]}>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cluster Admin</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Choose a cluster to administer.
          </p>
        </div>

        {adminScope.clusters.length === 0 ? (
          <EmptyState
            icon={Network}
            title="No clusters to administer"
            description="You are not an administrator of any cluster. Ask a platform administrator to grant you access."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminScope.clusters.map((c) => (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/cluster-admin/${c.id}/cluster`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/cluster-admin/${c.id}/cluster`);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-accent"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="truncate text-base">{c.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ClusterAdminEntry;
