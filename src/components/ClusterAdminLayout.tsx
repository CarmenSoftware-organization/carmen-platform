import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from './Layout';
import ClusterSwitcher from './ClusterSwitcher';
import { PRODUCT_BRAND } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { buildClusterAdminNav } from './nav/clusterAdminNav';

/**
 * The cluster-administration shell. Reuses Layout for every piece of chrome and supplies only
 * the navigation, the header switcher, and the brand identity.
 */
const ClusterAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const { adminScope } = useAuth();
  const navItems = React.useMemo(
    () => buildClusterAdminNav(clusterId ?? ''),
    [clusterId],
  );

  // Inside a cluster the chrome wears that cluster, not the product: the brand link already
  // navigates to the cluster page, so labelling it "Carmen Platform" pointed one way and read
  // another. `adminScope.clusters` is only a page for a super admin, so a cluster outside that
  // page leaves the product branding in place rather than triggering a lookup just for a label.
  // ในคลัสเตอร์ chrome จะแสดงตัวตนของคลัสเตอร์นั้นแทนตัวผลิตภัณฑ์ เพราะลิงก์แบรนด์พาไปหน้าคลัสเตอร์อยู่แล้ว
  // การเขียนว่า "Carmen Platform" จึงชี้ไปทางหนึ่งแต่อ่านได้อีกทาง ส่วน super admin ที่ `adminScope.clusters`
  // เป็นเพียงหนึ่งหน้า คลัสเตอร์ที่อยู่นอกหน้านั้นจะคงแบรนด์ผลิตภัณฑ์ไว้ แทนที่จะยิงคำขอเพิ่มเพียงเพื่อได้ป้ายชื่อ
  const cluster = adminScope?.clusters.find((c) => c.id === clusterId);
  const brand = React.useMemo(
    () =>
      cluster
        ? { name: cluster.name, code: cluster.code, logoUrl: cluster.avatar?.url }
        : PRODUCT_BRAND,
    [cluster],
  );

  return (
    <Layout
      navItems={navItems}
      headerSlot={<ClusterSwitcher currentClusterId={clusterId ?? ''} />}
      brandTo={`/cluster-admin/${clusterId ?? ''}/cluster`}
      brand={brand}
    >
      {children}
    </Layout>
  );
};

export default ClusterAdminLayout;
