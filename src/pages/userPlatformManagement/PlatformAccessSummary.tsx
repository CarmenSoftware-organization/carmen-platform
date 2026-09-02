import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PlatformUserRegistrySummary } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface PlatformAccessSummaryProps {
  /**
   * Registry-wide aggregate straight from the endpoint's `summary` block — holders, the
   * scope breakdown, and the inactive count all describe every holder matching the current
   * filter/search across the whole registry, not just the loaded page. `null`/`undefined`
   * means the response carried no `summary` (the backend for this change has not deployed
   * yet), in which case the band falls back to `fallbackHolderTotal` for the headline only
   * (see below) and marks the breakdown + inactive warning unavailable rather than
   * re-deriving them from the loaded page — that page-derived shortcut is the exact bug
   * this component was rewritten to remove, since the one inactive holder could land on a
   * page the admin never opens.
   */
  summary?: PlatformUserRegistrySummary | null;
  /**
   * The registry-wide holder count sourced from `paginate.total`, used **only** to render
   * the headline when `summary` is absent. This is deliberately a separate prop from
   * `summary` rather than a field inside it — `paginate.total` and `summary.holders` are
   * two independent response fields that happen to describe the same count (per the
   * backend contract, `summary.holders` duplicates `paginate.total` on purpose), so this
   * is not page-derived stitching of different quantities, just a second source for the
   * same number. When `summary` is present, this prop is ignored — there is only ever one
   * source rendered per number. Leave unset if no total is known yet (e.g. before the
   * first successful fetch); the band then shows the fully "unavailable" state.
   */
  fallbackHolderTotal?: number;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Applies the inactive filter. The warning is an entry point, not just a tint. */
  onShowInactive?: () => void;
  /**
   * Toggles the platform-wide scope filter. Only the platform-wide half of the scope
   * split is an entry point: `scope === 'platform'` maps to the `cluster_id: null`
   * constraint the endpoint already supports, whereas "any cluster" would need a
   * `{ not: null }` operator no page in this repo has ever sent — so the cluster-scoped
   * legend entry stays a plain stat rather than a control that might quietly filter
   * nothing. Omit to render both halves as plain stats.
   */
  onShowPlatformWide?: () => void;
}

export function PlatformAccessSummary({
  summary,
  fallbackHolderTotal,
  loading,
  error = false,
  onRetry = () => {},
  onShowInactive,
  onShowPlatformWide,
}: PlatformAccessSummaryProps) {
  const { t } = useI18n();
  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message={t('pages.userPlatform.summaryStale')} onRetry={onRetry} className="py-3" />
      ) : loading ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-28" />
          <Skeleton className="h-14 min-w-[14rem] flex-1" />
        </div>
      ) : !summary ? (
        fallbackHolderTotal != null ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <HolderHeadline count={fallbackHolderTotal} />
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('pages.userPlatform.scopeBreakdownUnavailable')}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('pages.userPlatform.registrySummaryUnavailable')}
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <HolderHeadline count={summary.holders} />

          {/*
            The scope split as one proportional bar rather than a row of standalone
            counters. The counters read as four independent facts when they are really
            one: `platform_wide + cluster_only = holders` by contract, so a bar shows the
            only thing an access review actually asks of them — how much of the registry
            reaches everywhere — in a shape that stays legible whether the ratio is 4/0
            or 6/131. The numbers themselves stay written in the legend; the bar is the
            accelerator, never the sole carrier.
          */}
          <div className="w-full max-w-[22rem] space-y-2">
            <ScopeSplitBar platformWide={summary.platform_wide} clusterOnly={summary.cluster_only} />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
              <ScopeLegendItem
                swatchClassName="bg-primary"
                label={t('pages.userPlatform.platformWide')}
                count={summary.platform_wide}
                onClick={onShowPlatformWide}
              />
              <ScopeLegendItem
                swatchClassName="bg-muted-foreground/35"
                label={t('pages.userPlatform.clusterScoped')}
                count={summary.cluster_only}
              />
              <span className="text-muted-foreground ml-auto flex items-center gap-1.5">
                <span>{t('pages.userPlatform.assignments')}</span>
                <span className="text-foreground font-mono font-semibold tabular-nums">{summary.assignments}</span>
              </span>
            </div>
          </div>

          {summary.inactive > 0 && (
            <button
              type="button"
              onClick={onShowInactive}
              className="text-warning inline-flex items-center gap-2 rounded-md border border-warning/40 px-3 py-1.5 text-sm hover:bg-warning/10"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {summary.inactive === 1
                ? t('pages.userPlatform.inactiveHoldersWarning', { count: summary.inactive })
                : t('pages.userPlatform.inactiveHoldersWarningPlural', { count: summary.inactive })}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * The platform-wide / cluster-scoped split as a single proportional track. Decorative:
 * every number it encodes is written out in the legend directly beneath it, so nothing
 * here is the only carrier of a fact. When the registry is empty (or every holder somehow
 * falls outside both buckets) it renders as a flat neutral track rather than dividing by
 * zero or silently collapsing to a full primary bar.
 */
function ScopeSplitBar({ platformWide, clusterOnly }: { platformWide: number; clusterOnly: number }) {
  const total = platformWide + clusterOnly;
  return (
    <div className="bg-muted flex h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
      {total > 0 && (
        <>
          <div className="bg-primary h-full" style={{ width: `${(platformWide / total) * 100}%` }} />
          <div className="bg-muted-foreground/35 h-full" style={{ width: `${(clusterOnly / total) * 100}%` }} />
        </>
      )}
    </div>
  );
}

/**
 * One legend entry: swatch, label, count. Renders as a button only when `onClick` is
 * supplied — the two halves are deliberately not symmetric controls (see
 * `onShowPlatformWide`), and an entry that looks clickable but filters nothing would be
 * worse than one that plainly reads as a stat.
 */
function ScopeLegendItem({
  swatchClassName,
  label,
  count,
  onClick,
}: {
  swatchClassName: string;
  label: string;
  count: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cn('h-2 w-2 shrink-0 rounded-[2px]', swatchClassName)} aria-hidden="true" />
      <span>{label}</span>
      <span className="text-foreground font-mono font-semibold tabular-nums">{count}</span>
    </>
  );
  if (!onClick) {
    return <span className="text-muted-foreground flex items-center gap-1.5">{body}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-1.5 rounded-sm focus-visible:ring-1 focus-visible:outline-hidden"
    >
      {body}
    </button>
  );
}

/** The large headline number + "holder(s)" label, shared by the full and fallback renders. */
function HolderHeadline({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <div className="border-border sm:border-r sm:pr-8">
      <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{count}</div>
      <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">
        {count === 1 ? t('pages.userPlatform.holder') : t('pages.userPlatform.holders')}
      </div>
    </div>
  );
}
