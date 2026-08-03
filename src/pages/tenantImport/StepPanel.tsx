import { useMemo } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type {
  PreconfigDuplicateMode,
  PreconfigImportOptions,
  PreconfigImportSummary,
  PreconfigPreview,
  PreconfigStepMeta,
} from '../../types';

export interface StepState {
  status: 'pending' | 'previewing' | 'previewed' | 'importing' | 'completed' | 'skipped' | 'error';
  rowCount?: number;
  preview?: PreconfigPreview;
  summary?: PreconfigImportSummary;
  progress?: { index: number; total: number };
  options: PreconfigImportOptions;
  error?: string;
  // True once this step has actually started an import (as opposed to only having been
  // previewed). Distinguishes an `error`/`completed` status reached via a real import — which
  // may have written data and is worth warning about on navigation — from the same status
  // reached via a preview failure, which wrote nothing. Set once by `runImport` and never
  // cleared, since it records history, not current state.
  everImported?: boolean;
}

const MODES: PreconfigDuplicateMode[] = ['skip', 'upsert', 'error'];
const MODE_LABEL: Record<PreconfigDuplicateMode, string> = {
  skip: 'Skip duplicates',
  upsert: 'Update duplicates',
  error: 'Report duplicates as errors',
};
const VERDICT_VARIANT = { new: 'success', duplicate: 'secondary', error: 'destructive' } as const;

/**
 * Right-hand pane for one wizard step: options, preview verdicts, run controls, summary.
 */
export function StepPanel({
  step,
  state,
  onPreview,
  onImport,
  onOptionsChange,
}: {
  step: PreconfigStepMeta;
  state: StepState;
  onPreview: () => void;
  onImport: () => void;
  onOptionsChange: (next: PreconfigImportOptions) => void;
}) {
  const preview = state.preview;
  const running = state.status === 'importing';
  const previewing = state.status === 'previewing';

  // Union of value keys across every returned row, in first-seen order — a key present on a
  // later row but absent from row 0 (e.g. an optional column left blank on the first row)
  // must still get a column instead of silently disappearing.
  const columns = useMemo(() => {
    if (!preview) return [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of preview.rows) {
      for (const key of Object.keys(row.values)) {
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      }
    }
    return ordered;
  }, [preview]);

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{step.display_name}</h2>
          <p className="text-xs text-muted-foreground">
            {step.sheet_name} → {step.table_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onPreview} disabled={state.status === 'previewing' || running}>
            {state.status === 'previewing' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>
          <Button onClick={onImport} disabled={!preview || running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">On duplicate</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={state.options.duplicate_mode ?? step.default_duplicate_mode}
            onChange={(e) =>
              onOptionsChange({ ...state.options, duplicate_mode: e.target.value as PreconfigDuplicateMode })
            }
            disabled={running || previewing}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>{MODE_LABEL[m]}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">
          Key: {step.duplicate_key.join(' + ')}
        </span>
      </div>

      {preview && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">{preview.counts.new} new</Badge>
          <Badge variant="secondary">{preview.counts.duplicate} duplicate</Badge>
          <Badge variant={preview.counts.error > 0 ? 'destructive' : 'secondary'}>
            {preview.counts.error} error
          </Badge>
          <span className="text-xs text-muted-foreground">
            {preview.total_rows} rows in sheet
            {preview.rows_truncated && preview.rows.length > 0 && ` · showing the first ${preview.rows.length}`}
          </span>
        </div>
      )}

      {state.progress && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={state.progress.total}
            aria-valuenow={state.progress.index}
            aria-label={`Import progress for ${step.display_name}`}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round((state.progress.index / Math.max(state.progress.total, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {state.progress.index} / {state.progress.total}
          </p>
        </div>
      )}

      {preview && preview.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Row</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.row_number} className="border-t">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row_number}</td>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2">{String(r.values[c] ?? '')}</td>
                  ))}
                  <td className="px-3 py-2">
                    <Badge variant={VERDICT_VARIANT[r.verdict]}>{r.verdict}</Badge>
                    {r.errors.length > 0 && (
                      <p className="mt-1 text-xs text-destructive">
                        {r.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && preview.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {preview.total_rows > 0
            ? `No preview rows were returned for the ${preview.total_rows} row${preview.total_rows === 1 ? '' : 's'} in this sheet.`
            : 'This sheet has no data rows.'}
        </p>
      )}

      {state.summary && (
        <p className="text-sm">
          Imported {state.summary.inserted} · updated {state.summary.updated} · skipped{' '}
          {state.summary.skipped} · failed {state.summary.failed}
        </p>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}
