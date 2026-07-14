import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, History } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../../components/ui/skeleton';
import { formatClock, dayGroup, relativeTime } from '../../utils/relativeTime';
import { ACTIVITY_SOURCES, type ActivityItem, type ActivityVerb } from './activity';

const VERB: Record<ActivityVerb, { text: string; dot: string }> = {
  created: { text: 'text-success', dot: 'bg-success' },
  updated: { text: 'text-info', dot: 'bg-info' },
  published: { text: 'text-warning', dot: 'bg-warning' },
};

interface ActivityStreamProps {
  items: ActivityItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

export function ActivityStream({ items, loading, error, onRetry }: ActivityStreamProps) {
  const [filter, setFilter] = useState<string>('all');

  const perDomain = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) m[it.domainKey] = (m[it.domainKey] ?? 0) + 1;
    return m;
  }, [items]);

  const shown = filter === 'all' ? items : items.filter((i) => i.domainKey === filter);

  const chips = [{ key: 'all', label: 'All', count: items.length }].concat(
    ACTIVITY_SOURCES.map((s) => ({ key: s.key, label: s.label, count: perDomain[s.key] ?? 0 })),
  );

  return (
    <div>
      {/* filter chips */}
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter activity by domain">
        {chips.map((c) => {
          const on = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(c.key)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-input hover:text-foreground',
              )}
            >
              {c.label}
              <span className="font-mono text-[10px] tabular-nums opacity-75">{c.count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <StreamSkeleton />
      ) : error ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          Couldn’t load recent activity.{' '}
          <button type="button" onClick={onRetry} className="text-primary underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <History className="text-muted-foreground/60 size-6" />
          <p className="text-foreground text-sm font-medium">Nothing changed here yet</p>
          <p className="text-xs">When you create or edit anything, it shows up in this stream.</p>
        </div>
      ) : (
        <Timeline items={shown} />
      )}
    </div>
  );
}

function Timeline({ items }: { items: ActivityItem[] }) {
  const now = new Date();
  let lastDay = '';

  return (
    <div>
      {items.map((it, i) => {
        const g = dayGroup(it.at, now);
        const header = g.key !== lastDay;
        lastDay = g.key;
        const nextIsNewDay = i === items.length - 1 || dayGroup(items[i + 1].at, now).key !== g.key;
        const verb = VERB[it.verb];
        const Icon = it.icon;

        return (
          <div key={`${it.domainKey}:${it.id}`}>
            {header && (
              <div className="bg-background text-muted-foreground sticky top-0 z-[1] flex items-baseline gap-2 pb-2 pt-3.5 text-[11px] font-bold uppercase tracking-[0.12em]">
                {g.label}
              </div>
            )}
            <div className="grid grid-cols-[3.25rem_1.25rem_1fr] items-start">
              <div className="text-muted-foreground pt-[11px] text-right font-mono text-[11.5px] tabular-nums">
                {formatClock(it.at)}
              </div>
              {/* rail + dot */}
              <div className="relative flex justify-center self-stretch">
                <span
                  className={cn(
                    'bg-border absolute w-px',
                    header ? 'top-3' : 'top-0',
                    nextIsNewDay ? 'h-3' : 'bottom-0',
                  )}
                  aria-hidden="true"
                />
                <span className={cn('relative z-[1] mt-[9px] size-2.5 rounded-full ring-2 ring-background', verb.dot)} aria-hidden="true" />
              </div>
              {/* body */}
              <Link
                to={it.href}
                title={`${it.verb} ${it.name} · ${relativeTime(it.at, now)}`}
                className="group hover:bg-primary/5 my-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
              >
                <span className="bg-primary/[0.07] text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg border">
                  <Icon className="size-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn('text-[11px] font-bold uppercase tracking-wide', verb.text)}>{it.verb}</span>
                    <span className="text-foreground text-[13.5px] font-semibold">
                      {it.name}
                      {it.code && <span className="text-muted-foreground ml-1.5 font-mono text-xs font-medium">{it.code}</span>}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    <span className="text-foreground/80 font-medium">{it.domainLabel}</span>
                    {it.who ? ` · by ${it.who}` : ''}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground/50 group-hover:text-primary size-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StreamSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2">
          <Skeleton className="size-7 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
