import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { utilization, type CapLevel } from '../../utils/capacity';

export const GAUGE_FILL: Record<CapLevel, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  over: 'bg-destructive',
  none: 'bg-muted-foreground/40',
};
export const GAUGE_TEXT: Record<CapLevel, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  over: 'text-destructive',
  none: 'text-muted-foreground',
};

interface CapacityGaugeProps {
  icon: LucideIcon;
  label: string;
  used: number;
  cap: number | null; // null = uncapped
  note?: React.ReactNode;
}

/** A labelled capacity gauge: `used / cap licensed`, a bar, an optional note. */
export function CapacityGauge({ icon: Icon, label, used, cap, note }: CapacityGaugeProps) {
  const u = utilization(used, cap);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-mono text-[13px] tabular-nums">
          <span className="text-foreground font-semibold">{used.toLocaleString()}</span>
          <span className="text-muted-foreground">
            {' / '}
            {cap == null ? '∞ (no cap)' : `${cap.toLocaleString()} licensed`}
          </span>
          {cap != null && <span className={cn('ml-2', GAUGE_TEXT[u.level])}>{u.pct}%</span>}
        </span>
      </div>
      <div className="bg-muted h-2.5 overflow-hidden rounded-full">
        <div className={cn('h-full rounded-full', GAUGE_FILL[u.level])} style={{ width: `${Math.min(100, u.ratio * 100)}%` }} />
      </div>
      {note && <p className="text-muted-foreground mt-1.5 text-[11px]">{note}</p>}
    </div>
  );
}
