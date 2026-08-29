import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import type {
  PreconfigDuplicateMode,
  PreconfigImportOptions,
  PreconfigImportSummary,
  PreconfigPreview,
  PreconfigPreviewRow,
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
  // Row counts from the NDJSON `cleared` event — how many rows `clear_existing` actually
  // soft-deleted (plus dependent rows). Reset to undefined at the start of every import run
  // so a stale count from a previous run (e.g. one that didn't clear) can't linger; set again
  // only if this run's `cleared` event arrives.
  cleared?: { softDeleted: number; relatedSoftDeleted: number };
}

const MODES: PreconfigDuplicateMode[] = ['skip', 'upsert', 'error'];
// เก็บ TKey ไม่ใช่ข้อความ — const ระดับโมดูลเรียก hook ไม่ได้
const MODE_LABEL: Record<PreconfigDuplicateMode, TKey> = {
  skip: 'pages.tenantImport.dupSkip',
  upsert: 'pages.tenantImport.dupUpsert',
  error: 'pages.tenantImport.dupError',
};
const VERDICT_VARIANT = { new: 'success', duplicate: 'secondary', error: 'destructive' } as const;

type Verdict = PreconfigPreviewRow['verdict'];

/** Badge/filter order — matches the order the counts were rendered in before filtering existed. */
const VERDICTS: Verdict[] = ['new', 'duplicate', 'error'];

