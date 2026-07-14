import { cn } from '../../lib/utils';
import { utilization, type CapLevel } from '../../utils/capacity';

const FILL: Record<CapLevel, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  over: 'bg-destructive',
  none: 'bg-transparent',
};

const TAG: Partial<Record<CapLevel, { text: string; cls: string }>> = {
  warn: { text: 'near', cls: 'text-warning bg-warning/15' },
};

interface CapacityMeterProps {
  used?: number | null;
  cap?: number | null;
}

/** A cluster's license utilization: a bar coloured by headroom + `used / cap`. */
export function CapacityMeter({ used, cap }: CapacityMeterProps) {
  const u = utilization(used, cap);
  const tag = TAG[u.level];

  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-16 shrink-0 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', FILL[u.level])}
          style={{ width: `${Math.min(100, u.ratio * 100)}%` }}
        />
      </div>
      <span className="whitespace-nowrap font-mono text-xs tabular-nums">
        <span className="text-foreground font-semibold">{u.used.toLocaleString()}</span>
        <span className="text-muted-foreground">
          {' / '}
          {u.cap == null ? '∞' : u.cap.toLocaleString()}
        </span>
      </span>
      {tag && (
        <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide', tag.cls)}>
          {tag.text}
        </span>
      )}
    </div>
  );
}
