import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BatchProgress } from '../TenantMigrationManagement';

/** Colour a streamed log line by what it reports. */
function lineTone(line: string): string {
  if (/fail|error|✕/i.test(line)) return 'text-[hsl(0_78%_66%)]';
  if (/up to date|applied|done|✓|ok\b/i.test(line)) return 'text-[hsl(142_60%_60%)]';
  return 'text-slate-400';
}

/** Live terminal for deploy-all: progress + a streaming log of each tenant's migrations. */
export function DeployConsole({ batch }: { batch: BatchProgress | null }) {
  if (!batch) return null;
  const pct = batch.total ? (batch.applied / batch.total) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      <div className="bg-card flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <Loader2 className="text-warning size-3.5 animate-spin" />
          Deploying all tenants…
          {batch.buCode && <span className="text-muted-foreground font-mono text-xs">({batch.buCode})</span>}
        </div>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {batch.applied} / {batch.total}
        </span>
      </div>

      <div className="bg-muted h-1">
        <div className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="max-h-56 overflow-auto bg-[hsl(222_44%_7%)] px-4 py-3 font-mono text-xs leading-relaxed">
        {batch.current && <div className="break-all text-slate-200">{batch.current}</div>}
        {batch.log.map((line, i) => (
          <div key={`${line}-${i}`} className={cn('whitespace-pre-wrap break-all', lineTone(line))}>
            {line}
          </div>
        ))}
        {batch.log.length === 0 && !batch.current && <div className="text-slate-500">Starting deploy…</div>}
      </div>
    </div>
  );
}
