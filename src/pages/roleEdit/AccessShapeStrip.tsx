import { cn } from '../../lib/utils';
import { isEscalationKey } from '../../utils/permissionRisk';
import { groupGrantRows } from './grantGroups';
import type { PermissionGridRow } from './PermissionGrid';

interface AccessShapeStripProps {
  /** Every catalog row, in catalog order. Only render this from a complete catalog. */
  rows: PermissionGridRow[];
  /** Spoken in place of the ticks — 23 unlabeled marks mean nothing to a screen reader. */
  ariaLabel: string;
}

/**
 * A role's reach as a shape: one tick per catalog resource, in catalog (menu) order, with a
 * wider gap between menu sections. Full, partial and none read at a glance, and because the
 * order is the catalog's, two roles' strips line up tick for tick — the one comparison the
 * "8 permissions · 4 of 23 resources" sentence cannot make.
 *
 * Deliberately not `AllocationTicks`: that counts units of one quantity, while each tick
 * here is a different resource with its own denominator, so it carries state, not count.
 *
 * Never render this from an incomplete catalog. Without it a tick cannot tell "not held" from
 * "never learned about", and an empty tick would claim the former.
 */
export function AccessShapeStrip({ rows, ariaLabel }: AccessShapeStripProps) {
  const groups = groupGrantRows(rows);
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-wrap items-end gap-x-2 gap-y-1">
      {groups.map((group) => (
        <span key={group.labelKey} className="flex gap-0.5">
          {group.rows.map((row) => {
            const risky = row.actions.some((a) => a.granted && isEscalationKey(a.key));
            return (
              <span
                key={row.resource}
                title={`${row.resource} · ${row.grantedCount}/${row.total}`}
                className={cn(
                  'h-4 w-2 rounded-[2px]',
                  risky
                    ? 'bg-warning'
                    : row.grantedCount === 0
                      ? 'bg-muted-foreground/20'
                      : row.grantedCount === row.total
                        ? 'bg-primary'
                        : 'bg-primary/50',
                )}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}
