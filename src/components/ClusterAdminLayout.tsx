import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from './Layout';
import ClusterSwitcher from './ClusterSwitcher';
import { buildClusterAdminNav } from './nav/clusterAdminNav';

/**
 * The cluster-administration shell. Reuses Layout for every piece of chrome and supplies only
 * the navigation and the header switcher.
 */
const ClusterAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navItems = React.useMemo(
    () => buildClusterAdminNav(clusterId ?? ''),
    [clusterId],
  );

  return (
    <Layout navItems={navItems} headerSlot={<ClusterSwitcher currentClusterId={clusterId ?? ''} />}>
      {children}
    </Layout>
  );
};

export default ClusterAdminLayout;
