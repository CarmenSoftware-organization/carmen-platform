import { resourceNavMeta } from '../../components/nav/platformNav';
import type { TKey } from '../../i18n/types';
import type { PermissionGridRow } from './PermissionGrid';

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
