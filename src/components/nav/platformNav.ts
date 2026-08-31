import {
  LayoutDashboard, Network, Building2, Users, FileText, Newspaper, Megaphone, AppWindow,
  ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid, Mail, FileSpreadsheet,
  BarChart3, MousePointerClick, Settings, Server, KeyRound, ToggleLeft, Tags
} from 'lucide-react';
import type { NavItem } from '../Sidebar';
import type { FeatureState } from '../../constants/featureFlags';

const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', labelKey: 'nav.clusters', icon: Network, permission: 'cluster.read', groupKey: 'navGroup.organization', feature: 'clusters' },
  { path: '/business-units', labelKey: 'nav.businessUnits', icon: Building2, permission: 'cluster.read', groupKey: 'navGroup.organization', feature: 'business_units' },
  { path: '/tenant-migrations', labelKey: 'nav.tenantMigrations', icon: DatabaseZap, permission: 'cluster.read', groupKey: 'navGroup.organization', feature: 'tenant_migrations' },
  { path: '/tenant-imports', labelKey: 'nav.dataImport', icon: FileSpreadsheet, permission: 'data_import.manage', groupKey: 'navGroup.organization', feature: 'tenant_imports' },
  { path: '/users', labelKey: 'nav.users', icon: Users, permission: 'user.read', groupKey: 'navGroup.organization', feature: 'users' },
  // License management — ต้องอยู่ติดกัน: Sidebar จัดกลุ่มจากแถวที่ groupKey ซ้ำกันติด ๆ
  // การแทรกรายการกลุ่มอื่นคั่นจะทำให้หัวข้อนี้แตกเป็นสองหัวข้อ
  // Must stay contiguous: Sidebar groups by consecutive runs of the same `groupKey`.
  { path: '/licenses', labelKey: 'nav.licenses', icon: KeyRound, permission: 'subscription.read', groupKey: 'navGroup.licenseManagement', feature: 'licenses' },
  { path: '/license-feature-groups', labelKey: 'nav.licenseFeatureGroups', icon: LayoutGrid, permission: 'license_feature_group.read', groupKey: 'navGroup.licenseManagement', feature: 'license_feature_groups' },
  { path: '/license-features', labelKey: 'nav.licenseFeatures', icon: Tags, permission: 'license_feature.read', groupKey: 'navGroup.licenseManagement', feature: 'license_features' },
  // Content
  { path: '/report-templates', labelKey: 'nav.reportTemplates', icon: FileText, permission: 'report_template.read', groupKey: 'navGroup.content', feature: 'report_templates' },
  { path: '/report-form-groups', labelKey: 'nav.formGroups', icon: LayoutGrid, permission: 'report_template.read', groupKey: 'navGroup.content', feature: 'report_form_groups' },
  // เส้นคั่น: เหนือเส้นคือแม่แบบรายงาน ใต้เส้นคือเนื้อหาที่ส่งถึงผู้ใช้
  { path: '/news', labelKey: 'nav.news', icon: Newspaper, permission: 'news.read', groupKey: 'navGroup.content', feature: 'news', dividerBefore: true },
  { path: '/broadcasts', labelKey: 'nav.broadcasts', icon: Megaphone, permission: 'broadcast.read', groupKey: 'navGroup.content', feature: 'broadcasts' },

  // Analytics — must stay contiguous: Sidebar groups by consecutive runs of the same
  // `groupKey`, so splitting these two would render two separate "Analytics" headings.
  { path: '/analytics', labelKey: 'nav.usageAnalytics', icon: BarChart3, permission: 'activity_event.read', groupKey: 'navGroup.analytics', feature: 'usage_analytics' },
  { path: '/activity-events', labelKey: 'nav.activityEvents', icon: MousePointerClick, permission: 'activity_event.detail', groupKey: 'navGroup.analytics', feature: 'activity_events' },
  // Platform
  { path: '/platform/configs', labelKey: 'nav.platformConfig', icon: Settings, permission: 'platform_config.read', groupKey: 'navGroup.platform', feature: 'platform_config' },
  { path: '/platform/email-settings', labelKey: 'nav.emailSettings', icon: Mail, permission: 'email_setting.read', groupKey: 'navGroup.platform', feature: 'email_settings' },
  { path: '/applications', labelKey: 'nav.applications', icon: AppWindow, permission: 'application.read', groupKey: 'navGroup.platform', feature: 'applications' },
  // เส้นคั่น: เหนือเส้นคือการตั้งค่าตัวระบบ ใต้เส้นคือการกำหนดว่าใครทำอะไรได้
  { path: '/platform/roles', labelKey: 'nav.platformRoles', icon: ShieldCheck, permission: 'platform_role.read', groupKey: 'navGroup.platform', feature: 'platform_roles', dividerBefore: true },
  { path: '/platform/user-platform', labelKey: 'nav.userPlatform', icon: UserCog, permission: 'user_platform.read', groupKey: 'navGroup.platform', feature: 'user_platform' },
  // เส้นคั่นแบ่งสองแถวล่างออกจากงานตั้งค่าประจำวัน — ทั้งคู่เปลี่ยนสิ่งที่คนอื่นเข้าถึงได้
  // ไม่ตั้งเป็นกลุ่มใหม่เพราะยังเป็นเรื่อง Platform เหมือนกัน ต่างแค่ระดับความเสี่ยง
  { path: '/platform/super-admins', labelKey: 'nav.superAdmins', icon: ShieldAlert, superAdminOnly: true, groupKey: 'navGroup.platform', feature: 'super_admins', dividerBefore: true },
  // ไม่มี feature โดยเจตนา — สวิตช์ที่ปิดตัวเองได้จะเปิดกลับไม่ได้อีกจากหน้าจอ
  // Deliberately ungated: a switch that could hide itself could never be restored from the UI.
  { path: '/platform/features', labelKey: 'nav.featureFlags', icon: ToggleLeft, permission: 'feature_flag.manage', groupKey: 'navGroup.platform' },
  // Database — ต้องอยู่ท้ายสุด: ทั้งสองแถวเคยอยู่กลางกลุ่ม Platform การแยกออกเป็นกลุ่มของตัวเอง
  // โดยทิ้งไว้ตำแหน่งเดิมจะทำให้กลุ่ม Platform ขาดเป็นสองท่อนและวาดหัวข้อซ้ำสองครั้ง
  // Must stay last: pulling these out mid-group would split Platform's heading in two.
  { path: '/sql-workbench', labelKey: 'nav.sqlWorkbench', icon: Database, permission: 'sql_workbench.read', groupKey: 'navGroup.database', feature: 'sql_workbench' },
  { path: '/platform/database-pools', labelKey: 'nav.databasePools', icon: Server, permission: 'database_pool.read', groupKey: 'navGroup.database', feature: 'database_pools' },
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
  /** สถานะฟีเจอร์จาก FeatureFlagContext — ผู้เรียกต้องส่งมาเสมอ */
  flagOf: (key: string) => FeatureState;
}): NavItem[] {
  return ALL_PLATFORM_NAV_ITEMS.filter(
    (item) =>
      (!item.permission || opts.hasPermission(item.permission)) &&
      (!item.superAdminOnly || opts.isSuperAdmin) &&
      // `hide` เท่านั้นที่ตัดทิ้ง ส่วน `inactive` ต้องคงลำดับเดิมไว้ — Sidebar จัดกลุ่มจากแถวที่
      // groupKey ซ้ำกันติด ๆ การตัดรายการกลางกลุ่มออกจึงทำให้กลุ่มเดียวแตกเป็นสองหัวข้อได้
      // Only `hide` removes the row; dropping one mid-group would split its heading in two.
      (!item.feature || opts.flagOf(item.feature) !== 'hide'),
  ).map((item) =>
    item.feature && opts.flagOf(item.feature) === 'inactive'
      ? { ...item, comingSoon: true }
      : item,
  );
}
