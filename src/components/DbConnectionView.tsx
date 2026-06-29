import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { parseDbConnection } from '../utils/dbConnection';

const MASK = '••••••••';

interface DbConnectionViewProps {
  value: string;
}

/**
 * Read-only structured view of a BU's db_connection. Sensitive values (any key
 * not in the safe allowlist) are masked with a per-field reveal toggle. Reveal
 * state is local only — it resets on unmount/navigation and is never persisted.
 * Display-only: never mutates the source value.
 */
export const DbConnectionView = ({ value }: DbConnectionViewProps) => {
  const parsed = parseDbConnection(value);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setRevealed((prev) => ({ ...prev, [k]: !prev[k] }));

  // empty
  if (parsed.ok && parsed.entries.length === 0) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  // fallback: unparseable / bare connection string -> single masked row
  if (!parsed.ok) {
    const shown = !!revealed.raw;
    return (
      <div className="rounded-md border border-input bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">
            Connection string
          </span>
          <span className="flex-1 break-all font-mono text-sm">{shown ? parsed.raw : MASK}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => toggle('raw')}
            aria-label={shown ? 'Hide connection string' : 'Reveal connection string'}
          >
            {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  // structured rows
  return (
    <div className="divide-y rounded-md border border-input bg-muted/50">
      {parsed.entries.map((e) => {
        const shown = !e.sensitive || !!revealed[e.key];
        return (
          <div key={e.key} className="flex items-center gap-2 px-3 py-2">
            <span className="w-32 shrink-0 break-all text-xs font-medium text-muted-foreground">
              {e.key}
            </span>
            <span className="flex-1 break-all font-mono text-sm">{shown ? e.value : MASK}</span>
            {e.sensitive && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => toggle(e.key)}
                aria-label={revealed[e.key] ? `Hide ${e.key}` : `Reveal ${e.key}`}
              >
                {revealed[e.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DbConnectionView;
