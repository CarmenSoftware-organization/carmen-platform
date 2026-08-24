import { Fragment } from 'react';
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
 * Roll roles up into RBAC counts and rank them by breadth.
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
              <div className="grid grid-cols-[minmax(0,max-content)_1fr_auto] items-center gap-x-3 gap-y-2">
                {(summary.top_roles ?? []).map((r) => (
                  <Fragment key={r.id}>
                    <Link
                      to={`/platform/roles/${r.id}/edit`}
                      className="hover:text-primary truncate text-sm hover:underline"
                      title={r.name}
                    >
                      {r.name}
                    </Link>
                    <div
                      className="bg-muted h-2 overflow-hidden rounded-full"
                      role="img"
                      aria-label={`${r.name}: ${r.permission_count} permission${r.permission_count === 1 ? '' : 's'}`}
                    >
                      <span
                        className="bg-primary block h-full rounded-full"
                        style={{ width: `${barScale > 0 ? (r.permission_count / barScale) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[13px] font-semibold tabular-nums">{r.permission_count}</span>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
