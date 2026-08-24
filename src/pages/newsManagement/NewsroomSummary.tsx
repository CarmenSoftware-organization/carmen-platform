import { Link } from 'react-router-dom';
import { Newspaper, Globe, Building2, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { NewsSummaryData } from '../../types';

interface NewsLike {
  id: string;
  title?: string;
  status?: string;
  image_url?: string;
  image?: string;
  published_at?: string;
  business_unit_ids?: string[];
  deleted_at?: string;
}

/**
 * Roll the (non-deleted) news list into pipeline counts and pick the
 * lead story, the most recently published article that anchors the masthead.
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
 * `deleted` always reports 0 here: the list feed excludes soft-deleted rows entirely, so this
 * path cannot see them. Note that `archived` is a STATUS, not a deletion — the two are
 * different things on this entity alone.
 */
export function summarizeNews(list: NewsLike[]): NewsSummaryData {
  let draft = 0;
  let published = 0;
  let archived = 0;
  let lead: NewsLike | null = null;

  for (const n of list) {
    if (n.deleted_at) continue;
    const status = n.status || 'draft';
    if (status === 'published') {
      published += 1;
      if (!lead || (Date.parse(n.published_at ?? '') || 0) > (Date.parse(lead.published_at ?? '') || 0)) lead = n;
    } else if (status === 'archived') {
      archived += 1;
    } else {
      draft += 1;
    }
  }

  return {
    total: draft + published + archived,
    deleted: 0,
    draft,
    published,
    archived,
    latest: lead
      ? {
          id: lead.id,
          title: lead.title || '(untitled)',
          image_url: lead.image_url || lead.image || null,
          published_at: lead.published_at ?? null,
          bu_count: lead.business_unit_ids?.length ?? 0,
        }
      : null,
  };
}

/** Relative "time since" for the lead story's publish date. `now` is injectable for tests. */
export function timeAgo(iso?: string, now = Date.now()): string {
  if (!iso) return '-';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '-';
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} week${wk === 1 ? '' : 's'} ago`;
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
      Global
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
  return (
    <Card className="p-4 sm:p-5">
      {error && !summary ? (
        <FetchErrorState
          message="Couldn't load the newsroom summary."
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
              Couldn&apos;t refresh — showing the last known numbers.
            </p>
          )}
          <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5', error && 'opacity-70')}>
            <div className="min-w-[16rem] flex-1">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Latest</div>
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
                      <span>Published {timeAgo(summary.latest.published_at ?? undefined)}</span>
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
                    <div className="text-sm font-semibold">Nothing published yet</div>
                    <div className="text-muted-foreground text-xs">Publish an article to make it visible to readers.</div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-border shrink-0 sm:border-l sm:pl-8">
              <div className="flex items-center gap-3">
                <Stage label="Draft" value={summary.draft} tone="muted" />
                <ChevronRight className="text-muted-foreground/30 size-4 shrink-0" />
                <Stage label="Published" value={summary.published} tone="success" />
                <ChevronRight className="text-muted-foreground/30 size-4 shrink-0" />
                <Stage label="Archived" value={summary.archived} tone="muted" />
              </div>
              <div className="text-muted-foreground mt-2 text-center text-[11px]">
                {summary.total} article{summary.total === 1 ? '' : 's'} total
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
