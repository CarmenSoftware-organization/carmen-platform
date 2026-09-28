import { History, BadgeCheck } from 'lucide-react';
import { resourceNavMeta, type ResourceNavMeta } from '../../components/nav/platformNav';
import type { TKey } from '../../i18n/types';
import type { PermissionGridRow } from './PermissionGrid';

/**
 * Names for resources the sidebar has no entry for, so they would otherwise read as a bare key.
 * Each is named for the feature it gates rather than for a page: `activity_log` is the history
 * sheet on 12 list/edit pages, and `license` is the second gate on Platform Config's `license`
 * key — not the Licenses menu, which runs on `subscription.*`. No `groupKey`: they stay under
 * "Other", since neither belongs to one menu section.
 */
const UNMENUED_RESOURCE_META: Record<string, ResourceNavMeta> = {
  activity_log: { labelKey: 'pages.roles.resourceName.activityLog', icon: History },
  license: { labelKey: 'pages.roles.resourceName.license', icon: BadgeCheck },
};

/** The menu's name for a resource, or Role Edit's own name for one the menu lacks. */
export const resourceMeta = (resource: string): ResourceNavMeta | undefined =>
  resourceNavMeta(resource) ?? UNMENUED_RESOURCE_META[resource];

/**
 * A one-line description per resource, shown under its name. Written here, not taken from the
 * catalog: the catalog describes each *action* ("Update clusters and business units"), in
 * English only, and it stays in the chip tooltip. A resource added to the catalog later simply
 * renders without a line until it gets one here.
 */
const RESOURCE_DESCRIPTION: Record<string, TKey> = {
  cluster: 'pages.roles.resourceDescription.clusters',
  tenant_migration: 'pages.roles.resourceDescription.tenantMigration',
  tenant_seed: 'pages.roles.resourceDescription.tenantSeed',
  data_import: 'pages.roles.resourceDescription.dataImport',
  user: 'pages.roles.resourceDescription.user',
  subscription: 'pages.roles.resourceDescription.subscription',
  license_feature_group: 'pages.roles.resourceDescription.licenseFeatureGroup',
  license_feature: 'pages.roles.resourceDescription.licenseFeature',
  report_template: 'pages.roles.resourceDescription.reportTemplate',
  news: 'pages.roles.resourceDescription.news',
  broadcast: 'pages.roles.resourceDescription.broadcast',
  activity_event: 'pages.roles.resourceDescription.activityEvent',
  cronjob: 'pages.roles.resourceDescription.cronjob',
  platform_config: 'pages.roles.resourceDescription.platformConfig',
  email_setting: 'pages.roles.resourceDescription.emailSetting',
  application: 'pages.roles.resourceDescription.application',
  platform_role: 'pages.roles.resourceDescription.platformRole',
  user_platform: 'pages.roles.resourceDescription.userPlatform',
  feature_flag: 'pages.roles.resourceDescription.featureFlag',
  sql_workbench: 'pages.roles.resourceDescription.sqlWorkbench',
  database_pool: 'pages.roles.resourceDescription.databasePool',
  activity_log: 'pages.roles.resourceDescription.activityLog',
  license: 'pages.roles.resourceDescription.license',
};

export const resourceDescriptionKey = (resource: string): TKey | undefined => RESOURCE_DESCRIPTION[resource];

export interface GrantGroup {
  /** The sidebar section's heading key; resources with no menu entry share `navGroup.other`. */
  labelKey: TKey;
  rows: PermissionGridRow[];
  /** Resources in this group the role holds at least one action of. */
  held: number;
}

/**
 * Splits the grant into the sidebar's own sections, keeping row order. Rows already arrive in
 * `resourceRank` order, which is the menu's order, so each section comes out contiguous — the
 * Map is only there so an out-of-order row joins its section instead of opening a second one.
 */
export function groupGrantRows(rows: PermissionGridRow[]): GrantGroup[] {
  const groups = new Map<TKey, GrantGroup>();
  for (const row of rows) {
    const labelKey: TKey = resourceNavMeta(row.resource)?.groupKey ?? 'navGroup.other';
    const group = groups.get(labelKey) ?? { labelKey, rows: [], held: 0 };
    group.rows.push(row);
    if (row.grantedCount > 0) group.held += 1;
    groups.set(labelKey, group);
  }
  return Array.from(groups.values());
}
