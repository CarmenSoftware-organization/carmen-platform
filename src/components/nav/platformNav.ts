import {
  LayoutDashboard, Network, Building2, Users, FileText, Newspaper, Megaphone, AppWindow,
  ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid, Mail, FileSpreadsheet,
  BarChart3, MousePointerClick, Settings, Server, CreditCard,
} from 'lucide-react';
import type { NavItem } from '../Sidebar';

const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' },
  { path: '/business-units', label: 'Business Units', icon: Building2, permission: 'cluster.read', group: 'Organization' },
  { path: '/subscriptions', label: 'Subscriptions', icon: CreditCard, permission: 'subscription.read', group: 'Organization' },
  { path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' },
  { path: '/tenant-imports', label: 'Data Import', icon: FileSpreadsheet, permission: 'data_import.manage', group: 'Organization' },
  { path: '/users', label: 'Users', icon: Users, permission: 'user.read', group: 'Organization' },
  // Content
  { path: '/report-templates', label: 'Report Templates', icon: FileText, permission: 'report_template.read', group: 'Content' },
  { path: '/report-form-groups', label: 'Form Groups', icon: LayoutGrid, permission: 'report_template.read', group: 'Content' },
  { path: '/news', label: 'News', icon: Newspaper, permission: 'news.read', group: 'Content' },
  { path: '/broadcasts', label: 'Broadcasts', icon: Megaphone, permission: 'broadcast.read', group: 'Content' },

  // Analytics — must stay contiguous: Sidebar groups by consecutive runs of the same
  // `group` label, so splitting these two would render two separate "Analytics" headings.
  { path: '/analytics', label: 'Usage Analytics', icon: BarChart3, permission: 'activity_event.read', group: 'Analytics' },
  { path: '/activity-events', label: 'Activity Events', icon: MousePointerClick, permission: 'activity_event.detail', group: 'Analytics' },
  // Platform
  { path: '/applications', label: 'Applications', icon: AppWindow, permission: 'application.read', group: 'Platform' },
  { path: '/platform/email-settings', label: 'Email Settings', icon: Mail, permission: 'email_setting.read', group: 'Platform' },
  { path: '/platform/configs', label: 'Platform Config', icon: Settings, permission: 'platform_config.read', group: 'Platform' },
  { path: '/platform/roles', label: 'Platform Roles', icon: ShieldCheck, permission: 'platform_role.read', group: 'Platform' },
  { path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' },
  { path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' },
  { path: '/sql-workbench', label: 'SQL Workbench', icon: Database, permission: 'sql_workbench.read', group: 'Platform' },
  { path: '/platform/database-pools', label: 'Database Pools', icon: Server, permission: 'database_pool.read', group: 'Platform' },
];

/**
 * The order the sidebar puts resources in, derived from the nav itself so the two can
 * never drift: a role's permission list reads top-to-bottom in the same order as the menu
 * the reader just came from. Several nav items share one resource (Clusters, Business
 * Units and Tenant Migrations are all `cluster.read`) — first appearance wins.
 */
const NAV_RESOURCE_ORDER: string[] = (() => {
  const order: string[] = [];
  for (const item of ALL_PLATFORM_NAV_ITEMS) {
    if (!item.permission) continue;
    const resource = item.permission.split('.')[0];
    if (!order.includes(resource)) order.push(resource);
  }
  return order;
})();

/**
 * Sort rank for a permission resource. Resources with no menu entry of their own
 * (`rbac`, `license`) rank after every menu-backed one and, because `Array.sort` is
 * stable, keep catalog order among themselves.
 */
export const resourceRank = (resource: string): number => {
  const i = NAV_RESOURCE_ORDER.indexOf(resource);
  return i === -1 ? NAV_RESOURCE_ORDER.length : i;
};

/** The platform-administration navigation, filtered to what this user may reach. */
export function buildPlatformNav(opts: {
  hasPermission: (key: string) => boolean;
  isSuperAdmin: boolean;
}): NavItem[] {
  return ALL_PLATFORM_NAV_ITEMS.filter(
    (item) =>
      (!item.permission || opts.hasPermission(item.permission)) &&
      (!item.superAdminOnly || opts.isSuperAdmin),
  );
}
