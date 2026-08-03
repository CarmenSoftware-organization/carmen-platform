import { useMemo, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
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
  buCode,
  onPreview,
  onImport,
  onOptionsChange,
  onAcceptLookups,
}: {
  step: PreconfigStepMeta;
  state: StepState;
  /** BU code the wizard is importing into — typed by the user to confirm clear-existing. */
  buCode: string;
  onPreview: () => void;
  onImport: () => void;
  onOptionsChange: (next: PreconfigImportOptions) => void;
  onAcceptLookups: (next: PreconfigImportOptions) => void;
}) {
  const preview = state.preview;
  const running = state.status === 'importing';
  const previewing = state.status === 'previewing';
  const lookupsToCreate = preview?.lookups_to_create ?? [];
  const clearExisting = !!state.options.clear_existing;
  const clearWillSoftDelete = preview?.clear_will_soft_delete ?? 0;
  const clearWillSoftDeleteRelated = preview?.clear_will_soft_delete_related ?? 0;
  // The backend now computes `clear_will_soft_delete` (and `..._related`) unconditionally, on
  // every preview regardless of the `clear_existing` option it was requested with — so a `0` is
  // now a genuine "nothing to delete" rather than the old "not computed yet" signal. The only
  // case left where the count truly isn't known is no preview at all — defensive: the checkbox's
  // own `disabled` rule (below) keeps the dialog from opening without one in practice, but the
  // copy still branches on it rather than assuming that invariant holds.
  const clearCountKnown = !!preview;
  // Ticking the checkbox does NOT set `clear_existing` itself — it only opens the typed
  // confirmation dialog below. The checkbox's own `checked` stays derived from
  // `state.options.clear_existing`, so a cancelled/dismissed dialog leaves it off with no
  // extra state to reconcile.
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearTypedCode, setClearTypedCode] = useState('');
  const clearCodeMatches = buCode.length > 0 && clearTypedCode.trim() === buCode;

  const closeClearDialog = () => {
    setClearDialogOpen(false);
    setClearTypedCode('');
  };
  const lookupValueCount = useMemo(
    () => lookupsToCreate.reduce((sum, entry) => sum + entry.values.length, 0),
    [lookupsToCreate],
  );
  const lookupsAccepted = !!state.options.accept_lookup_creation;
  const importBlockedByLookups = lookupsToCreate.length > 0 && !lookupsAccepted;

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
          <Button onClick={onImport} disabled={!preview || running || importBlockedByLookups}>
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

      {step.supports_clear && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={clearExisting}
            // `!preview` only blocks turning the option ON — once `clear_existing` is already
            // true, unticking is the de-escalating action and must always stay available, even
            // if a later, unrelated options change (e.g. duplicate mode) invalidated the
            // preview out from under it. Otherwise the user gets stuck with the option on with
            // no way to turn it off short of running another preview.
            disabled={running || previewing || (!preview && !clearExisting)}
            onChange={(e) => {
              if (e.target.checked) {
                setClearTypedCode('');
                setClearDialogOpen(true);
              } else {
                onOptionsChange({ ...state.options, clear_existing: false });
              }
            }}
          />
          Soft-delete existing rows first
          {!preview && !clearExisting && (
            <span className="text-xs text-muted-foreground">(run a preview first)</span>
          )}
        </label>
      )}

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

      {lookupsToCreate.length > 0 && (
        <div className="space-y-3 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
          <p className="font-medium">New reference data will be created</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {lookupsToCreate.map((entry) => (
              <li key={`${entry.table}.${entry.column}`} className="break-words">
                <span className="font-mono text-foreground">
                  {entry.table}.{entry.column}
                </span>
                : {entry.values.join(', ')}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={lookupsAccepted}
              onChange={(e) =>
                onAcceptLookups({ ...state.options, accept_lookup_creation: e.target.checked })
              }
            />
            Create these {lookupValueCount} values
          </label>
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
          {state.summary.lookups_created > 0 && <> · created {state.summary.lookups_created} lookups</>}
        </p>
      )}

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      {/*
        Not <ConfirmDialog> (components/ui/confirm-dialog.tsx): its `description` prop is a
        plain string with no children slot, and its Confirm button has no external `disabled`
        control — it cannot host a gating <Input>. Composed here from the same underlying
        `Dialog` primitives ConfirmDialog itself wraps (see e.g. ClusterEdit.tsx's Add User
        dialog for the same pattern elsewhere in this codebase), matching its title/description/
        footer conventions so it reads as the same family of dialog.
      */}
      <Dialog open={clearDialogOpen} onOpenChange={(open) => { if (!open) closeClearDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Soft-delete existing rows?</DialogTitle>
            <DialogDescription>
              {clearCountKnown ? (
                clearWillSoftDelete === 0 ? (
                  <>
                    There are no active rows in{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code> for{' '}
                    <strong className="font-semibold text-foreground">{buCode}</strong> to soft-delete right
                    now. Type the BU code to confirm.
                  </>
                ) : (
                  <>
                    This soft-deletes{' '}
                    <strong className="font-semibold text-foreground">{clearWillSoftDelete}</strong> existing
                    rows in <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code> for{' '}
                    <strong className="font-semibold text-foreground">{buCode}</strong> by setting{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">deleted_at</code>.
                    {clearWillSoftDeleteRelated > 0 && (
                      <>
                        {' '}It also soft-deletes{' '}
                        <strong className="font-semibold text-foreground">{clearWillSoftDeleteRelated}</strong>{' '}
                        dependent rows in related tables.
                      </>
                    )}{' '}
                    Existing documents that reference them keep working. Type the BU code to confirm.
                  </>
                )
              ) : (
                <>
                  This soft-deletes every currently-active row in{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code> for{' '}
                  <strong className="font-semibold text-foreground">{buCode}</strong> by setting{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">deleted_at</code>. Existing documents
                  that reference them keep working. Type the BU code to confirm.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="clear-existing-bu-code" className="text-sm font-medium">
              BU code
            </label>
            <Input
              id="clear-existing-bu-code"
              value={clearTypedCode}
              onChange={(e) => setClearTypedCode(e.target.value)}
              placeholder={buCode}
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={closeClearDialog}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!clearCodeMatches}
              onClick={() => {
                onOptionsChange({ ...state.options, clear_existing: true });
                closeClearDialog();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
