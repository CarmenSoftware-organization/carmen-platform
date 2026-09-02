import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

interface RoleReachCellProps {
  name: string;
  permissionCount: number;
  /** Size of the whole permission catalog. `0` when it hasn't loaded — see below. */
  catalogSize: number;
  /**
   * How many resource families the role touches. Server-side (`resource_count` on the list
   * row) and absent until the backend ships it — a role with 8 permissions inside one
   * resource is a very different risk from 8 spread over eight, and the count is the only
   * thing that tells them apart. Optional so its absence renders nothing rather than a `0`
   * that would read as "touches none".
   */
  resourceCount?: number;
}

/**
 * A role's permission count *against the catalog it is drawn from*.
 *
 * The bare number this replaced could not be read: `51` and `8` rendered as the same grey
 * badge, and on this platform `51` happens to be the entire catalog — the single most
 * audit-worthy fact about a role, and the list was the one place that never said it. The
 * detail page (`RoleIdentityHero`) has always flagged it; the denominator here is what makes
 * list and detail agree.
 *
 * When `catalogSize` is 0 the catalog fetch failed or is still in flight. The bar is then
 * dropped entirely rather than scaled against some stand-in: a bar whose denominator cannot
 * be stated is exactly the defect being fixed, and the raw count is still true on its own.
 *
 * The whole cell is one labelled image, so the parts below it can be `hidden` freely — which
 * is what the bar does under `lg`. `DataTable` renders a card per row there, one label/value
 * pair to a line, and a track that narrow turns 8-of-51 into a 6px dot that reads as a
 * rendering artifact rather than a measurement. The fraction alone carries it.
 */
export function RoleReachCell({ name, permissionCount, catalogSize, resourceCount }: RoleReachCellProps) {
  const { t } = useI18n();
  const anchored = catalogSize > 0;
  const full = anchored && permissionCount >= catalogSize;

  const label = !anchored
    ? t(permissionCount === 1 ? 'pages.roles.roleBarAria' : 'pages.roles.roleBarAriaPlural', { name, count: permissionCount })
    : full
      ? t('pages.roles.reachFullAria', { name, total: catalogSize })
      : t('pages.roles.reachAria', { name, count: permissionCount, total: catalogSize });

  return (
    <div className="flex flex-col gap-1" role="img" aria-label={label}>
      <div className="flex items-center gap-2">
        {anchored && (
          <div className="bg-muted hidden h-1.5 w-full flex-1 overflow-hidden rounded-full lg:block">
            <span
              className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${Math.min(100, (permissionCount / catalogSize) * 100)}%` }}
            />
          </div>
        )}
        <span className="shrink-0 whitespace-nowrap font-mono text-[13px] tabular-nums">
          <span className={cn('font-semibold', full && 'text-warning')}>{permissionCount}</span>
          {anchored && <span className="text-muted-foreground">/{catalogSize}</span>}
        </span>
        {/* ถ้อยคำเดียวกับ RoleIdentityHero เพื่อให้รายการกับหน้ารายละเอียดพูดตรงกัน */}
        {full && (
          <span className="flex shrink-0" title={t('pages.roles.fullAccessPermissions')}>
            <AlertTriangle className="text-warning size-3.5" />
          </span>
        )}
      </div>
      {resourceCount != null && (
        <span className="text-muted-foreground text-[11px] leading-none">
          {t(resourceCount === 1 ? 'pages.roles.nResources' : 'pages.roles.nResourcesPlural', { count: resourceCount })}
        </span>
      )}
    </div>
  );
}
