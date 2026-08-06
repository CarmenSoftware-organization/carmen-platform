import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { AlertTriangle, Info } from 'lucide-react';
import type { PlatformUserRegistrySummary } from '../../types';

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
}

export function PlatformAccessSummary({
  summary,
  fallbackHolderTotal,
  loading,
  error = false,
  onRetry = () => {},
  onShowInactive,
}: PlatformAccessSummaryProps) {
  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message="Couldn't load the registry summary." onRetry={onRetry} className="py-3" />
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
              Scope breakdown isn&apos;t available yet.
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            Registry summary isn&apos;t available yet.
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <HolderHeadline count={summary.holders} />

          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Platform-wide</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.platform_wide}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Cluster-scoped</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.cluster_only}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Assignments</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">{summary.assignments}</dd>
            </div>
          </dl>

          {summary.inactive > 0 && (
            <button
              type="button"
              onClick={onShowInactive}
              className="text-warning ml-auto inline-flex items-center gap-2 rounded-md border border-warning/40 px-3 py-1.5 text-sm hover:bg-warning/10"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {summary.inactive} inactive {summary.inactive === 1 ? 'holder' : 'holders'} still hold access
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/** The large headline number + "holder(s)" label, shared by the full and fallback renders. */
function HolderHeadline({ count }: { count: number }) {
  return (
    <div className="border-border sm:border-r sm:pr-8">
      <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{count}</div>
      <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">
        {count === 1 ? 'holder' : 'holders'}
      </div>
    </div>
  );
}
