import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import { normalizeAudit } from '../../utils/audit';
import type { BuSummaryData } from '../../types';

interface BuLike {
  is_active?: boolean;
  deleted_at?: string | null;
  cluster_id?: string;
  cluster_name?: string;
  audit?: { deleted?: { at?: string } };
}

/**
 * Roll a (non-deleted) business-unit list up into overview counts.
 *
 * แหล่งเดียวของแถบสรุป — ห้ามแทนด้วย `summary` ที่ endpoint รายการส่งมา ค่านั้นคำนวณจาก `where`
 * ชุดเดียวกับตาราง จึงผูกกับ search/advance และทำให้แถบที่นั่งอยู่เหนือ filter ขยับตามการค้นหา
 * ซึ่งเป็นบั๊กที่เพิ่งถอดออกไป · เฟส 2 จะตัดคำขอ `perpage: -1` ที่ป้อนฟังก์ชันนี้ออก จนกว่าจะถึง
 * ตอนนั้นนี่คือทางเดียว — ดู
 * docs/superpowers/specs/2026-08-24-summary-band-follows-filter-five-pages-design.md
 *
 * Sole source for the band. Do NOT swap in the `summary` block the list endpoint returns: it is
 * computed from the same `where` the table uses, so it follows search/advance and makes a band
 * that sits above the filter move with it — the bug this just removed. Phase 2 will drop the
 * `perpage: -1` read that feeds this; until then this is the only path.
 *
 * `deleted` is passed in separately because soft-deleted rows are excluded from the list feed
 * — the client cannot see them at all, which is exactly why this metric wanted a backend
 * block in the first place.
 */
export function summarizeBus(list: BuLike[], deleted = 0): BuSummaryData {
  let active = 0;
  let inactive = 0;
  const clusters = new Set<string>();
  for (const bu of list) {
    if (normalizeAudit(bu).deleted?.at) continue; // defensive: never count a deleted row
    if (bu.is_active) active += 1;
    else inactive += 1;
    const cluster = bu.cluster_id ?? bu.cluster_name;
    if (cluster) clusters.add(String(cluster));
  }
  return { total: active + inactive, active, inactive, deleted, clusters: clusters.size };
}

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
