import { AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { FetchErrorState } from '../../components/FetchErrorState';

interface AppLike {
  is_active?: boolean;
  allow_all?: boolean;
  device?: string;
}

export interface DeviceCount {
  device: string;
  count: number;
}

export interface ApplicationSummaryData {
  total: number;
  active: number;
  inactive: number;
  fullAccess: number; // allow_all — can call every endpoint (audit-worthy)
  scoped: number; // restricted to a named api set
  devices: DeviceCount[];
}

const DEVICE_ORDER = ['web', 'mobile', 'desktop', 'pos'];
const rank = (d: string) => {
  const i = DEVICE_ORDER.indexOf(d);
  return i === -1 ? DEVICE_ORDER.length : i;
};

/** Roll the app list into registry counts: status, API-access scope, and the device-platform mix. */
export function summarizeApplications(list: AppLike[]): ApplicationSummaryData {
  let active = 0;
  let inactive = 0;
  let fullAccess = 0;
  let scoped = 0;
  const dev = new Map<string, number>();

  for (const a of list) {
    if (a.is_active) active += 1;
    else inactive += 1;
    if (a.allow_all) fullAccess += 1;
    else scoped += 1;
    const d = a.device || 'web';
    dev.set(d, (dev.get(d) ?? 0) + 1);
  }

  const devices = Array.from(dev.entries())
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([device, count]) => ({ device, count }));

  return { total: active + inactive, active, inactive, fullAccess, scoped, devices };
}

const capDevice = (d: string) => (d === 'pos' ? 'POS' : d.charAt(0).toUpperCase() + d.slice(1));

function ScopeLegend({ color, label, value, warn }: { color: string; label: string; value: number; warn?: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-xs ${warn ? 'text-warning' : 'text-muted-foreground'}`}>
      {warn ? <AlertTriangle className="size-3.5" /> : <span className="size-2 rounded-sm" style={{ background: color }} />}
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

      {error ? (
        <FetchErrorState message="Couldn't load the registry summary." onRetry={onRetry} className="py-3" />
      ) : loading || !summary ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Skeleton className="h-14 w-24" />
          <Skeleton className="h-14 min-w-[12rem] flex-1" />
          <Skeleton className="h-14 w-40" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
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
              aria-label={`${summary.fullAccess} full access, ${summary.scoped} scoped`}
            >
              <span className="bg-warning" style={{ width: `${pct(summary.fullAccess)}%` }} />
              <span className="bg-success" style={{ width: `${pct(summary.scoped)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <ScopeLegend color="hsl(var(--warning))" label="Full access" value={summary.fullAccess} warn={summary.fullAccess > 0} />
              <ScopeLegend color="hsl(var(--success))" label="Scoped" value={summary.scoped} />
            </div>
          </div>

          {summary.devices.length > 0 && (
            <div className="shrink-0">
              <div className="text-muted-foreground mb-2 text-[11px] font-bold uppercase tracking-[0.14em]">Devices</div>
              <div className="flex flex-wrap gap-1.5">
                {summary.devices.map((d) => (
                  <span key={d.device} className="text-muted-foreground inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs">
                    {capDevice(d.device)}
                    <span className="text-foreground font-mono text-[12px] font-semibold tabular-nums">{d.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
