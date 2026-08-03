import { Check, Circle, CircleDot, Loader2, SkipForward, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PreconfigStepMeta } from '../../types';
import type { StepState } from './StepPanel';

const ICONS = {
  pending: Circle,
  previewing: Loader2,
  previewed: CircleDot,
  importing: Loader2,
  completed: Check,
  skipped: SkipForward,
  error: X,
} as const;

/**
 * Vertical list of wizard steps with status and row counts. Collapses into a
 * <select> below `lg`, matching the repo's mobile-first breakpoint rules.
 */
export function StepRail({
  steps,
  states,
  activeId,
  onSelect,
}: {
  steps: PreconfigStepMeta[];
  states: Record<string, StepState>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <select
        aria-label="Import step"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm lg:hidden"
        value={activeId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {steps.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name} — {states[s.id]?.status ?? 'pending'}
          </option>
        ))}
      </select>

      <ul className="hidden w-56 shrink-0 space-y-1 lg:block">
        {steps.map((s) => {
          const state = states[s.id];
          const status = state?.status ?? 'pending';
          const Icon = ICONS[status];
          const spinning = status === 'previewing' || status === 'importing';
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={s.id === activeId ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                  s.id === activeId ? 'bg-accent font-medium' : 'hover:bg-muted',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    spinning && 'animate-spin',
                    status === 'completed' && 'text-success',
                    status === 'error' && 'text-destructive',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{s.display_name}</span>
                {state?.rowCount != null && (
                  <span className="text-xs tabular-nums text-muted-foreground">{state.rowCount}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
