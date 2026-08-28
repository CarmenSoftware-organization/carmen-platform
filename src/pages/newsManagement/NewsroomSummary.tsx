import { Link } from 'react-router-dom';
import { Newspaper, Globe, Building2, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { translate } from '../../i18n/translate';
import type { TFunction } from '../../i18n/types';
import type { NewsSummaryData } from '../../types';

/**
 * Relative "time since" for the lead story's publish date. `now` is injectable for tests.
 *
 * @param t Optional translator. Omit it to render from the English catalog (see `tr`
 * below) — this is what keeps `NewsroomSummary.test.tsx`'s frozen positional calls
 * (`timeAgo(iso, now)`, no third argument) rendering exactly what they render today.
 * Shape copied from `src/utils/validation.ts`.
 */
export function timeAgo(iso?: string, now = Date.now(), t?: TFunction): string {
  // Falls back to the English catalog when no translator is supplied. The fallback READS
  // the catalog rather than holding its own copy of these strings — a retyped string here
  // would be a second source of truth that drifts silently.
  const tr: TFunction = t ?? ((key, params) => translate('en', key, params));

  // Dev-only signal for a page that forgets to pass `t`: fires only when the UI is
  // actually Thai (`document.documentElement.lang`, set by useI18n.tsx), so it can't fire
  // in jsdom, where `documentElement.lang` is `''` by default — none of the frozen
  // positional tests see it.
  if (
    process.env.NODE_ENV === 'development' &&
    !t &&
    typeof document !== 'undefined' &&
    document.documentElement.lang === 'th'
  ) {
    console.warn('[i18n] timeAgo called without `t` — this message renders English');
  }

  if (!iso) return tr('pages.news.time.none');
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return tr('pages.news.time.none');
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return tr('pages.news.time.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return tr('pages.news.time.minAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr(hr === 1 ? 'pages.news.time.hourAgo' : 'pages.news.time.hoursAgo', { count: hr });
  const day = Math.floor(hr / 24);
  if (day === 1) return tr('pages.news.time.yesterday');
  if (day < 7) return tr('pages.news.time.daysAgo', { count: day });
  const wk = Math.floor(day / 7);
  if (wk < 5) return tr(wk === 1 ? 'pages.news.time.weekAgo' : 'pages.news.time.weeksAgo', { count: wk });
  // Trailing date fallback — a date format, not text, so it stays untranslated.
  const d = new Date(then);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Stage({ label, value, tone }: { label: string; value: number; tone: 'muted' | 'success' }) {
  return (
    <div className="text-center">
      <div className={`font-mono text-2xl font-semibold tabular-nums ${tone === 'success' ? 'text-success' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-muted-foreground mt-0.5 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]">
        <span className={`size-1.5 rounded-full ${tone === 'success' ? 'bg-success' : 'bg-muted-foreground/40'}`} />
        {label}
      </div>
    </div>
  );
}

function Reach({ buCount }: { buCount: number }) {
  const { t } = useI18n();
  if (buCount > 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Building2 className="size-3" />
        {buCount} BU{buCount === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Globe className="size-3" />
      {t('common.option.global')}
    </span>
  );
}

interface NewsroomSummaryProps {
  summary: NewsSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function NewsroomSummary({ summary, loading, error = false, onRetry = () => {} }: NewsroomSummaryProps) {
  const { t } = useI18n();
  return (
    <Card className="p-4 sm:p-5">
      {error && !summary ? (
        <FetchErrorState
          message={t('pages.news.summaryLoadFailed')}
          onRetry={onRetry}
          className="justify-between gap-3 py-2"
        />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="min-w-[16rem] flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-full max-w-md" />
          </div>
          <Skeleton className="h-14 w-64" />
        </div>
      ) : (
        <>
          {/* Stale-but-plausible, not broken: the previous successful numbers are kept on a
              later failure rather than blanked, so this must stay visible without reading as
              an error screen — dim the numbers, announce it to assistive tech, keep the
              register calm. Matches ClusterManagement's FleetCapacity. */}
          {error && (
            <p className="text-muted-foreground mb-2 text-xs" role="alert">
              {t('common.state.summaryStale')}
            </p>
          )}
          <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5', error && 'opacity-70')}>
            <div className="min-w-[16rem] flex-1">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.news.latest')}</div>
              {summary.latest ? (
                <div className="flex items-start gap-3">
                  {summary.latest.image_url ? (
                    <img
                      src={summary.latest.image_url}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-md border object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <div className="bg-muted text-muted-foreground/60 grid h-12 w-16 shrink-0 place-items-center rounded-md border">
                      <Newspaper className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <Link
                      to={`/news/${summary.latest.id}/edit`}
                      className="hover:text-primary line-clamp-2 text-base font-bold leading-snug tracking-tight"
                    >
                      {summary.latest.title}
                    </Link>
                    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span>{t('common.status.published')} {timeAgo(summary.latest.published_at ?? undefined, undefined, t)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <Reach buCount={summary.latest.bu_count} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="bg-muted text-muted-foreground/60 grid h-12 w-16 shrink-0 place-items-center rounded-md border">
                    <Newspaper className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t('pages.news.nothingPublishedYet')}</div>
                    <div className="text-muted-foreground text-xs">{t('pages.news.publishArticleHint')}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-border shrink-0 sm:border-l sm:pl-8">
              <div className="flex items-center gap-3">
                <Stage label={t('pages.news.draft')} value={summary.draft} tone="muted" />
                <ChevronRight className="text-muted-foreground/30 size-4 shrink-0" />
                <Stage label={t('common.status.published')} value={summary.published} tone="success" />
                <ChevronRight className="text-muted-foreground/30 size-4 shrink-0" />
                <Stage label={t('common.status.archived')} value={summary.archived} tone="muted" />
              </div>
              <div className="text-muted-foreground mt-2 text-center text-[11px]">
                {summary.total === 1
                  ? t('pages.news.articleTotal', { count: summary.total })
                  : t('pages.news.articlesTotal', { count: summary.total })}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
