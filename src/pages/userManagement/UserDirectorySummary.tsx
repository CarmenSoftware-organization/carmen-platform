import { Building2 } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';

interface UserLike {
  id: string;
  is_active?: boolean;
  deleted_at?: string | null;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  name?: string;
  username?: string;
  email?: string;
  avatar_url?: string;
  created_at?: string;
  business_unit?: { id: string; is_active?: boolean }[];
  audit?: { created?: { at?: string }; deleted?: { at?: string } };
}

export interface FaceItem {
  id: string;
  initials: string;
  avatarUrl?: string;
  label: string;
}

export interface UserSummaryData {
  total: number; // non-deleted users
  active: number;
  inactive: number;
  archived: number; // soft-deleted (counted separately — excluded from the list feed)
  businessUnits: number; // distinct BUs the population spans
  faces: FaceItem[]; // newest users, most-recent first
}

/** How many overlapping faces to show before collapsing the rest into "+N". */
export const FACE_LIMIT = 6;

const deletedAt = (u: UserLike) => u.deleted_at ?? u.audit?.deleted?.at ?? null;
const createdAt = (u: UserLike) => u.created_at ?? u.audit?.created?.at ?? '';

function displayName(u: UserLike): string {
  const full = [u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ');
  return full || u.name || u.username || u.email || 'Unknown user';
}

function initialsOf(u: UserLike): string {
  const f = u.firstname?.trim();
  const l = u.lastname?.trim();
  if (f || l) return ((f?.[0] ?? '') + (l?.[0] ?? '')).toUpperCase();
  const base = (u.name || u.username || u.email || '').trim();
  return base ? base.slice(0, 2).toUpperCase() : '?';
}

function toFace(u: UserLike): FaceItem {
  return { id: u.id, initials: initialsOf(u), avatarUrl: u.avatar_url, label: displayName(u) };
}

/**
 * Roll a (non-deleted) user list up into directory overview counts. `archived` is
 * passed in separately because soft-deleted rows are excluded from the list feed.
 * `faces` are the newest members — the signature "recently added" presence stack.
 */
export function summarizeUsers(list: UserLike[], archived = 0): UserSummaryData {
  let active = 0;
  let inactive = 0;
  const bus = new Set<string>();
  const alive: UserLike[] = [];
  for (const u of list) {
    if (deletedAt(u)) continue; // defensive: never count a deleted row
    alive.push(u);
    if (u.is_active) active += 1;
    else inactive += 1;
    for (const b of u.business_unit ?? []) if (b?.id) bus.add(b.id);
  }
  const faces = alive
    .map((u) => ({ u, t: Date.parse(createdAt(u)) || 0 }))
    .sort((a, b) => b.t - a.t)
    .slice(0, FACE_LIMIT)
    .map(({ u }) => toFace(u));
  return { total: active + inactive, active, inactive, archived, businessUnits: bus.size, faces };
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

function Faces({ faces, total }: { faces: FaceItem[]; total: number }) {
  const extra = Math.max(0, total - faces.length);
  return (
    <div className="shrink-0">
      <div className="text-muted-foreground mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]">
        Recently added
      </div>
      <div className="flex items-center -space-x-2">
        {faces.map((f) => (
          <Avatar key={f.id} className="ring-card h-8 w-8 ring-2" title={f.label}>
            <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">
              {f.initials}
            </AvatarFallback>
            {f.avatarUrl && (
              <AvatarImage
                src={f.avatarUrl}
                alt=""
                className="absolute inset-0 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </Avatar>
        ))}
        {extra > 0 && (
          <span className="ring-card bg-muted text-muted-foreground grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold tabular-nums ring-2">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

/** Read-first overview band for the user directory: population, lifecycle, faces. */
export function UserDirectorySummary({ summary, loading }: { summary: UserSummaryData | null; loading: boolean }) {
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em]">Directory</div>

      {loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[12rem] flex-1" />
          <Skeleton className="h-14 w-40" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="border-border sm:border-r sm:pr-6">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
            <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">users</div>
          </div>

          <div className="min-w-[12rem] flex-1">
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

          {summary.faces.length > 0 && <Faces faces={summary.faces} total={summary.total} />}
        </div>
      )}
    </Card>
  );
}
