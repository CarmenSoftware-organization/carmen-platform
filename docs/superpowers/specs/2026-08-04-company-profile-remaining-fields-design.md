# Company Profile — Apply the Remaining 8 Fields

**Date:** 2026-08-04
**Status:** Approved
**Repos:** `carmen-turborepo-backend-v2` (micro-business), `carmen-platform` (Vite SPA)
**Builds on:** `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`

---

## 1. Problem

The Preconfig wizard's Company Profile step reads the `Company Profile` sheet and applies it to
the selected business unit. Nine of the sheet's labels are never written — they render as
`Not applied` in the diff table and the corresponding `tb_business_unit` columns keep whatever
value they already had (commonly empty for a freshly created BU):

```
Inventory Cost Type · Default Currency · BU Name · Date Format
Date Time Format · Time Format · Short Time Format · Long Time Format · Time Zone
```

The exclusion is deliberate and documented in two places — `NOT_APPLIED_LABELS`
(`src/pages/tenantImport/CompanyProfilePanel.tsx:29-39`) and a comment block in
`preconfig-catalog.ts:64-70`. The recorded reasons no longer match the schema:

| Recorded reason | Actual state of `tb_business_unit` |
|---|---|
| "date format … time zone are display preferences owned by the BU settings page" | Six ordinary nullable `String?` columns with defaults. Nothing prevents an import from writing them. |
| "`calculation_method` is an enum" | `enum_calculation_method` has exactly two members (`average`, `fifo`) — a two-value allowlist, not a barrier. |
| "`default_currency_id` is a foreign key" | True, and it is worse than recorded: it is a **cross-database** reference. |

Operators therefore finish the wizard and still have to open the BU Edit page to set eight
fields the workbook already carries.

## 2. Goal

The Company Profile step applies eight of the nine excluded fields. `BU Name` stays excluded.

## 3. Non-goals

- Changing which database `tb_business_unit` lives in, or introducing a real FK between the
  platform and tenant databases.
- Changing the step order of the wizard, or making Company Profile depend on the Currency step.
- Validating date/time format strings against an allowlist of patterns (decided: free text —
  see §7).
- Letting the workbook rename a business unit (`BU Name`).

## 4. Key constraints discovered

These are load-bearing; a change that violates one is wrong even if it passes type-check.

**C1 — `tb_currency` is in the tenant database, `tb_business_unit` is in the platform
database.** Verified: `packages/prisma-shared-schema-platform/prisma/schema.prisma` declares no
`tb_currency` model; `packages/prisma-shared-schema-tenant/prisma/schema.prisma` does. So
`tb_business_unit.default_currency_id` is a UUID with no FK constraint behind it, resolvable
only by querying a different database.

**C2 — the Company Profile preview deliberately runs before any tenant connection is
resolved.** `preconfig-import.service.ts:451-458` returns `previewVerticalStep(step, file)` for
`step.target === 'platform'` *before* calling `resolveConnection(bu_id)`, with a comment stating
this exists so the step still previews for "a business unit that has no database provisioned
yet". Resolving the currency on the backend would destroy that property.

**C3 — `normalizeKey` lowercases and collapses whitespace but strips nothing else.**
`preconfig-workbook.ts:23-25` is `v.replace(/\s+/g, ' ').trim().toLowerCase()`. So the sheet's
lowercase `time zone` matches a catalog label of `Time Zone`, but the sheet's
`Inventory Cost Type (*Mandatory*)` does **not** match a catalog label of `Inventory Cost Type`
— the `(*Mandatory*)` suffix must be declared verbatim.

**C4 — an empty cell already produces no key.** `coerceValue`
(`preconfig-workbook.ts:273-277`) returns `{}` for an empty non-required cell with no
`defaultValue`, and `previewVerticalStep:622` only assigns `values[col.column]` when
`result.value !== undefined`. A blank cell therefore yields no entry in the preview `values`
map, the panel builds no row for it, and nothing can be overwritten with a blank. No extra
guard is needed for this.

