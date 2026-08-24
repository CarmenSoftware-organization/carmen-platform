import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { BuSummaryData } from '../../types';

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="size-2 rounded-xs" style={{ background: color }} />
      {label}
      <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

interface BuSummaryProps {
  summary: BuSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function BuSummary({ summary, loading, error = false, onRetry = () => {} }: BuSummaryProps) {
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">Overview</div>

      {error && !summary ? (
        <FetchErrorState message="Couldn't load the business unit summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        <>
          {/* Stale-but-plausible, not broken: the previous successful numbers are kept on a
              later failure rather than blanked, so this must stay visible without reading as
              an error screen — dim the numbers, announce it to assistive tech, keep the
              register calm. Matches ClusterManagement's FleetCapacity. */}
          {error && (
            <p className="text-muted-foreground mb-2 text-xs" role="alert">
              Couldn&apos;t refresh — showing the last known numbers.
            </p>
          )}
          <div className={cn('grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center', error && 'opacity-70')}>
            <div className="border-border sm:border-r sm:pr-6">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">business units</div>
              <div className="text-foreground/80 mt-0.5 text-xs">
                across {summary.clusters} cluster{summary.clusters === 1 ? '' : 's'}
              </div>
            </div>
            <div className="min-w-0">
              <div
                className="bg-muted flex h-3 overflow-hidden rounded-full"
                role="img"
                aria-label={`${summary.active} active, ${summary.inactive} inactive`}
              >
                <span className="bg-success" style={{ width: `${pct(summary.active)}%` }} />
                <span className="bg-muted-foreground/40" style={{ width: `${pct(summary.inactive)}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <Legend color="hsl(var(--success))" label="Active" value={summary.active} />
                <Legend color="hsl(var(--muted-foreground) / 0.4)" label="Inactive" value={summary.inactive} />
                {summary.deleted > 0 && (
                  <Legend color="hsl(var(--destructive))" label="Archived" value={summary.deleted} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
