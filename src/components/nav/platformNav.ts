import {
  LayoutDashboard, Network, Building2, Users, FileText, Newspaper, Megaphone, AppWindow,
  ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid, Mail, FileSpreadsheet,
  BarChart3, MousePointerClick, Settings, Server, KeyRound,
} from 'lucide-react';
import type { NavItem } from '../Sidebar';

const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', labelKey: 'nav.clusters', icon: Network, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/business-units', labelKey: 'nav.businessUnits', icon: Building2, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/licenses', labelKey: 'nav.licenses', icon: KeyRound, permission: 'subscription.read', groupKey: 'navGroup.organization' },
  { path: '/license-feature-groups', labelKey: 'nav.licenseFeatureGroups', icon: LayoutGrid, permission: 'license_feature_group.read', groupKey: 'navGroup.organization' },
  { path: '/tenant-migrations', labelKey: 'nav.tenantMigrations', icon: DatabaseZap, permission: 'cluster.read', groupKey: 'navGroup.organization' },
  { path: '/tenant-imports', labelKey: 'nav.dataImport', icon: FileSpreadsheet, permission: 'data_import.manage', groupKey: 'navGroup.organization' },
  { path: '/users', labelKey: 'nav.users', icon: Users, permission: 'user.read', groupKey: 'navGroup.organization' },
  // Content
  { path: '/report-templates', labelKey: 'nav.reportTemplates', icon: FileText, permission: 'report_template.read', groupKey: 'navGroup.content' },
  { path: '/report-form-groups', labelKey: 'nav.formGroups', icon: LayoutGrid, permission: 'report_template.read', groupKey: 'navGroup.content' },
  { path: '/news', labelKey: 'nav.news', icon: Newspaper, permission: 'news.read', groupKey: 'navGroup.content' },
  { path: '/broadcasts', labelKey: 'nav.broadcasts', icon: Megaphone, permission: 'broadcast.read', groupKey: 'navGroup.content' },

  // Analytics — must stay contiguous: Sidebar groups by consecutive runs of the same
  // `groupKey`, so splitting these two would render two separate "Analytics" headings.
  { path: '/analytics', labelKey: 'nav.usageAnalytics', icon: BarChart3, permission: 'activity_event.read', groupKey: 'navGroup.analytics' },
  { path: '/activity-events', labelKey: 'nav.activityEvents', icon: MousePointerClick, permission: 'activity_event.detail', groupKey: 'navGroup.analytics' },
  // Platform
  { path: '/applications', labelKey: 'nav.applications', icon: AppWindow, permission: 'application.read', groupKey: 'navGroup.platform' },
  { path: '/platform/email-settings', labelKey: 'nav.emailSettings', icon: Mail, permission: 'email_setting.read', groupKey: 'navGroup.platform' },
  { path: '/platform/configs', labelKey: 'nav.platformConfig', icon: Settings, permission: 'platform_config.read', groupKey: 'navGroup.platform' },
  { path: '/platform/roles', labelKey: 'nav.platformRoles', icon: ShieldCheck, permission: 'platform_role.read', groupKey: 'navGroup.platform' },
  { path: '/platform/super-admins', labelKey: 'nav.superAdmins', icon: ShieldAlert, superAdminOnly: true, groupKey: 'navGroup.platform' },
  { path: '/platform/user-platform', labelKey: 'nav.userPlatform', icon: UserCog, permission: 'user_platform.read', groupKey: 'navGroup.platform' },
  { path: '/sql-workbench', labelKey: 'nav.sqlWorkbench', icon: Database, permission: 'sql_workbench.read', groupKey: 'navGroup.platform' },
  { path: '/platform/database-pools', labelKey: 'nav.databasePools', icon: Server, permission: 'database_pool.read', groupKey: 'navGroup.platform' },
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
