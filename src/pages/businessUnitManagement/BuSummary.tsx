import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';

interface BuLike {
  is_active?: boolean;
  deleted_at?: string | null;
  cluster_id?: string;
  cluster_name?: string;
  audit?: { deleted?: { at?: string } };
}

export interface BuSummaryData {
  total: number; // non-deleted business units
  active: number;
  inactive: number;
  archived: number; // soft-deleted
  clusters: number; // distinct clusters they span
}

/**
 * Roll a (non-deleted) business-unit list up into overview counts. `archived` is
 * passed in separately because soft-deleted rows are excluded from the list feed.
 */
export function summarizeBus(list: BuLike[], archived = 0): BuSummaryData {
  let active = 0;
  let inactive = 0;
  const clusters = new Set<string>();
  for (const bu of list) {
    if (bu.deleted_at ?? bu.audit?.deleted?.at) continue; // defensive: never count a deleted row
    if (bu.is_active) active += 1;
    else inactive += 1;
    const cluster = bu.cluster_id ?? bu.cluster_name;
    if (cluster) clusters.add(String(cluster));
  }
  return { total: active + inactive, active, inactive, archived, clusters: clusters.size };
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
      <span className="text-foreground font-mono text-[13px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}

export function BuSummary({ summary, loading }: { summary: BuSummaryData | null; loading: boolean }) {
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em]">Overview</div>

      {loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
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
              {summary.archived > 0 && (
                <Legend color="hsl(var(--destructive))" label="Archived" value={summary.archived} />
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
