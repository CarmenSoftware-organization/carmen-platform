import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, History } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { formatClock, dayGroup, relativeTime } from '../../utils/relativeTime';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import { ACTIVITY_SOURCES, type ActivityItem, type ActivityVerb } from './activity';

// The verb is deliberately *quiet* — the entity name is what people scan for. Colour
// lives on the timeline dot, the word itself rides the right margin as plain meta text.
const VERB: Record<ActivityVerb, { dot: string; key: TKey }> = {
  created: { dot: 'bg-success', key: 'pages.dashboard.verbCreated' },
  updated: { dot: 'bg-info', key: 'pages.dashboard.verbUpdated' },
  published: { dot: 'bg-warning', key: 'pages.dashboard.verbPublished' },
};

interface ActivityStreamProps {
  items: ActivityItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

export function ActivityStream({ items, loading, error, onRetry }: ActivityStreamProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<string>('all');

  const perDomain = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of items) m[it.domainKey] = (m[it.domainKey] ?? 0) + 1;
    return m;
  }, [items]);

  const shown = filter === 'all' ? items : items.filter((i) => i.domainKey === filter);

  const chips = [{ key: 'all', label: t('pages.dashboard.filterAll'), count: items.length }].concat(
    ACTIVITY_SOURCES.map((s) => ({ key: s.key, label: t(s.labelKey), count: perDomain[s.key] ?? 0 })),
  );

  return (
    <div>
      {/* filter chips */}
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t('pages.dashboard.filterAria')}>
        {chips.map((c) => {
          const on = filter === c.key;
          // A domain with nothing in the stream is a dead end — leave it visible (it still
          // says "zero"), but don't let anyone click through to an empty list.
          const dead = c.key !== 'all' && c.count === 0;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              disabled={dead}
              onClick={() => setFilter(c.key)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-input hover:text-foreground',
                dead && 'pointer-events-none opacity-45 hover:border-border hover:text-muted-foreground',
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
        // Note for future readers: this trades exact inline text-wrap (button riding the
        // last line with the message) for FetchErrorState's flex-wrap layout, where the
        // button can drop to its own centered line at narrow widths. Accepted deliberately
        // to keep a single error/retry implementation — see Task 10 report for the trade-off.
        <FetchErrorState
          message={t('pages.dashboard.activityLoadFailed')}
          onRetry={onRetry}
          className="rounded-lg border border-dashed py-14"
        />
      ) : shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <History className="text-muted-foreground/60 size-6" />
          <p className="text-foreground text-sm font-medium">{t('pages.dashboard.emptyTitle')}</p>
          <p className="text-xs">{t('pages.dashboard.emptyBody')}</p>
        </div>
      ) : (
        <Timeline items={shown} />
      )}
    </div>
  );
}

function Timeline({ items }: { items: ActivityItem[] }) {
  const { t } = useI18n();
  const now = new Date();
  let lastDay = '';

  return (
    <div>
      {items.map((it, i) => {
        const g = dayGroup(it.at, now, t);
        const header = g.key !== lastDay;
        lastDay = g.key;
        // เทียบด้วย `key` ซึ่งไม่ขึ้นกับภาษา — ถ้าเทียบด้วย label การสลับภาษาจะทำให้กลุ่มวันแตก
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
              <div className="text-muted-foreground pt-3 text-right font-mono text-[11px] tabular-nums">
                {formatClock(it.at)}
              </div>
              {/* rail + dot — the dot centres on the title line (20px down: my-0.5 + py-2 +
                  half a 20px line box), matching the clock in the column to its left. */}
              <div className="relative flex justify-center self-stretch">
                <span
                  className={cn(
                    'bg-border absolute w-px',
                    header ? 'top-5' : 'top-0',
                    nextIsNewDay ? 'h-5' : 'bottom-0',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn('relative z-[1] mt-[15px] size-2.5 rounded-full ring-2 ring-background', verb.dot)}
                  aria-hidden="true"
                />
              </div>
              {/* body */}
              <Link
                to={it.href}
                title={`${t(VERB[it.verb].key)} ${it.name || (it.nameFallbackKey ? t(it.nameFallbackKey) : '')} · ${relativeTime(it.at, now, t)}`}
                // min-w-0: as a grid item this link defaults to min-width:auto and would
                // otherwise refuse to shrink below the longest word in the meta line.
                className="group hover:bg-primary/5 my-0.5 flex min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
              >
                <span className="bg-primary/[0.06] text-muted-foreground grid size-7 shrink-0 place-items-center rounded-lg">
                  <Icon className="size-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-semibold leading-5">
                    {it.name || (it.nameFallbackKey ? t(it.nameFallbackKey) : '')}
                    {it.code && <span className="text-muted-foreground ml-1.5 font-mono text-xs font-medium">{it.code}</span>}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    <span className="text-foreground/80 font-medium">{t(it.domainLabelKey)}</span>
                    {/* md and up, the verb and actor ride the right margin instead */}
                    <span className="md:hidden">
                      {` · ${t(verb.key)}`}
                      {it.who ? ` · ${t('pages.dashboard.by', { who: it.who })}` : ''}
                    </span>
                  </span>
                </span>
                {/* Fixed widths on purpose: the verbs form a scannable column, and a row
                    with no known actor must not shift its verb out of that column. */}
                <span className="text-muted-foreground mt-[3px] hidden w-64 shrink-0 items-baseline gap-1.5 self-start text-xs md:flex">
                  <span className="text-foreground/70 w-[4.75rem] shrink-0 font-medium">{t(verb.key)}</span>
                  {it.who && <span className="truncate">{t('pages.dashboard.by', { who: it.who })}</span>}
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
  const { t } = useI18n();
  return (
    <div className="space-y-2" role="status" aria-label={t('pages.dashboard.loadingActivity')}>
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
