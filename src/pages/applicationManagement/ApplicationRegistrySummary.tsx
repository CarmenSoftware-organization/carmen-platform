import { AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';
import { cn } from '../../lib/utils';
import type { ApplicationSummaryData, DeviceCount } from '../../types';

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

const capDevice = (d: string) => (d === 'pos' ? 'POS' : d.charAt(0).toUpperCase() + d.slice(1));

function ScopeLegend({ color, label, value, warn }: { color: string; label: string; value: number; warn?: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-xs ${warn ? 'text-warning' : 'text-muted-foreground'}`}>
      {warn ? <AlertTriangle className="size-3.5" /> : <span className="size-2 rounded-xs" style={{ background: color }} />}
      {label}
      <span className={`font-mono text-[13px] font-semibold tabular-nums ${warn ? 'text-warning' : 'text-foreground'}`}>{value}</span>
    </span>
  );
}

interface ApplicationRegistrySummaryProps {
  summary: ApplicationSummaryData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export function ApplicationRegistrySummary({ summary, loading, error = false, onRetry = () => {} }: ApplicationRegistrySummaryProps) {
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[11px] font-bold uppercase tracking-[0.14em]">Registry</div>

      {error && !summary ? (
        <FetchErrorState message="Couldn't load the registry summary." onRetry={onRetry} className="py-3" />
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
              Couldn&apos;t refresh — showing the last known numbers.
            </p>
          )}
          <div className={cn('flex flex-wrap items-center gap-x-8 gap-y-5', error && 'opacity-70')}>
            <div className="border-border sm:border-r sm:pr-8">
              <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{summary.total}</div>
              <div className="text-muted-foreground mt-1 text-[11px] font-medium uppercase tracking-[0.1em]">applications</div>
              <div className="text-foreground/80 mt-0.5 text-xs">
                {summary.active} active{summary.inactive > 0 ? ` · ${summary.inactive} inactive` : ''}
              </div>
            </div>

            <div className="min-w-[14rem] flex-1">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">API access scope</div>
              <div
                className="bg-muted flex h-3 overflow-hidden rounded-full"
                role="img"
                aria-label={`${summary.full_access} full access, ${summary.scoped} scoped`}
              >
                <span className="bg-warning" style={{ width: `${pct(summary.full_access)}%` }} />
                <span className="bg-success" style={{ width: `${pct(summary.scoped)}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                <ScopeLegend color="hsl(var(--warning))" label="Full access" value={summary.full_access} warn={summary.full_access > 0} />
                <ScopeLegend color="hsl(var(--success))" label="Scoped" value={summary.scoped} />
              </div>
            </div>

            {(summary.devices ?? []).length > 0 && (
              <div className="shrink-0">
                <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Devices</div>
                <div className="flex flex-wrap gap-1.5">
                  {byPlatform(summary.devices ?? []).map((d) => (
                    <span key={d.device} className="text-muted-foreground inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
                      {capDevice(d.device)}
                      <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums">{d.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
