import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import businessUnitService from '../../services/businessUnitService';
import currencyService from '../../services/currencyService';
import preconfigImportService from '../../services/preconfigImportService';
import { parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import type { BusinessUnit, PreconfigStepMeta, TenantCurrency } from '../../types';

// The one "Company Profile" label the backend catalog (preconfig-catalog.ts) still excludes
// from `step.columns`, so the preview response carries no signal about it — it appears in
// neither `values` nor `errors`, and no endpoint exposes the sheet's raw label list to derive
// it from. `BU Name` is identity, like `BU Code`: a spreadsheet must not silently rename a
// business unit. Keep this aligned with the catalog — if the catalog starts mapping a label
// listed here, this list is what goes stale.
// ป้ายกำกับเดียวที่แคตตาล็อกยังไม่แมป เพราะชื่อหน่วยธุรกิจเป็นข้อมูลระบุตัวตน
const NOT_APPLIED_LABELS = ['BU Name'];

// The catalog's virtual column for `Default Currency`. There is no such column on
// tb_business_unit: the sheet holds a currency CODE, the record stores a UUID, and tb_currency
// lives in the tenant database. This key must never reach the business-unit API.
// คอลัมน์เสมือนของสกุลเงินตั้งต้น ต้องไม่ถูกส่งไปยัง API ของหน่วยธุรกิจ
const CURRENCY_CODE_KEY = 'default_currency_code';

/**
 * Why the virtual Default Currency row can or cannot be written. `undefined` on every
 * ordinary row. / สาเหตุที่แถวสกุลเงินเสมือนเขียนได้หรือไม่ได้
 */
type CurrencyState =
  | { state: 'resolved'; resolvedId: string }
  | { state: 'unreachable' }
  | { state: 'not_found' };

interface FieldRow {
  key: string;
  label: string;
  buValue: string;
  sheetValue: string;
  changed: boolean;
  currency?: CurrencyState;
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
 * Build the virtual Default Currency row. The sheet carries a code; the record stores a UUID,
 * so the row is applicable only when the code resolves against the tenant currency list.
 *
 * An unresolvable row reports `changed: false` — NOT merely "excluded from the payload".
 * `changedCount` is what enables the Apply button while `handleApply` returns early on an empty
 * payload, so `changed: true` here would leave the button live on a call that does nothing.
 * แถวที่แปลงรหัสไม่ได้ต้องรายงานว่าไม่มีการเปลี่ยนแปลง มิฉะนั้นปุ่มจะกดได้แต่ไม่เกิดอะไรขึ้น
 *
 * @param sheetValue - Currency code from the workbook / รหัสสกุลเงินจากไฟล์
 * @param currentId - The BU's saved default_currency_id / ค่าที่บันทึกไว้ของหน่วยธุรกิจ
 * @param currencies - Tenant currency list, or null when it could not be fetched / รายการสกุลเงิน
 */
function currencyRow(
  sheetValue: string,
  currentId: string | undefined,
  currencies: TenantCurrency[] | null,
): FieldRow {
  const base = { key: CURRENCY_CODE_KEY, label: 'Default Currency', sheetValue };
  if (!currencies) {
    return { ...base, buValue: '', changed: false, currency: { state: 'unreachable' } };
  }
  const buValue = currencies.find((c) => c.id === currentId)?.code ?? '';
  const match = currencies.find((c) => c.code.toUpperCase() === sheetValue.toUpperCase());
  if (!match) {
    return { ...base, buValue, changed: false, currency: { state: 'not_found' } };
  }
  return {
    ...base,
    buValue,
    changed: match.id !== currentId,
    currency: { state: 'resolved', resolvedId: match.id },
  };
}

/** Status cell for one diff row. / ช่องสถานะของหนึ่งแถว */
function renderStatus(r: FieldRow) {
  if (r.currency?.state === 'unreachable') {
    return (
      <Badge
        variant="outline"
        title="The tenant database could not be reached, so this currency code cannot be resolved to an id."
      >
        Cannot resolve
      </Badge>
    );
  }
  if (r.currency?.state === 'not_found') {
    return (
      <Badge variant="outline" title="Run the Currency step first, then press Refresh.">
        Not found — run Currency first
      </Badge>
    );
  }
  return <Badge variant={r.changed ? 'warning' : 'secondary'}>{r.changed ? 'Changed' : 'Same'}</Badge>;
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
  // The workbook's `BU Code` value, kept separate from `rows`. The backend deliberately
  // includes `code` in the preview `values` (spec: "match only — never written") so the panel
  // can compare it against the selected BU and flag a mismatch — but it must never be treated
  // as a normal diffable field or fed into `changedFields`. See IMPORTANT 1, fix round 2.
  const [sheetCode, setSheetCode] = useState<string | undefined>();
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
      const [preview, currentRes, currencies] = await Promise.all([
        preconfigImportService.preview(bu.id, step.id, file),
        businessUnitService.getById(bu.id),
        // The only tenant-database read this panel makes. A platform-target preview
        // deliberately works for a BU with no provisioned database (see previewVerticalStep),
        // so a failure here must degrade the Default Currency row alone, never the panel.
        // การอ่านจากฐานข้อมูลผู้เช่าเพียงจุดเดียว หากล้มเหลวต้องกระทบเฉพาะแถวสกุลเงิน
        currencyService.getForBu(bu.code).catch(() => null),
      ]);
      if (token !== loadTokenRef.current) return;
      const record: BusinessUnit = currentRes?.data ?? currentRes;
      const recordFields = record as unknown as Record<string, unknown>;
      const sheetValues = preview.rows[0]?.values ?? {};
      const rawSheetCode = sheetValues['code'];
      const nextRows: FieldRow[] = Object.keys(sheetValues)
        // `id` is a plain identifier — never a diffable field. `code` is identity too, but
        // unlike `id` it IS meaningful to show (it is how the operator confirms the workbook
        // targets this BU) — it just never becomes a normal row here, and never feeds
        // `changedFields`. It gets its own dedicated, read-only comparison below instead.
        .filter((key) => key !== 'id' && key !== 'code')
        .map((key): FieldRow => {
          const sheetValue = String(sheetValues[key] ?? '').trim();
          // The virtual currency column is the one key whose sheet value is not comparable to
          // the record field of the same name — there is no such field.
          // คอลัมน์สกุลเงินเสมือนเทียบกับฟิลด์ชื่อเดียวกันในเรกคอร์ดไม่ได้ เพราะไม่มีฟิลด์นั้น
          if (key === CURRENCY_CODE_KEY) {
            return currencyRow(sheetValue, record.default_currency_id, currencies);
          }
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
      setSheetCode(typeof rawSheetCode === 'string' ? rawSheetCode.trim() : undefined);
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
  // Trimmed compare; `bu.code` is not expected to carry incidental whitespace, but `sheetCode`
  // comes straight off a spreadsheet cell.
  const codeMismatch = sheetCode != null && sheetCode !== '' && sheetCode !== bu.code.trim();

  const handleApply = useCallback(async () => {
    const changedFields: Record<string, string> = {};
    for (const r of rows) {
      // IMPORTANT 1 (fix round 2): `code` must never be written back — it is the BU's identity,
      // not a profile field, and the tenant database connection is resolved from it. `rows`
      // already excludes `code`/`id` when it's built above, so those can never trigger in
      // practice today; they stay as an unconditional second guard so a future change to that
      // filter can't silently start writing the BU code from a workbook cell.
      //
      // `default_currency_code` is dropped for a different reason: it is a VIRTUAL catalog
      // column with no field behind it, so sending it would hand the business-unit API an
      // unknown key. Its resolved id is added separately below.
      // คีย์สกุลเงินเสมือนถูกตัดออกเพราะไม่มีคอลัมน์รองรับ ค่า id ที่แปลงแล้วถูกเพิ่มแยกด้านล่าง
      if (r.changed && r.key !== 'code' && r.key !== 'id' && r.key !== CURRENCY_CODE_KEY) {
        changedFields[r.key] = r.sheetValue;
      }
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

      {/*
        IMPORTANT 1 (fix round 2): the BU code is the tenant's identity — it is what the
        wizard resolved the tenant database connection from, and how operators recognise the
        BU. A workbook whose `BU Code` cell holds a different value (a copied template, an
        export from another property) must never silently rename this BU. `handleApply` already
        excludes `code` unconditionally; this banner makes a mismatch impossible to miss without
        blocking the apply — the operator may still be here on purpose (e.g. re-checking a
        template file), so this warns rather than gates.
      */}
      {codeMismatch && (
        <div
          className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The workbook&apos;s <strong>BU Code</strong> is{' '}
            <strong className="font-mono">{sheetCode}</strong>, not the selected business unit&apos;s{' '}
            <strong className="font-mono">{bu.code}</strong>. This usually means the wrong file or the
            wrong business unit was selected. Applying will <strong>not</strong> rename anything — the BU
            code is never written back — but every other field below would still be written onto{' '}
            <strong>{bu.code}</strong>, not the property the workbook describes. Double-check before
            continuing.
          </span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && sheetCode == null && (
        <p className="text-xs text-muted-foreground">No mapped fields were returned for this sheet.</p>
      )}

      {(rows.length > 0 || sheetCode != null) && (
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
                {sheetCode != null && (
                  // Read-only identity row — deliberately not a `FieldRow`: it never has a
                  // Changed/Same verdict and can never be applied (see IMPORTANT 1 above).
                  <tr className={cn('border-t', codeMismatch && 'bg-destructive/5')}>
                    <td className="px-3 py-2 font-medium">BU Code</td>
                    <td className="px-3 py-2 text-muted-foreground">{bu.code}</td>
                    <td className="px-3 py-2">{sheetCode || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge variant={codeMismatch ? 'destructive' : 'secondary'}>
                        {codeMismatch ? 'Mismatch — read-only' : 'Match — read-only'}
                      </Badge>
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.buValue || '-'}</td>
                    <td className="px-3 py-2">{r.sheetValue || '-'}</td>
                    <td className="px-3 py-2">{renderStatus(r)}</td>
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
