import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';

interface RoleLike {
  id: string;
  name?: string;
  is_active?: boolean;
  permission_count?: number;
}

export interface TopRole {
  id: string;
  name: string;
  count: number;
}

export interface RolesSummaryData {
  total: number;
  active: number;
  inactive: number;
  topRoles: TopRole[]; // broadest first, up to 3
  maxCount: number; // widest role's permission count — the bar scale
}

/** How many roles to spotlight in the breadth bars. */
export const TOP_ROLES = 3;

/**
 * Roll roles up into RBAC counts and rank them by breadth — how many permissions
 * each grants. The widest role is the most powerful, so it anchors the bar scale.
 */
export function summarizeRoles(list: RoleLike[]): RolesSummaryData {
  let active = 0;
  let inactive = 0;
  for (const r of list) {
    if (r.is_active) active += 1;
    else inactive += 1;
  }
  const ranked = list
    .map((r) => ({ id: r.id, name: r.name || '(unnamed role)', count: r.permission_count ?? 0 }))
    .sort((a, b) => b.count - a.count);
  return {
    total: active + inactive,
    active,
    inactive,
    topRoles: ranked.slice(0, TOP_ROLES),
    maxCount: ranked.length ? ranked[0].count : 0,
  };
}

interface RolesAccessSummaryProps {
  summary: RolesSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function RolesAccessSummary({ summary, loading, error = false, onRetry = () => {} }: RolesAccessSummaryProps) {
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
            {summary.topRoles.length === 0 ? (
              <p className="text-muted-foreground text-sm">No roles yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.topRoles.map((r) => (
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
                      aria-label={`${r.name}: ${r.count} permission${r.count === 1 ? '' : 's'}`}
                    >
                      <span
                        className="bg-primary block h-full rounded-full"
                        style={{ width: `${summary.maxCount > 0 ? (r.count / summary.maxCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums">{r.count}</span>
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