**C5 — a bridge to the tenant currency list already exists on the frontend.**
`currencyService.getForBu(buCode)` → `GET /api/config/:buCode/currencies` is already used by
`BusinessUnitEdit` to populate its Default Currency dropdown
(`src/pages/BusinessUnitEdit.tsx:130`).

## 5. Field inventory

| Excel label (verbatim, as the sheet writes it) | `tb_business_unit` column | Kind | Applied by |
|---|---|---|---|
| `date format` | `date_format` | string | direct |
| `date time format` | `date_time_format` | string | direct |
| `time format` | `time_format` | string | direct |
| `short time format` | `short_time_format` | string | direct |
| `long time format` | `long_time_format` | string | direct |
| `time zone` | `timezone` | string | direct |
| `Inventory Cost Type (*Mandatory*)` | `calculation_method` | string + allowlist | direct |
| `Default Currency` | `default_currency_id` | string → UUID | client-resolved |
| `BU Name` | `name` | — | **not applied** (unchanged) |

Sheet labels taken from the committed sample generator,
`scripts/lib/preconfig-mock/property.mjs:73-80`. Every one of the eight is present there, so
`sample_data/Preconfig-mock.xlsx` already exercises the whole change.

## 6. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Apply eight fields; keep `BU Name` excluded | Renaming a BU from a spreadsheet cell is an identity change, not a profile update. The existing `codeMismatch` banner already covers the "wrong file" case that would make a silent rename most damaging. |
| 2 | Resolve `Default Currency` **on the frontend**, not the backend | Backend resolution requires opening a tenant connection inside `previewVerticalStep`, which violates **C2**. The frontend path already exists (**C5**) and degrades to "cannot resolve" instead of failing the whole preview. |
| 3 | Carry the currency through the catalog as a **virtual** column `default_currency_code` | The sheet holds a code; the table stores a UUID. Naming the catalog column after the real column would put a code string where a UUID belongs and, if it ever reached a write, would fail at the database. A distinct name makes the "needs resolution" contract explicit. Safe because a `target: 'platform'` step is refused outright by `importStream` (`preconfig-import.service.ts:675`) — nothing writes this catalog entry. |
| 4 | Add `allowedValues?: string[]` to `ColumnMap` rather than an `'enum'` member of `ColumnKind` | `ColumnKind` selects a *coercion* (how to turn text into a value); this is a *constraint* (which values are legal). Adding a kind would touch the shared coercion switch every step runs through, for a rule only one column needs. |
| 5 | Enforce `allowedValues` in `coerceValue`, case-insensitively, returning the catalog's canonical spelling | `coerceValue` is the single point both the tabular path (`coerceRow`) and `previewVerticalStep` funnel through, so one edit covers both. Case-insensitive matching accepts `Average`/`AVERAGE` from a hand-edited sheet; returning the catalog value normalizes it to the enum's spelling. |
| 6 | Date/time format strings are free text — no allowlist | The set of patterns the renderers accept is not enumerated anywhere in either repo, so an allowlist would be a guess that rejects valid values. The columns are nullable with sane defaults, and the operator sees the exact string in the diff before applying. |
| 7 | All eight catalog entries are **optional** | A workbook predating these labels must land in `missing_optional_columns`, not escalate the step to `columns_missing` on the File check screen. |

## 7. Backend changes — `apps/micro-business/src/preconfig-import/`

### 7.1 `preconfig-types.ts`

One field on `ColumnMap`:

```ts
/**
 * Legal values for this cell, matched case-insensitively. The coerced value is the entry
 * from this list, so a sheet's `Average` normalizes to the catalog's `average`.
 * ค่าที่อนุญาตของเซลล์นี้ เทียบแบบไม่สนตัวพิมพ์ และคืนค่าตามที่ประกาศไว้ในแคตตาล็อก
 */
allowedValues?: string[];
```

### 7.2 `preconfig-workbook.ts` — `coerceValue`

Insert after the `maxLength` check and before the `switch`:

```ts
if (col.allowedValues) {
  const match = col.allowedValues.find((v) => v.toLowerCase() === text.toLowerCase());
  if (!match) {
    return { error: `"${text}" is not one of: ${col.allowedValues.join(', ')}` };
  }
  return { value: match };
}
```

