import { Fragment } from 'react';
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
}

export function RolesAccessSummary({ summary, loading, error = false, onRetry = () => {} }: RolesAccessSummaryProps) {
  // The widest role anchors the bar scale. Derived here rather than carried on the wire —
  // it is always `top_roles[0].permission_count`, so sending it would be a second copy of a
  // number already present, free to drift.
  const { t } = useI18n();
  const barScale = summary?.top_roles?.[0]?.permission_count ?? 0;

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
              </div>
            </div>

            <div className="min-w-[16rem] flex-1">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.roles.broadestRoles')}</div>
              {(summary.top_roles ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('pages.roles.noRolesYet')}</p>
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
                        aria-label={
                          r.permission_count === 1
                            ? t('pages.roles.roleBarAria', { name: r.name, count: r.permission_count })
                            : t('pages.roles.roleBarAriaPlural', { name: r.name, count: r.permission_count })
                        }
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
        </>
      )}
    </Card>
  );
}
