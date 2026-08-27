import { Building2, KeyRound, Network, Users } from 'lucide-react';
import type { NavItem } from '../Sidebar';

/**
 * The cluster-administration navigation. Every path carries the cluster id, so the sidebar
 * itself cannot navigate out of the cluster the URL names. No permission filtering: reaching
 * this navigation already required clearing ClusterAdminRoute.
 */
export function buildClusterAdminNav(clusterId: string): NavItem[] {
  const base = `/cluster-admin/${clusterId}`;
  return [
    { path: `${base}/cluster`, labelKey: 'nav.cluster', icon: Network },
    { path: `${base}/business-units`, labelKey: 'nav.businessUnits', icon: Building2 },
    { path: `${base}/licenses`, labelKey: 'nav.licenses', icon: KeyRound },
    { path: `${base}/users`, labelKey: 'nav.users', icon: Users },
  ];
}
