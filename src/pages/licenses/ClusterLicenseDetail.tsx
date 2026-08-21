import React from 'react';
import Layout from '../../components/Layout';

// Stub — Task 6 replaces this with the real per-cluster license detail page (seat/BU quota
// sections, ledger, etc). Kept intentionally minimal here: it only needs to satisfy the route
// registered in App.tsx and never throw on render.
const ClusterLicenseDetail: React.FC = () => (
  <Layout>
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-muted-foreground">License Center — coming in Task 6</p>
    </div>
  </Layout>
);

export default ClusterLicenseDetail;