Placed before the `switch` because the allowlist fully determines the result — no further
coercion applies to a value drawn from a fixed set of strings.

### 7.3 `preconfig-catalog.ts` — `company-profile.columns`

Append the eight entries:

```ts
// Display/format preferences. Plain nullable string columns on tb_business_unit — the sheet
// writes these labels in lowercase, which normalizeKey() reconciles with the casing here.
// การตั้งค่ารูปแบบการแสดงผล เป็นคอลัมน์ข้อความธรรมดา
{ excel: 'Date Format',       column: 'date_format',       kind: 'string' },
{ excel: 'Date Time Format',  column: 'date_time_format',  kind: 'string' },
{ excel: 'Time Format',       column: 'time_format',       kind: 'string' },
{ excel: 'Short Time Format', column: 'short_time_format', kind: 'string' },
{ excel: 'Long Time Format',  column: 'long_time_format',  kind: 'string' },
{ excel: 'Time Zone',         column: 'timezone',          kind: 'string' },
// The label carries the "(*Mandatory*)" suffix in the workbook and normalizeKey does not
// strip it, so it must be declared verbatim. Declared optional all the same: a workbook
// without the label must not fail the file check.
// ต้องประกาศป้ายกำกับให้ตรงกับชีต เพราะ normalizeKey ไม่ตัดวงเล็บ
{ excel: 'Inventory Cost Type (*Mandatory*)', column: 'calculation_method',
  kind: 'string', allowedValues: ['average', 'fifo'] },
// VIRTUAL column — no such column exists on tb_business_unit. The sheet holds a currency
// CODE while the record stores a UUID, and tb_currency lives in the TENANT database, which
// this platform-target step never opens (see previewVerticalStep). The wizard resolves the
// code against the tenant currency list and writes `default_currency_id` instead; it must
// never send `default_currency_code` to the API. See CompanyProfilePanel.
// คอลัมน์เสมือน ไคลเอนต์ต้องแปลงรหัสสกุลเงินเป็น UUID เอง แล้วเขียนลง default_currency_id
{ excel: 'Default Currency', column: 'default_currency_code', kind: 'string' },
```

Rewrite the `Deliberately absent, and NOT an oversight` comment block
(`preconfig-catalog.ts:64-70`) so it explains only the surviving exclusion, `BU Name`.

## 8. Frontend changes — `src/pages/tenantImport/CompanyProfilePanel.tsx`

### 8.1 `NOT_APPLIED_LABELS`

Reduce to `['BU Name']` and rewrite the comment above it (currently 15 lines enumerating the
old exclusions and their reasons) to describe only the identity exclusion.

### 8.2 Load the tenant currency list alongside the existing two requests

```ts
const [preview, currentRes, currencies] = await Promise.all([
  preconfigImportService.preview(bu.id, step.id, file),
  businessUnitService.getById(bu.id),
  currencyService.getForBu(bu.code).catch(() => null),
]);
```

The `.catch(() => null)` is required, not defensive padding: a BU with no provisioned tenant
database is a case the platform-target preview explicitly supports (**C2**), and this request is
the only part of the panel that touches the tenant. A failure here must degrade the single
Default Currency row, not the whole panel. Store the list in state alongside `rows` so
`handleApply` can resolve against the same snapshot the operator saw.

### 8.3 The `default_currency_code` row

Special-cased inside the existing `Object.keys(sheetValues).map(...)`:

- **label** — `Default Currency` (a hardcoded override; `humanizeColumn` would yield
  `Default Currency Code`)
- **buValue** — the `code` of the entry in the fetched list whose `id === bu.default_currency_id`;
  empty string when the list is unavailable or the id is unset
- **sheetValue** — the raw cell, unchanged
- **resolution** — `currencies?.find(c => c.code.toUpperCase() === sheetValue.trim().toUpperCase())`

Resolution state drives the row's rendering and whether it can be applied:

