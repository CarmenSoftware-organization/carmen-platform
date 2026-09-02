import { AlertTriangle } from 'lucide-react';
import { reachOf } from '../../utils/apiReach';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

interface ApplicationReachCellProps {
  name: string;
  /** `allow_all` — the app is granted every endpoint by rule, so it carries no `api_names`. */
  allowAll: boolean;
  apiNames: string[];
  /** Size of the whole API catalog. `0` when it hasn't loaded — see below. */
  catalogSize: number;
}

/**
 * An application's API reach *against the catalog it is drawn from*.
 *
 * The badges this replaced could not be read against each other: `All APIs`, `207 APIs` and
 * `3 APIs` all rendered as the same grey outline pill, one row apart. Two facts were lost.
 *
 * First, full access was invisible. The registry band directly above this table paints
 * `Full access` amber with a warning triangle, and the detail page (`ApplicationIdentityHero`)
 * has always flagged it too — the list was the one place where an app holding every endpoint
 * on the platform read as the calmest row in the table.
 *
 * Second, `207 APIs` has no denominator. If the catalog holds 210, that app is full access
 * wearing a scoped costume, and no amount of staring at the old badge would say so. Anchoring
 * both to one catalog is what makes the two comparable at a glance.
 *
 * `allowAll` is rendered as `n/n` rather than a word so it sits on the same ruler as every
 * scoped row: the grant is a rule, not a count, but the reach it produces is exactly the
 * catalog. When `catalogSize` is 0 the catalog fetch failed or is still in flight; the bar and
 * the denominator are then dropped rather than scaled against some stand-in, because a bar
 * whose divisor cannot be stated is the very defect this cell exists to fix. The raw counts
 * are still true on their own.
 *
 * The bar hides under `lg`, where `DataTable` renders a card per row: one label/value pair to
 * a line makes the track narrow enough that 3-of-210 becomes a 2px stub that reads as a
 * rendering artifact rather than a measurement. The fraction alone carries it there.
 */
export function ApplicationReachCell({ name, allowAll, apiNames, catalogSize }: ApplicationReachCellProps) {
  const { t } = useI18n();
  // Arithmetic shared with ApplicationIdentityHero — see utils/apiReach.
  const { granted, anchored, full, modules, percent } = reachOf({ allowAll, apiNames, catalogSize });

  const label = full
    ? anchored
      ? t('pages.applications.reachFullAria', { name, total: catalogSize })
      : t('pages.applications.reachFullUnanchoredAria', { name })
    : anchored
      ? t('pages.applications.reachAria', { name, count: granted, total: catalogSize })
      : t('pages.applications.reachUnanchoredAria', { name, count: granted });

  return (
    <div className="flex flex-col gap-1" role="img" aria-label={label}>
      <div className="flex items-center gap-2">
        {anchored && (
          <div className="bg-muted hidden h-1.5 w-full flex-1 overflow-hidden rounded-full lg:block">
            <span
              className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
        <span className="shrink-0 whitespace-nowrap font-mono text-[13px] tabular-nums">
          {anchored || !allowAll ? (
            <>
              <span className={cn('font-semibold', full && 'text-warning')}>{granted}</span>
              {anchored && <span className="text-muted-foreground">/{catalogSize}</span>}
            </>
          ) : (
            /* allow_all with no catalog to divide by — the grant is all this row can honestly say */
            <span className="text-warning font-semibold">{t('pages.applications.allApis')}</span>
          )}
        </span>
        {/* ถ้อยคำเดียวกับ ApplicationIdentityHero เพื่อให้รายการกับหน้ารายละเอียดพูดตรงกัน */}
        {full && (
          <span className="flex shrink-0" title={t('pages.applications.fullAccessEndpoints')}>
            <AlertTriangle className="text-warning size-3.5" />
          </span>
        )}
      </div>
      {modules > 0 && (
        <span className="text-muted-foreground text-[11px] leading-none">
          {t(modules === 1 ? 'pages.applications.nModules' : 'pages.applications.nModulesPlural', { count: modules })}
        </span>
      )}
    </div>
  );
}
