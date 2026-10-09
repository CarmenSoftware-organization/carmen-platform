import { AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { ApplicationStatus, ApplicationSummaryData, DeviceCount } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { formatDevice } from '../../utils/device';
import { APPLICATION_STATUSES, STATUS_LABEL_KEY } from '../../utils/applicationStatus';

const DEVICE_ORDER = ['web', 'mobile', 'desktop', 'pos'];
const rank = (d: string) => {
  const i = DEVICE_ORDER.indexOf(d);
  return i === -1 ? DEVICE_ORDER.length : i;
};

/**
 * Order the histogram by platform, not by count.
 *
 * Applied at render rather than baked into the backend response, so there is one display rule
 * in one place regardless of what order `GET /api-system/applications/summary` sends `devices`.
 */
const byPlatform = (devices: DeviceCount[]): DeviceCount[] =>
  [...devices].sort((a, b) => rank(a.device) - rank(b.device) || a.device.localeCompare(b.device));

function ScopeLegend({ swatch, label, value, warn }: { swatch: string; label: string; value: number; warn?: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-xs ${warn ? 'text-warning' : 'text-muted-foreground'}`}>
      {warn ? <AlertTriangle className="size-3.5" /> : <span className={cn('size-2 rounded-xs', swatch)} />}
      {label}
      <span className={`font-mono text-[13px] font-semibold tabular-nums ${warn ? 'text-warning' : 'text-foreground'}`}>{value}</span>
    </span>
  );
}

const SEGMENT_LABEL = 'text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]';

/** One stacked bar over the registry total. Parts are drawn in order; what they leave is the muted track. */
function StackedBar({ parts, total, label }: { parts: { value: number; className: string }[]; total: number; label: string }) {
  return (
    <div className="bg-muted flex h-3 overflow-hidden rounded-full" role="img" aria-label={label}>
      {parts.map((p, i) => (
        <span key={i} className={p.className} style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%` }} />
      ))}
    </div>
  );
}

const STATUS_SWATCH: Record<ApplicationStatus, string> = {
  running: 'bg-success',
  maintenance: 'bg-warning',
  read_only: 'bg-info',
  disabled: 'bg-muted-foreground/50',
};

interface ApplicationRegistrySummaryProps {
  summary: ApplicationSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function ApplicationRegistrySummary({ summary, loading, error = false, onRetry = () => {} }: ApplicationRegistrySummaryProps) {
  const { t } = useI18n();
  const total = summary?.total ?? 0;
  const statuses = summary?.statuses;
  const secrets = summary?.secrets;

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">{t('pages.applications.registry')}</div>

      {error && !summary ? (
        <FetchErrorState message={t('pages.applications.registrySummaryStale')} onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
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
              {t('common.state.summaryStale')}
            </p>
          )}
          <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5', error && 'opacity-70')}>
            <div className="border-border sm:border-r sm:pr-8">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">{t('pages.applications.applicationsLower')}</div>
              {/* Backends that predate status modes send no `statuses`: the split stays a line
                  under the total. With them it is the Service status segment instead. */}
              {!statuses && (
                <div className="text-foreground/80 mt-0.5 text-xs">
                  {t('pages.applications.activeCount', { count: summary.active })}
                  {summary.inactive > 0 ? ` · ${t('pages.applications.inactiveCount', { count: summary.inactive })}` : ''}
                </div>
              )}
            </div>

            <div className="grid min-w-0 flex-1 basis-[28rem] grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {statuses && (
                <div className="min-w-0">
                  <div className={SEGMENT_LABEL}>{t('pages.applications.serviceStatus')}</div>
                  <StackedBar
                    total={total}
                    parts={APPLICATION_STATUSES.map((s) => ({ value: statuses[s] ?? 0, className: STATUS_SWATCH[s] }))}
                    label={t('pages.applications.statusChartAria', {
                      running: statuses.running ?? 0,
                      maintenance: statuses.maintenance ?? 0,
                      readOnly: statuses.read_only ?? 0,
                      disabled: statuses.disabled ?? 0,
                    })}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {/* วาดเฉพาะข้อยกเว้น: running เสมอ ส่วนสถานะอื่นเฉพาะที่มีจริง */}
                    {APPLICATION_STATUSES.filter((s) => s === 'running' || (statuses[s] ?? 0) > 0).map((s) => (
                      <ScopeLegend key={s} swatch={STATUS_SWATCH[s]} label={t(STATUS_LABEL_KEY[s])} value={statuses[s] ?? 0} />
                    ))}
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <div className={SEGMENT_LABEL}>{t('pages.applications.apiAccessScope')}</div>
                <StackedBar
                  total={total}
                  parts={[
                    { value: summary.full_access, className: 'bg-warning' },
                    { value: summary.scoped, className: 'bg-success' },
                  ]}
                  label={t('pages.applications.scopeChartAria', { full: summary.full_access, scoped: summary.scoped })}
                />
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <ScopeLegend swatch="bg-warning" label={t('pages.applications.fullAccess')} value={summary.full_access} warn={summary.full_access > 0} />
                  <ScopeLegend swatch="bg-success" label={t('pages.applications.scoped')} value={summary.scoped} />
                </div>
              </div>

              {secrets && (
                <div className="min-w-0">
                  <div className={SEGMENT_LABEL}>{t('pages.applications.secret.title')}</div>
                  {/* "No secret" is the track itself — the bar fills as apps take a secret on */}
                  <StackedBar
                    total={total}
                    parts={[
                      { value: secrets.enforced, className: 'bg-primary' },
                      { value: secrets.unenforced, className: 'bg-primary/35' },
                    ]}
                    label={t('pages.applications.secretChartAria', secrets)}
                  />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    <ScopeLegend swatch="bg-primary" label={t('pages.applications.secret.enforced')} value={secrets.enforced} />
                    <ScopeLegend swatch="bg-primary/35" label={t('pages.applications.secretUnenforced')} value={secrets.unenforced} />
                    <ScopeLegend swatch="bg-muted border" label={t('pages.applications.secretNone')} value={secrets.none} />
                  </div>
                </div>
              )}

              {(summary.devices ?? []).length > 0 && (
                <div className="min-w-0">
                  <div className={SEGMENT_LABEL}>{t('pages.applications.devices')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {byPlatform(summary.devices ?? []).map((d) => (
                      <span key={d.device} className="text-muted-foreground inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
                        {formatDevice(d.device)}
                        <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums">{d.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
