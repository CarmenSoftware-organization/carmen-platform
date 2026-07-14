import { Building2, Users } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import type { FleetSummary, CapacityTotals } from '../../utils/capacity';
import { CapacityGauge } from './CapacityGauge';

function uncappedNote(t: CapacityTotals): string | undefined {
  if (t.uncappedCount <= 0) return undefined;
  return `+ ${t.uncappedCount} cluster${t.uncappedCount > 1 ? 's' : ''} with no cap (${t.uncappedUsed.toLocaleString()} in use)`;
}

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  const hot = alert && value > 0;
  return (
    <div className={cn('flex items-baseline gap-2 text-xs', hot ? 'text-warning' : 'text-muted-foreground')}>
      <span className={cn('font-mono text-base font-semibold tabular-nums', hot ? 'text-warning' : 'text-foreground')}>
        {value}
      </span>
      {label}
    </div>
  );
}

export function FleetCapacity({ summary, loading }: { summary: FleetSummary | null; loading: boolean }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-muted-foreground mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em]">
        Fleet capacity
      </div>

      {loading || !summary ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-28" />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <CapacityGauge icon={Building2} label="Business units" used={summary.bu.used} cap={summary.bu.cap} note={uncappedNote(summary.bu)} />
          <CapacityGauge icon={Users} label="Users" used={summary.users.used} cap={summary.users.cap} note={uncappedNote(summary.users)} />
          <div className="flex gap-6 border-border sm:flex-col sm:gap-1.5 sm:border-l sm:pl-6">
            <Stat value={summary.total} label="clusters" />
            <Stat value={summary.active} label="active" />
            <Stat value={summary.nearLimit} label="near limit" alert />
          </div>
        </div>
      )}
    </Card>
  );
}
