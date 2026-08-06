import {
  LayoutDashboard, Network, Building2, Users, FileText, Newspaper, Megaphone, AppWindow,
  ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid, Mail, FileSpreadsheet,
  BarChart3,
} from 'lucide-react';
import type { NavItem } from '../Sidebar';

const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' },
  { path: '/business-units', label: 'Business Units', icon: Building2, permission: 'cluster.read', group: 'Organization' },
  { path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' },
  { path: '/tenant-imports', label: 'Data Import', icon: FileSpreadsheet, permission: 'data_import.manage', group: 'Organization' },
  { path: '/users', label: 'Users', icon: Users, permission: 'user.read', group: 'Organization' },
  // Content
  { path: '/report-templates', label: 'Report Templates', icon: FileText, permission: 'report_template.read', group: 'Content' },
  { path: '/report-form-groups', label: 'Form Groups', icon: LayoutGrid, permission: 'report_template.read', group: 'Content' },
  { path: '/news', label: 'News', icon: Newspaper, permission: 'news.read', group: 'Content' },
  { path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, permission: 'broadcast.send', group: 'Content' },
  // Platform
  { path: '/applications', label: 'Applications', icon: AppWindow, permission: 'application.read', group: 'Platform' },
  { path: '/platform/email-settings', label: 'Email Settings', icon: Mail, permission: 'email_setting.read', group: 'Platform' },
  { path: '/platform/roles', label: 'Roles', icon: ShieldCheck, permission: 'role.read', group: 'Platform' },
  { path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' },
  { path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' },
  { path: '/analytics', label: 'Usage Analytics', icon: BarChart3, permission: 'activity_event.read', group: 'Platform' },
  { path: '/sql-workbench', label: 'SQL Workbench', icon: Database, permission: 'sql_workbench.read', group: 'Platform' },
];

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
