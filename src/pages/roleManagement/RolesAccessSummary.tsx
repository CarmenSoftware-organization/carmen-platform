import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import type { RolesSummaryData } from '../../types';

interface RoleLike {
  id: string;
  name?: string;
  is_active?: boolean;
  permission_count?: number;
}

/** How many roles to spotlight in the breadth bars. */
export const TOP_ROLES = 3;

/**
 * TEMPORARY FALLBACK — roll roles up into RBAC counts and rank them by breadth.
 *
 * The endpoint now returns this shape as its `summary` block; this only fills the gap for a
 * frontend deployed ahead of its backend. Delete it once the block is live everywhere
 * (docs/superpowers/plans/2026-08-10-list-summary-block-phase-2.md, Task 6).
 *
 * `deleted` cannot be known here: the list feed excludes soft-deleted rows entirely, so this
 * path always reports 0. Only the backend block can fill it truthfully.
 */
export function summarizeRoles(list: RoleLike[]): RolesSummaryData {
  let active = 0;
  let inactive = 0;
  for (const r of list) {
    if (r.is_active) active += 1;
    else inactive += 1;
  }
  const ranked = list
    .map((r) => ({
      id: r.id,
      name: r.name || '(unnamed role)',
      permission_count: r.permission_count ?? 0,
    }))
    .sort((a, b) => b.permission_count - a.permission_count);
  return {
    total: active + inactive,
    active,
    inactive,
    deleted: 0,
    top_roles: ranked.slice(0, TOP_ROLES),
  };
}

interface RolesAccessSummaryProps {
  summary: RolesSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function RolesAccessSummary({ summary, loading, error = false, onRetry = () => {} }: RolesAccessSummaryProps) {
  // The widest role anchors the bar scale. Derived here rather than carried on the wire —
  // it is always `top_roles[0].permission_count`, so sending it would be a second copy of a
  // number already present, free to drift.
  const barScale = summary?.top_roles?.[0]?.permission_count ?? 0;

  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message="Couldn't load the roles summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[16rem] flex-1" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="border-border sm:border-r sm:pr-8">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
            <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">roles</div>
            <div className="text-foreground/80 mt-0.5 text-xs">
              {summary.active} active{summary.inactive > 0 ? ` · ${summary.inactive} inactive` : ''}
            </div>
          </div>

          <div className="min-w-[16rem] flex-1">
            <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Broadest roles</div>
            {(summary.top_roles ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No roles yet.</p>
            ) : (
              <div className="space-y-2">
                {(summary.top_roles ?? []).map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <Link
                      to={`/platform/roles/${r.id}/edit`}
                      className="hover:text-primary w-28 shrink-0 truncate text-sm hover:underline"
                      title={r.name}
                    >
                      {r.name}
                    </Link>
                    <div
                      className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
                      role="img"
                      aria-label={`${r.name}: ${r.permission_count} permission${r.permission_count === 1 ? '' : 's'}`}
                    >
                      <span
                        className="bg-primary block h-full rounded-full"
                        style={{ width: `${barScale > 0 ? (r.permission_count / barScale) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums">{r.permission_count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
