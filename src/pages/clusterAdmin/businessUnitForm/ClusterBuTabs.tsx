import type { TabStripItem } from '../../../components/TabStrip';

export type ClusterBuTabId = 'overview' | 'people' | 'hotel' | 'company' | 'configuration';

export const CLUSTER_BU_TAB_IDS: ClusterBuTabId[] = [
  'overview',
  'people',
  'hotel',
  'company',
  'configuration',
];

export const isClusterBuTabId = (v: string | null): v is ClusterBuTabId =>
  !!v && (CLUSTER_BU_TAB_IDS as string[]).includes(v);

export type ClusterBuTab = TabStripItem<ClusterBuTabId>;

/**
 * Which tab owns a form field.
 *
 * The split differs from the platform form's (`businessUnitEdit/BusinessUnitTabs.tsx`), and
 * deliberately: there, hotel and company addresses share one "Location" tab because a platform
 * admin reads them together as the record's geography. A cluster admin does not — the hotel is
 * the property they run, the company is who invoices for it, and those are two different jobs
 * on two different days. So `hotel_*` and `company_*` part ways here, and each tab is named
 * after the field prefix it owns rather than after an abstraction over it.
 *
 * `name` returns null on purpose: it lives in the property plate above the strip, visible from
 * every tab, so a name error must not steal a tab switch.
 */
export function tabForClusterBuField(field: string): ClusterBuTabId | null {
  if (field === 'name') return null;
  if (field.startsWith('hotel_')) return 'hotel';
  if (field.startsWith('company_') || field === 'tax_no' || field === 'branch_no') return 'company';
  if (
    field === 'timezone' ||
    field === 'calculation_method' ||
    field === 'default_currency_id' ||
    field.endsWith('_format') ||
    field.startsWith('config')
  )
    return 'configuration';
  return 'overview';
}

/**
 * Tabs carrying at least one non-empty error, in tab order — drives both the red dot on the
 * trigger and the tab Save jumps to. Order comes from CLUSTER_BU_TAB_IDS, not from the error
 * object, so the jump is deterministic no matter which field failed first.
 */
export function clusterBuTabsWithErrors(fieldErrors: Record<string, string>): ClusterBuTabId[] {
  const hit = new Set<ClusterBuTabId>();
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (!message) continue;
    const tab = tabForClusterBuField(field);
    if (tab) hit.add(tab);
  }
  return CLUSTER_BU_TAB_IDS.filter((t) => hit.has(t));
}
