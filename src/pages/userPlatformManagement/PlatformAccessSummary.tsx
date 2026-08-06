import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { AlertTriangle } from 'lucide-react';
import type { PlatformUserRow } from '../../types';

export interface RegistrySummary {
  /** Privilege holders across the whole registry, from the endpoint's paginate.total. */
  holders: number;
  /** Holders on this page with at least one platform-wide role. */
  platformWide: number;
  /** Holders on this page whose roles are all cluster-scoped. */
  clusterOnly: number;
  /** Role assignments across this page. */
  assignments: number;
  /** Holders on this page who cannot sign in but still hold privilege. */
  inactive: number;
}

/**
 * Roll the loaded page into registry counts. `total` comes from the endpoint's
 * paginate envelope so the headline holder count reflects the whole registry, while the
 * breakdown (`platformWide`/`clusterOnly`/`assignments`/`inactive`) is computed only from
 * the rows currently loaded on this page. `PlatformAccessSummary` renders a "This page
 * only" caption over that breakdown so the two scopes are never presented as equivalent.
 */
export function summarizeRegistry(rows: PlatformUserRow[], total: number): RegistrySummary {
  let platformWide = 0;
  let clusterOnly = 0;
  let assignments = 0;
  let inactive = 0;

  for (const row of rows) {
    assignments += row.roles.length;
    if (!row.is_active) inactive += 1;
    if (row.roles.some((r) => r.scope.type === 'platform')) platformWide += 1;
    else if (row.roles.length > 0) clusterOnly += 1;
  }

  return { holders: total, platformWide, clusterOnly, assignments, inactive };
}

interface PlatformAccessSummaryProps {
  summary: RegistrySummary | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Applies the inactive filter. The warning is an entry point, not just a tint. */
  onShowInactive?: () => void;
}

export function PlatformAccessSummary({
  summary,
  loading,
  error = false,
  onRetry = () => {},
  onShowInactive,
}: PlatformAccessSummaryProps) {
  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message="Couldn't load the registry summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-28" />
          <Skeleton className="h-14 min-w-[14rem] flex-1" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="border-border sm:border-r sm:pr-8">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {summary.holders}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">
              {summary.holders === 1 ? 'holder' : 'holders'}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.1em]">
              This page only
            </span>
            <dl
              aria-label="Role-scope breakdown for the currently loaded page, not the full registry"
              className="flex flex-wrap gap-x-8 gap-y-3"
            >
              <div>
                <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Platform-wide</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{summary.platformWide}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Cluster-scoped</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{summary.clusterOnly}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-[11px] uppercase tracking-[0.1em]">Assignments</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{summary.assignments}</dd>
              </div>
            </dl>
          </div>

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
