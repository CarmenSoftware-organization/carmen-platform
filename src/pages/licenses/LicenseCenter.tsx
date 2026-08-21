import React from 'react';
import Layout from '../../components/Layout';

// Stub — Task 5 replaces this with the real License Center page (cluster license table,
// summary band, etc). Kept intentionally minimal here: it only needs to satisfy the route
// registered in App.tsx and never throw on render.
const LicenseCenter: React.FC = () => (
  <Layout>
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-muted-foreground">License Center — coming in Task 5</p>
    </div>
  </Layout>
);

export default LicenseCenter;
