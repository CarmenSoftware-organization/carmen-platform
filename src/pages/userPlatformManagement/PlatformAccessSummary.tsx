import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';

interface UserLike {
  id: string;
  is_active?: boolean;
}

// A user's role count is 'error' when userRoleService.list() rejected for that
// user — distinct from a resolved count of 0, so a fetch failure never reads
// as "no roles".
export type RoleCountValue = number | 'error';

export interface UserPlatformSummaryData {
  total: number;
  active: number;
  inactive: number;
  privileged: number; // users holding at least one platform role
  unprivileged: number;
  unknown: number; // users whose role fetch failed — excluded from privileged/unprivileged
  assignments: number; // total platform-role assignments across all users with a resolved count
}

/**
 * Roll platform users up into a governance view: status, how many hold platform
 * roles (the privileged, audit-worthy set), and the total assignments granted.
 * `rolesCount` maps user id → number of platform roles assigned, or 'error' if
 * that user's role fetch failed. Failed fetches are counted separately as
 * `unknown` and never folded into `privileged`/`unprivileged`.
 */
export function summarizeUserPlatform(users: UserLike[], rolesCount: Record<string, RoleCountValue>): UserPlatformSummaryData {
  let active = 0;
  let inactive = 0;
  let privileged = 0;
  let unknown = 0;
  let assignments = 0;
  for (const u of users) {
    if (u.is_active) active += 1;
    else inactive += 1;
    const c = rolesCount[u.id];
    if (c === 'error') {
      unknown += 1;
      continue;
    }
    const n = c ?? 0;
    if (n > 0) privileged += 1;
    assignments += n;
  }
  const total = active + inactive;
  return { total, active, inactive, privileged, unprivileged: total - privileged - unknown, unknown, assignments };
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

interface PlatformAccessSummaryProps {
  summary: UserPlatformSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function PlatformAccessSummary({ summary, loading, error = false, onRetry = () => {} }: PlatformAccessSummaryProps) {
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      {error ? (
        <FetchErrorState message="Couldn't load the platform access summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[14rem] flex-1" />
          <Skeleton className="h-14 w-24" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="border-border sm:border-r sm:pr-8">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
            <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">users</div>
            <div className="text-foreground/80 mt-0.5 text-xs">
              {summary.active} active{summary.inactive > 0 ? ` · ${summary.inactive} inactive` : ''}
            </div>
          </div>

          <div className="min-w-[14rem] flex-1">
            <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Platform roles held</div>
            <div
              className="bg-muted flex h-3 overflow-hidden rounded-full"
              role="img"
              aria-label={`${summary.privileged} with platform roles, ${summary.unprivileged} with none${summary.unknown > 0 ? `, ${summary.unknown} unknown — role data failed to load` : ''}`}
            >
              <span className="bg-primary" style={{ width: `${pct(summary.privileged)}%` }} />
              <span className="bg-muted-foreground/40" style={{ width: `${pct(summary.unprivileged)}%` }} />
              {summary.unknown > 0 && <span className="bg-warning" style={{ width: `${pct(summary.unknown)}%` }} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <Legend color="hsl(var(--primary))" label="With platform roles" value={summary.privileged} />
              <Legend color="hsl(var(--muted-foreground) / 0.4)" label="None" value={summary.unprivileged} />
              {summary.unknown > 0 && (
                <Legend color="hsl(var(--warning))" label="Unknown — couldn't load" value={summary.unknown} />
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="font-mono text-2xl font-semibold tabular-nums">{summary.assignments}</div>
            <div className="text-muted-foreground text-[11px]">role assignment{summary.assignments === 1 ? '' : 's'}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