// Mirrors PREVIEW_ROW_CAP in the backend's preconfig-types.ts: the per-verdict cap on how many
// rows a preview returns. Used only to make the caption sentence concrete — no behaviour here
// depends on it being in sync, and `sampled` carries the real numbers.
const PREVIEW_ROWS_PER_VERDICT = 200;

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
  const { t } = useI18n();
  const preview = state.preview;
  const running = state.status === 'importing';
  const previewing = state.status === 'previewing';
  // Wrapped in its own useMemo (rather than a plain `??` fallback) so its identity is stable
  // across renders when `preview` hasn't changed — otherwise the `[]` fallback is a fresh
  // array every render, which would make `lookupValueCount`'s useMemo below recompute on
  // every render regardless of whether the lookups actually changed.
  const lookupsToCreate = useMemo(() => preview?.lookups_to_create ?? [], [preview]);
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
  // Radix focuses the dialog's own content container on open by default; `onOpenAutoFocus`
  // below redirects that initial focus to the BU-code input instead (same UX as `autoFocus`,
  // without triggering jsx-a11y/no-autofocus).
  const clearCodeInputRef = useRef<HTMLInputElement>(null);

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

  // Empty set means "show everything" — there is no separate "all" sentinel to keep in sync
  // with the three chips.
  const [verdictFilter, setVerdictFilter] = useState<Set<Verdict>>(() => new Set());

  // A fresh preview replaces the object, so re-previewing this step drops the filter with it —
  // otherwise a filter chosen against the old rows silently applies to new ones. Switching to a
  // different step is covered by the `key` on <StepPanel> in TenantImportWizard.
  useEffect(() => {
    setVerdictFilter(new Set());
  }, [preview]);

  const toggleVerdict = (v: Verdict) =>
    setVerdictFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  // `counts` is whole-sheet; this is how much of each verdict the returned sample actually holds.
  // A backend that predates the `sampled` field gets it counted from the rows themselves, so this
  // app can deploy ahead of the backend without the caption claiming more than it shows.
  const sampled = useMemo(() => {
    if (!preview) return { new: 0, duplicate: 0, error: 0 };
    if (preview.sampled) return preview.sampled;
    const acc = { new: 0, duplicate: 0, error: 0 };
    for (const r of preview.rows) acc[r.verdict] += 1;
    return acc;
  }, [preview]);

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    if (verdictFilter.size === 0) return preview.rows;
    return preview.rows.filter((r) => verdictFilter.has(r.verdict));
  }, [preview, verdictFilter]);

  const selectedVerdicts = useMemo(() => VERDICTS.filter((v) => verdictFilter.has(v)), [verdictFilter]);

  // The only place that states how much of each verdict the table actually holds. Without it the
  // badge numbers read as a promise the table cannot keep: they count the whole sheet, the table
  // holds a capped sample.
  const captionText = useMemo(() => {
    if (!preview) return '';
    if (selectedVerdicts.length > 0) {
      return selectedVerdicts
        .map((v) =>
          sampled[v] === preview.counts[v]
            ? `Showing all ${preview.counts[v]} ${v}`
            : `Showing ${sampled[v]} of ${preview.counts[v]} ${v}`,
        )
        .join(' · ');
    }
    const total = `${preview.total_rows} rows in sheet`;
    if (!preview.rows_truncated || preview.rows.length === 0) return total;
    // `sampled` only exists once the backend change has shipped (see the field's own comment
    // above). Until then `rows` is still globally capped at 200 total, not 200 per verdict, so
    // asserting a per-verdict cap here would overstate what the table holds — the one deploy
    // state (this frontend against today's backend) that is guaranteed to occur for a while.
    return preview.sampled
      ? `${total} · showing ${preview.rows.length}, up to ${PREVIEW_ROWS_PER_VERDICT} per verdict`
      : `${total} · showing a sample of ${preview.rows.length}`;
  }, [preview, sampled, selectedVerdicts]);

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
            {t('pages.tenantImport.preview')}
          </Button>
          <Button onClick={onImport} disabled={!preview || running || importBlockedByLookups}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? t('pages.tenantImport.importing') : t('pages.tenantImport.importAction')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('pages.tenantImport.onDuplicate')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={state.options.duplicate_mode ?? step.default_duplicate_mode}
            onChange={(e) =>
              onOptionsChange({ ...state.options, duplicate_mode: e.target.value as PreconfigDuplicateMode })
            }
            disabled={running || previewing}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>{t(MODE_LABEL[m])}</option>
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
          {t('pages.tenantImport.softDeleteFirst')}
          {!preview && !clearExisting && (
            <span className="text-xs text-muted-foreground">{t('pages.tenantImport.runPreviewFirst')}</span>
          )}
        </label>
      )}

      {preview && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {VERDICTS.map((v) => {
            const selected = verdictFilter.has(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={selected}
                aria-label={`${preview.counts[v]} ${v} — filter to ${v} rows`}
                onClick={() => toggleVerdict(v)}
                className={`rounded-md py-1 transition ring-offset-background hover:ring-1 hover:ring-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected ? 'ring-2 ring-ring ring-offset-1' : ''
                }`}
              >
                {/*
                  Selection is a ring on the button alone, never colour: the badge colour is
                  already spoken for by the verdict itself. Deliberately not dimmed — these
                  buttons stay interactive (not `disabled`), so WCAG 1.4.3 contrast applies to
                  them, and dimming would also mute the whole-sheet error count precisely when a
                  filter is active.
                */}
                <Badge variant={v === 'error' && preview.counts.error === 0 ? 'secondary' : VERDICT_VARIANT[v]}>
                  {preview.counts[v]} {v}
                </Badge>
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground">{captionText}</span>
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
          <p className="font-medium">{t('pages.tenantImport.newReferenceDataWillBeCreated')}</p>
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

      {visibleRows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Row</th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                ))}
                <th className="px-3 py-2 text-left font-medium">{t('pages.tenantImport.columnVerdict')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
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

      {preview && preview.rows.length > 0 && visibleRows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('pages.tenantImport.noRowsOfVerdict', { verdicts: selectedVerdicts.join(' / ') })}
        </p>
      )}

      {preview && preview.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {preview.total_rows > 0
            ? (preview.total_rows === 1
                ? t('pages.tenantImport.noPreviewRows', { count: preview.total_rows })
                : t('pages.tenantImport.noPreviewRowsPlural', { count: preview.total_rows }))
            : t('pages.tenantImport.noDataRows')}
        </p>
      )}

      {state.summary && (
        <p className="text-sm">
          {t('pages.tenantImport.importedSummary', {
            inserted: state.summary.inserted,
            updated: state.summary.updated,
            skipped: state.summary.skipped,
            failed: state.summary.failed,
          })}
          {state.summary.lookups_created > 0 &&
            t('pages.tenantImport.createdLookups', { count: state.summary.lookups_created })}
          {state.cleared && (
            <>
              {' '}
              · cleared {state.cleared.softDeleted}
              {state.cleared.relatedSoftDeleted > 0 && ` (+${state.cleared.relatedSoftDeleted} related)`}
            </>
          )}
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
        <DialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            clearCodeInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('pages.tenantImport.softDeleteTitle')}</DialogTitle>
            <DialogDescription>
              {clearCountKnown ? (
                clearWillSoftDelete === 0 ? (
                  <>
                    {t('pages.tenantImport.softDeleteNone1')}{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code>{' '}
                    {t('pages.tenantImport.softDeleteNone2')}{' '}
                    <strong className="font-semibold text-foreground">{buCode}</strong>{' '}
                    {t('pages.tenantImport.softDeleteNone3')}
                  </>
                ) : (
                  <>
                    {t('pages.tenantImport.softDeleteSome1')}{' '}
                    <strong className="font-semibold text-foreground">{clearWillSoftDelete}</strong>{' '}
                    {t('pages.tenantImport.softDeleteSome2')}{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code>{' '}
                    {t('pages.tenantImport.softDeleteSome3')}{' '}
                    <strong className="font-semibold text-foreground">{buCode}</strong>{' '}
                    {t('pages.tenantImport.softDeleteSome4')}{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">deleted_at</code>.
                    {clearWillSoftDeleteRelated > 0 && (
                      <>
                        {' '}{t('pages.tenantImport.softDeleteRelated1')}{' '}
                        <strong className="font-semibold text-foreground">{clearWillSoftDeleteRelated}</strong>{' '}
                        {t('pages.tenantImport.softDeleteRelated2')}
                      </>
                    )}{' '}
                    {t('pages.tenantImport.softDeleteConfirmHint')}
                  </>
                )
              ) : (
                <>
                  {t('pages.tenantImport.softDeleteUnknown1')}{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{step.table_name}</code>{' '}
                  {t('pages.tenantImport.softDeleteUnknown2')}{' '}
                  <strong className="font-semibold text-foreground">{buCode}</strong>{' '}
                  {t('pages.tenantImport.softDeleteUnknown3')}{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">deleted_at</code>.{' '}
                  {t('pages.tenantImport.softDeleteConfirmHint')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clear-existing-bu-code" className="text-sm font-medium">
              {t('pages.tenantImport.buCodeLabel')}
            </Label>
            <Input
              ref={clearCodeInputRef}
              id="clear-existing-bu-code"
              value={clearTypedCode}
              onChange={(e) => setClearTypedCode(e.target.value)}
              placeholder={buCode}
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={closeClearDialog}>
              {t('common.cancel')}
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
              {t('pages.tenantImport.confirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