| State | Row shows | `changed` | In `changedFields`? |
|---|---|---|---|
| resolved, id differs from `bu.default_currency_id` | normal changed row | `true` | yes, as `default_currency_id: <uuid>` |
| resolved, id matches | normal unchanged row | `false` | no |
| list unavailable (fetch failed) | `Cannot resolve` badge + "the tenant database is unreachable" | `false` | no |
| list loaded, code not in it | `Not found` badge + "run the Currency step first, then Refresh" | `false` | no |
| sheet cell absent | no row at all (**C4**) | — | no |

An unresolvable row must carry `changed: false`, not merely be dropped from `changedFields`.
`changedCount` (`rows.filter(r => r.changed).length`) is what enables the **Apply to BU**
button, while `handleApply` returns early on an empty `changedFields`. If an unresolvable
Default Currency were the only differing row, `changed: true` would leave the button enabled on
a call that silently does nothing.

Neither unresolvable state blocks Apply when other fields did change: the other seven are
independent of the tenant database and must still land.

### 8.4 `handleApply`

Two changes to the loop that builds `changedFields`:

1. Extend the existing unconditional identity guard from `r.key !== 'code' && r.key !== 'id'`
   to also drop `default_currency_code`. The virtual key has no column behind it, so letting it
   reach `businessUnitService.update` would send an unknown field to the API. The row is handled
   by its own branch; this guard exists so a future refactor of the row builder cannot
   reintroduce the leak — the same reasoning the `code` guard already documents.
2. Append the resolved `default_currency_id` when §8.3 produced one.

### 8.5 Frontend re-validation of `calculation_method`

Before calling `update`, confirm the value is one of `average` / `fifo` (lowercased). The
backend already reports a violation through `preview.rows[0].errors` → the existing `sheetErrors`
box, so this is the second of two checks rather than the only one; it exists because this step's
write path is the frontend, so the frontend is the last place able to stop a bad value.

## 9. Error handling summary

| Condition | Behavior |
|---|---|
| Currency list fetch fails | Default Currency row shows `Cannot resolve`; other seven fields apply normally |
| Currency code absent from the tenant list | Row shows `Not found — run the Currency step first`; other seven apply |
| `Inventory Cost Type` holds an illegal value | `coerceValue` returns an error → `preview.rows[0].errors` → existing red `sheetErrors` box; frontend re-check blocks apply |
| Workbook lacks the new labels | No preview values, no rows, nothing written (**C4**) |
| `doc_version` conflict on apply | Unchanged — existing `isVersionConflict` → `notifyVersionConflict` → `load()` path |
| Sheet `BU Code` ≠ selected BU | Unchanged — existing `codeMismatch` banner |

## 10. Verification

Automated tests are out of scope per the working preference in effect for this repo. Static
checks still run.

- **Backend:** `check-types` for `micro-business`
- **Frontend:** `bun run build` (eslint runs inside the build in this repo)
- **Manual, in the browser:**
  1. `/tenant-imports` → pick a BU with a provisioned tenant database → upload
     `sample_data/Preconfig-mock.xlsx`
  2. Open **Company Profile** before running any other step. Expect eight new rows; expect
     Default Currency to read `Not found — run the Currency step first` if the tenant has no
     `THB` row yet.
  3. Run the **Currency** step, return to Company Profile, press **Refresh**. Expect Default
     Currency to resolve to `THB`.
  4. **Apply to BU**, then open `/business-units/:id/edit` and confirm the Calculation Settings
     and format fields carry the workbook's values.
  5. Confirm `BU Name` still renders under `Not applied`.

## 11. Files touched

**`carmen-turborepo-backend-v2`**
- `apps/micro-business/src/preconfig-import/preconfig-types.ts` — `allowedValues` on `ColumnMap`
- `apps/micro-business/src/preconfig-import/preconfig-workbook.ts` — enforce it in `coerceValue`
- `apps/micro-business/src/preconfig-import/preconfig-catalog.ts` — eight columns + comment rewrite

**`carmen-platform`**
- `src/pages/tenantImport/CompanyProfilePanel.tsx` — currency fetch, virtual-column row,
  `handleApply` guard + resolution, shrunken `NOT_APPLIED_LABELS`
