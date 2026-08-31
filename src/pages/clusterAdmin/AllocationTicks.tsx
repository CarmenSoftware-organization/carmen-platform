import { cn } from '../../lib/utils';
import { GAUGE_FILL } from '../clusterManagement/CapacityGauge';
import type { CapLevel } from '../../utils/capacity';

/**
 * Above this many licences the strip stops being countable and becomes a texture, so it falls
 * back to a single continuous bar. The number is a legibility limit, not a data one: at ~40
 * segments across half a card each tick is about 5px, which is where a reader stops being able
 * to tell 37 apart from 38 — and a strip you cannot count is just a percentage bar with extra
 * seams in it.
 */
const MAX_TICKS = 40;

export interface AllocationTicksProps {
  used: number;
  /**
   * `null` = uncapped — the seat pool's rule (`total_max_license_users` treats 0/null as "no
   * cap"; see `utilization()` in utils/capacity). There is no finite set of licences to draw,
   * so an uncapped pool renders the empty track rather than a misleadingly full one. Business-
   * unit quota never passes null: its 0 is a real zero.
   */
  cap: number | null;
  level: CapLevel;
  /** Describes the whole strip. Individual ticks carry no meaning on their own. */
  label: string;
  className?: string;
  /**
   * Overrides the fill of the *allocated* ticks, replacing `GAUGE_FILL[level]`. Only the draft
   * plate passes it, and only because its strip answers a different question: those ticks are
   * licences about to be issued, not licences in use, so they are the strip's subject rather
   * than its background. At `level="none"` the stock fill is `bg-muted-foreground/40`, which
   * on a `bg-muted/30` ground gives a dozen pale identical bars — the shape of a loading
   * skeleton, not of a count. Over-cap ticks ignore this: the destructive tint is a warning,
   * and no caller gets to mute a warning.
   */
  fillClassName?: string;
}

/**
 * A licence pool drawn as one tick per licence: filled = in use, muted = open.
 *
 * A percentage bar answers "how full"; these answer "is there a free one", which is the only
 * question a quota actually gets asked. At 2 of 2 there is no open tick to find, so the wall is
 * something you see rather than something you read.
 *
 * Over-cap is the one case the picture must not flatten: the excess ticks render at a lighter
 * destructive tint so the licensed boundary stays visible behind the overflow.
 */
export function AllocationTicks({
  used,
  cap,
  level,
  label,
  className,
  fillClassName,
}: AllocationTicksProps) {
  // An uncapped pool has no boundary, so there is no allocation to draw. An empty track here
  // would be a picture of nothing that reads exactly like a capped pool sitting at 0%.
  if (cap == null) return null;

  const total = Math.max(cap, used);
  const segmented = total > 0 && total <= MAX_TICKS;

  if (!segmented) {
    // cap === 0 is a real zero, not an absent cap — the track stays, empty, to say so.
    const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
    return (
      <div
        role="img"
        aria-label={label}
        className={cn('bg-muted h-2.5 overflow-hidden rounded-full', className)}
      >
        <div
          className={cn('h-full rounded-full', fillClassName ?? GAUGE_FILL[level])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    );
  }

  // Ticks share the row, so the gap has to shrink as the count grows or 40 of them would be all
  // gap and no tick.
  const gap = total <= 8 ? 'gap-1.5' : total <= 20 ? 'gap-1' : 'gap-0.5';

  // Capping the tick width is what keeps this a count rather than a bar. Left to stretch, a pool
  // of two renders as two slabs that read as one full-width fill — the exact percentage bar this
  // is meant not to be. Capped, the strip's own length says how many licences exist: a short row
  // for a small pool, a full row for a large one.
  return (
    <div role="img" aria-label={label} className={cn('flex', gap, className)}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 max-w-10 flex-1 rounded-[2px]',
            i >= used
              ? 'bg-muted'
              : i < cap
                ? (fillClassName ?? GAUGE_FILL[level])
                : 'bg-destructive/40',
          )}
        />
      ))}
    </div>
  );
}
