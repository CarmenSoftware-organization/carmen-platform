import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { NewestUser, UserSummaryData } from '../../types';
import { useI18n } from '../../hooks/useI18n';

export interface FaceItem {
  id: string;
  initials: string;
  avatarUrl?: string;
  label: string;
}

/**
 * Build the display name from whatever the row carries.
 *
 * Takes the wire shape (`NewestUser`) — the `newest` picks the backend returns in
 * `UserSummaryData` are already narrowed down to just these six fields, so this function only
 * ever sees that shape. `middlename` is absent from that projection on purpose — the stack
 * shows an 8px avatar with the name in a tooltip, so a middle name adds nothing.
 */
function displayName(u: NewestUser, unknownUserLabel: string): string {
  const full = [u.firstname, u.lastname].filter(Boolean).join(' ');
  return full || u.username || u.email || unknownUserLabel;
}

function initialsOf(u: NewestUser): string {
  const f = u.firstname?.trim();
  const l = u.lastname?.trim();
  if (f || l) return ((f?.[0] ?? '') + (l?.[0] ?? '')).toUpperCase();
  const base = (u.username || u.email || '').trim();
  return base ? base.slice(0, 2).toUpperCase() : '?';
}

/** Turn one wire row into the shape the presence stack renders. */
export function toFace(u: NewestUser, unknownUserLabel: string): FaceItem {
  return {
    id: u.id,
    initials: initialsOf(u),
    avatarUrl: u.avatar_url ?? undefined,
    label: displayName(u, unknownUserLabel),
  };
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

function Faces({ faces, total }: { faces: FaceItem[]; total: number }) {
  const { t } = useI18n();
  const extra = Math.max(0, total - faces.length);
  return (
    <div className="shrink-0">
      <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">
        {t('pages.users.recentlyAdded')}
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

interface UserDirectorySummaryProps {
  summary: UserSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

/** Read-first overview band for the user directory: population, lifecycle, faces. */
export function UserDirectorySummary({ summary, loading, error = false, onRetry = () => {} }: UserDirectorySummaryProps) {
  const { t } = useI18n();
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.users.directory')}</div>

      {error && !summary ? (
        <FetchErrorState message={t('pages.users.summaryLoadFailed')} onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[12rem] flex-1" />
          <Skeleton className="h-14 w-40" />
        </div>
      ) : (
        <>
          {/* Stale-but-plausible, not broken: the previous successful numbers are kept on a
              later failure rather than blanked, so this must stay visible without reading as
              an error screen — dim the numbers, announce it to assistive tech, keep the
              register calm. Matches ClusterManagement's FleetCapacity. */}
          {error && (
            <p className="text-muted-foreground mb-2 text-xs" role="alert">
              {t('pages.users.refreshFailed')}
            </p>
          )}
          <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-4', error && 'opacity-70')}>
            <div className="border-border sm:border-r sm:pr-6">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">{t('pages.users.usersCountLabel')}</div>
            </div>

            <div className="min-w-[12rem] flex-1">
              <div
                className="bg-muted flex h-3 overflow-hidden rounded-full"
                role="img"
                aria-label={t('pages.users.activeInactiveSummary', { active: summary.active, inactive: summary.inactive })}
              >
                <span className="bg-success" style={{ width: `${pct(summary.active)}%` }} />
                <span className="bg-muted-foreground/40" style={{ width: `${pct(summary.inactive)}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <Legend color="hsl(var(--success))" label={t('common.status.active')} value={summary.active} />
                <Legend color="hsl(var(--muted-foreground) / 0.4)" label={t('common.status.inactive')} value={summary.inactive} />
                {summary.deleted > 0 && (
                  <Legend color="hsl(var(--destructive))" label={t('common.status.archived')} value={summary.deleted} />
                )}
              </div>
            </div>

            {/* `?? []` for the same reason `devices`/`top_roles` carry it on the sibling bands:
                `userService.getDirectorySummary` falls back to `response.data.data || response.data`,
                so a 200 that didn't unwrap would reach here as the envelope and `.length` would throw
                with no ErrorBoundary above it. */}
            {(summary.newest ?? []).length > 0 && (
              <Faces
                faces={(summary.newest ?? []).map((u) => toFace(u, t('common.state.unknownUser')))}
                total={summary.total}
              />
            )}
          </div>
        </>
      )}
    </Card>
  );
}
