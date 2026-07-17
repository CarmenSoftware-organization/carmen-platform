import { ChevronsUpDown, Database } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { BusinessUnit } from '../../types';
import { buHueColor, buInitials } from '../../utils/buHue';

interface ConnectionBarProps {
  /** The currently connected BU, or null when none is selected yet. */
  bu: BusinessUnit | null;
  /** True when the user holds `sql_workbench.manage` (can Run/Save/Drop) — the write signal. */
  canWrite: boolean;
  /** Open the BU switcher. */
  onSwitch: () => void;
}

/**
 * The workbench's "connection target" bar. The BU isn't a form field here — it's
 * the live database you fire DDL at, so this bar makes the target unmistakable:
 * a stable per-tenant colour, the code in monospace, and a read-only / read-write
 * signal, so an operator can't Drop objects in the wrong tenant by accident.
 */
export function ConnectionBar({ bu, canWrite, onSwitch }: ConnectionBarProps) {
  const rail = bu ? buHueColor(bu.code) : 'hsl(var(--border))';

  return (
    <div className="bg-card flex items-stretch overflow-hidden rounded-lg border shadow-sm">
      {/* live-target hue rail */}
      <div className="w-1 shrink-0" style={{ background: rail }} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
        {bu ? (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
            style={{ background: rail }}
            aria-hidden="true"
          >
            {buInitials(bu.code)}
          </span>
        ) : (
          <span className="text-muted-foreground bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
            <Database className="size-4" />
          </span>
        )}

        <div className="min-w-0">
          {bu ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold tracking-tight">{bu.code}</span>
                <span className="text-muted-foreground truncate text-[13px]">{bu.name}</span>
              </div>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 font-mono text-[11px]">
                <span className="relative flex size-1.5" aria-hidden="true">
                  <span
                    className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden"
                    style={{ background: canWrite ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))' }}
                  />
                  <span
                    className="relative inline-flex size-1.5 rounded-full"
                    style={{ background: canWrite ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))' }}
                  />
                </span>
                <span>tenant db{bu.cluster_name ? ` · ${bu.cluster_name}` : ''}</span>
                <span className="opacity-40">·</span>
                {canWrite ? (
                  <span className="text-[hsl(var(--warning))]">read / write</span>
                ) : (
                  <span>read-only</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">No tenant selected</div>
              <div className="text-muted-foreground text-xs">
                Choose the business unit you want to operate on
              </div>
            </>
          )}
        </div>

        <div className="ml-auto shrink-0 pl-2">
          <Button size="sm" variant="outline" onClick={onSwitch} aria-label="Switch business unit">
            <ChevronsUpDown className="mr-2 size-4" />
            {bu ? 'Switch' : 'Choose BU'}
            <kbd className="bg-muted text-muted-foreground ml-2 hidden rounded px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘B
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
