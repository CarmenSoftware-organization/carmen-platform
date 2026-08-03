import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import businessUnitService from '../../services/businessUnitService';
import preconfigImportService from '../../services/preconfigImportService';
import { parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import type { BusinessUnit, PreconfigStepMeta } from '../../types';

// Sheet labels that exist in "Company Profile" but map to no `BusinessUnit` column (spec
// §8.1: Inventory Cost Type, Default Currency). The backend catalog (preconfig-catalog.ts)
// never lists them in `step.columns`, so the preview response carries nothing to derive this
// from — they appear in neither `values` nor `errors`. Hardcoded per the spec table; if the
// backend ever starts reporting them, this can switch to deriving from the response instead.
const NOT_APPLIED_LABELS = ['Inventory Cost Type', 'Default Currency'];

interface FieldRow {
  key: string;
  label: string;
  buValue: string;
  sheetValue: string;
  changed: boolean;
}

/** `hotel_address_line1` -> `Hotel Address Line1` */
function humanizeColumn(column: string): string {
  return column
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Diff panel for the Company Profile step. Unlike every other step in the wizard, this one
 * targets the *platform* database (the selected business unit's own record) rather than the
 * tenant database — the import endpoint refuses it outright (`target !== 'tenant'`), so this
 * panel reads the workbook through the ordinary preview endpoint and applies the change
 * client-side via `businessUnitService.update`.
 *
 * Deliberately self-contained: it owns its own load/apply state and never touches the
 * wizard's per-step `states` map, so it never participates in `anyImporting`, the
 * unsaved-changes guard (which keys off `everImported`), or the bottom Run summary list —
 * all of which only import runs populate.
 */
export function CompanyProfilePanel({
  step,
  bu,
  file,
}: {
  step: PreconfigStepMeta;
  bu: BusinessUnit;
  file: File;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [sheetErrors, setSheetErrors] = useState<Array<{ column: string; message: string }>>([]);
  const [docVersion, setDocVersion] = useState<number>();
  const [applying, setApplying] = useState(false);
  // Local guard against a stale response landing after a newer load() already started (rapid
  // Refresh clicks). Mirrors the wizard's per-step generation token (see TenantImportWizard's
  // genOf/patchIfCurrent), scoped to this component's own state since it never reads or
  // writes the wizard's `states` map.
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const [preview, currentRes] = await Promise.all([
        preconfigImportService.preview(bu.id, step.id, file),
        businessUnitService.getById(bu.id),
      ]);
      if (token !== loadTokenRef.current) return;
      const record: BusinessUnit = currentRes?.data ?? currentRes;
      const recordFields = record as unknown as Record<string, unknown>;
      const sheetValues = preview.rows[0]?.values ?? {};
      const nextRows: FieldRow[] = Object.keys(sheetValues)
        // `id`/`code` are identifiers, not profile fields — never diffed, never written back.
        .filter((key) => key !== 'id' && key !== 'code')
        .map((key) => {
          const sheetValue = String(sheetValues[key] ?? '').trim();
          const buValue = String(recordFields[key] ?? '').trim();
          return {
            key,
            label: humanizeColumn(key),
            buValue,
            sheetValue,
            changed: buValue !== sheetValue,
          };
        });
      setRows(nextRows);
      setSheetErrors(preview.rows[0]?.errors ?? []);
      setDocVersion(getDocVersion(record));
    } catch (err) {
      if (token !== loadTokenRef.current) return;
      const message = parseApiError(err).message;
      setError(message);
      toast.error(message);
    } finally {
      if (token === loadTokenRef.current) setLoading(false);
    }
  }, [bu.id, step.id, file]);

  useEffect(() => {
    load();
  }, [load]);

  const changedCount = rows.filter((r) => r.changed).length;

  const handleApply = useCallback(async () => {
    const changedFields: Record<string, string> = {};
    for (const r of rows) {
      if (r.changed) changedFields[r.key] = r.sheetValue;
    }
    if (Object.keys(changedFields).length === 0) return;
    setApplying(true);
    try {
      await businessUnitService.update(bu.id, {
        ...changedFields,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      } as Partial<BusinessUnit>);
      toast.success('Company Profile applied to the business unit.');
      await load();
    } catch (err) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await load();
      } else {
        toast.error(parseApiError(err).message);
      }
    } finally {
      setApplying(false);
    }
  }, [bu.id, docVersion, load, rows]);

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{step.display_name}</h2>
          <p className="text-xs text-muted-foreground">
            {step.sheet_name} → business unit record ({bu.code})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={load} disabled={loading || applying}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={handleApply} disabled={loading || applying || changedCount === 0}>
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {applying ? 'Applying…' : 'Apply to BU'}
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Company Profile…
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">No mapped fields were returned for this sheet.</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={changedCount > 0 ? 'warning' : 'secondary'}>{changedCount} changed</Badge>
            <Badge variant="secondary">{rows.length - changedCount} same</Badge>
            {changedCount === 0 && (
              <span className="text-xs text-muted-foreground">
                Every field already matches — nothing to apply.
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Field</th>
                  <th className="px-3 py-2 text-left font-medium">Current (BU)</th>
                  <th className="px-3 py-2 text-left font-medium">Workbook</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.buValue || '-'}</td>
                    <td className="px-3 py-2">{r.sheetValue || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.changed ? 'warning' : 'secondary'}>{r.changed ? 'Changed' : 'Same'}</Badge>
                    </td>
                  </tr>
                ))}
                {NOT_APPLIED_LABELS.map((label) => (
                  <tr key={label} className="border-t text-muted-foreground">
                    <td className="px-3 py-2">{label}</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">-</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">Not applied</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sheetErrors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">The workbook is missing required values</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {sheetErrors.map((e) => (
              <li key={e.column}>
                {e.column}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
