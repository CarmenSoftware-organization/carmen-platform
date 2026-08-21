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
    { path: `${base}/cluster`, label: 'Cluster', icon: Network },
    { path: `${base}/business-units`, label: 'Business Units', icon: Building2 },
    { path: `${base}/licenses`, label: 'Licenses', icon: KeyRound },
    { path: `${base}/users`, label: 'Users', icon: Users },
  ];
}
