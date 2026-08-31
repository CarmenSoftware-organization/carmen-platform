import { Building2, KeyRound, Network, Users } from 'lucide-react';
import type { NavItem } from '../Sidebar';
import type { FeatureState } from '../../constants/featureFlags';

/**
 * The cluster-administration navigation. Every path carries the cluster id, so the sidebar
 * itself cannot navigate out of the cluster the URL names. No permission filtering: reaching
 * this navigation already required clearing ClusterAdminRoute.
 */
export function buildClusterAdminNav(
  clusterId: string,
  /** สถานะฟีเจอร์จาก FeatureFlagContext — คีย์ของฝั่งนี้แยกจากของ platform ที่ชื่อเมนูซ้ำกัน */
  flagOf: (key: string) => FeatureState,
): NavItem[] {
  const base = `/cluster-admin/${clusterId}`;
  const items: NavItem[] = [
    { path: `${base}/cluster`, labelKey: 'nav.cluster', icon: Network, feature: 'cluster_admin_cluster' },
    { path: `${base}/business-units`, labelKey: 'nav.businessUnits', icon: Building2, feature: 'cluster_admin_business_units' },
    { path: `${base}/licenses`, labelKey: 'nav.licenses', icon: KeyRound, feature: 'cluster_admin_licenses' },
    { path: `${base}/users`, labelKey: 'nav.users', icon: Users, feature: 'cluster_admin_users' },
  ];
  return items
    .filter((item) => !item.feature || flagOf(item.feature) !== 'hide')
    .map((item) =>
      item.feature && flagOf(item.feature) === 'inactive' ? { ...item, comingSoon: true } : item,
    );
}
