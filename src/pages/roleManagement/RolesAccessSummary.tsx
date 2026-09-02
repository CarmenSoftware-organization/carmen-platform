import { Fragment } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { RolesSummaryData } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface RolesAccessSummaryProps {
  summary: RolesSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Size of the permission catalog; `0` when it hasn't loaded. Anchors the bar scale. */
  catalogSize?: number;
}

export function RolesAccessSummary({ summary, loading, error = false, onRetry = () => {}, catalogSize = 0 }: RolesAccessSummaryProps) {
  // The catalog anchors the bar scale, not the widest role. Scaling to `top_roles[0]` made the
  // top bar full-width by construction — it said "widest of these three", never "holds
  // everything", which are the two readings an access review has to tell apart. Without the
  // catalog there is no scale worth drawing, so the bars are dropped rather than rescaled to
  // a stand-in; the counts beside them are true on their own.
  const { t } = useI18n();
  const anchored = catalogSize > 0;

  return (
    <Card className="p-4 sm:p-5">
      {error && !summary ? (
        <FetchErrorState message={t('pages.roles.summaryStale')} onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[16rem] flex-1" />
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
            <div className="border-border sm:border-r sm:pr-8">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">{t('pages.roles.rolesLower')}</div>
              <div className="text-foreground/80 mt-0.5 text-xs">
                {t('pages.roles.activeCount', { count: summary.active })}
                {summary.inactive > 0 ? ` · ${t('pages.roles.inactiveCount', { count: summary.inactive })}` : ''}
                {/* `deleted` has always been on the wire and never rendered — soft-deleted roles
                    are part of the access history an audit reads, so silence was a defect. */}
                {summary.deleted > 0 ? ` · ${t('pages.roles.removedCount', { count: summary.deleted })}` : ''}
              </div>
            </div>

            <div className="min-w-[16rem] flex-1">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">
                {t('pages.roles.broadestRoles')}
                {anchored && (
                  <span className="ml-1.5 font-medium normal-case tracking-normal">{t('pages.roles.ofCatalog', { total: catalogSize })}</span>
                )}
              </div>
              {(summary.top_roles ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('pages.roles.noRolesYet')}</p>
              ) : (
                <div className="grid grid-cols-[minmax(0,max-content)_1fr_max-content] items-center gap-x-3 gap-y-2">
                  {(summary.top_roles ?? []).map((r) => {
                    const full = anchored && r.permission_count >= catalogSize;
                    return (
                      <Fragment key={r.id}>
                        <Link
                          to={`/platform/roles/${r.id}/edit`}
                          className="hover:text-primary truncate text-sm hover:underline"
                          title={r.name}
                        >
                          {r.name}
                        </Link>
                        {anchored ? (
                          <div
                            className="bg-muted h-2 overflow-hidden rounded-full"
                            role="img"
                            aria-label={
                              full
                                ? t('pages.roles.reachFullAria', { name: r.name, total: catalogSize })
                                : t('pages.roles.reachAria', { name: r.name, count: r.permission_count, total: catalogSize })
                            }
                          >
                            <span
                              className={cn('block h-full rounded-full', full ? 'bg-warning' : 'bg-primary')}
                              style={{ width: `${Math.min(100, (r.permission_count / catalogSize) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <span />
                        )}
                        <span className="flex items-center justify-end gap-1 font-mono text-[13px] tabular-nums">
                          {full && <AlertTriangle className="text-warning size-3.5 shrink-0" aria-hidden="true" />}
                          <span className={cn('font-semibold', full && 'text-warning')}>{r.permission_count}</span>
                          {anchored && <span className="text-muted-foreground">/{catalogSize}</span>}
                        </span>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
