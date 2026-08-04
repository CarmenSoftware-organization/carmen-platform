# Company Profile — Apply the Remaining 8 Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Preconfig wizard's Company Profile step write the eight sheet fields it currently renders as `Not applied`, leaving only `BU Name` excluded.

**Architecture:** The backend catalog gains eight column entries so the preview returns their values; seven map onto ordinary `tb_business_unit` columns and flow through the panel's existing generic apply loop untouched. The eighth, `Default Currency`, travels as a **virtual** catalog column `default_currency_code` because the sheet holds a currency code while the record stores a UUID from a *different database* — the frontend resolves it against the tenant currency list it can already reach, and writes `default_currency_id`.

**Tech Stack:** NestJS + TypeScript (micro-business, Bun 1.2.5, turborepo) · React 19 + TypeScript + Vite (carmen-platform, Bun) · exceljs for workbook parsing · shadcn/ui Badge

**Spec:** `docs/superpowers/specs/2026-08-04-company-profile-remaining-fields-design.md`

## Global Constraints

- **No automated tests.** Per the working preferences in effect for this repo, do not write `*.test.ts` / `*.spec.ts` files and do not add test steps. Static checks (type-check, lint) are **not** tests and must still run. Manual browser verification is **not** skipped — it is Task 5.
- **Two repos.** Backend work is in `../carmen-turborepo-backend-v2`; frontend work is in `carmen-platform`. Commit separately in each; never stage across repos.
- **Frontend branch:** `feature/company-profile-remaining-fields` (already created and holding the spec commit). Create a matching branch in the backend repo.
- **Excel labels are matched through `normalizeKey`** = `v.replace(/\s+/g, ' ').trim().toLowerCase()` (`preconfig-workbook.ts:23-25`). It lowercases and collapses whitespace but **strips nothing else** — a `(*Mandatory*)` suffix must be declared verbatim.
- **Never modify `src/components/ui/`** primitives.
- **Comments in this codebase are bilingual** — an English comment followed by a Thai line. Match that; every code block below already does.
- **`BU Name` stays unapplied.** No task may map the sheet's `BU Name` onto `tb_business_unit.name`.

---

## File Structure

**`../carmen-turborepo-backend-v2/apps/micro-business/src/preconfig-import/`**

| File | Responsibility | Change |
|---|---|---|
| `preconfig-types.ts` | Catalog type definitions | Add `allowedValues?: string[]` to `ColumnMap` |
| `preconfig-workbook.ts` | Workbook parsing + cell coercion | Enforce `allowedValues` inside `coerceValue` |
| `preconfig-catalog.ts` | The fixed step catalog | Add 8 columns to `company-profile`; rewrite the exclusion comment |

**`carmen-platform/src/pages/tenantImport/`**

| File | Responsibility | Change |
|---|---|---|
| `CompanyProfilePanel.tsx` | Diff + apply UI for the platform-target step | Fetch tenant currencies, model the virtual currency row and its three unresolvable states, guard the virtual key out of the payload, write the resolved UUID, re-check the enum, shrink `NOT_APPLIED_LABELS` |

No new files. `CompanyProfilePanel.tsx` is 317 lines and grows to roughly 400 — well inside the ~600-line ceiling this repo sets for page files, so no split.

---

### Task 1: `allowedValues` plumbing (backend)

Pure type + coercion plumbing. Nothing declares `allowedValues` yet, so behavior is unchanged after this task — that is intentional and makes the change reviewable on its own.

**Files:**
- Modify: `../carmen-turborepo-backend-v2/apps/micro-business/src/preconfig-import/preconfig-types.ts:5-13`
- Modify: `../carmen-turborepo-backend-v2/apps/micro-business/src/preconfig-import/preconfig-workbook.ts:269-303`

**Interfaces:**
- Consumes: nothing.
- Produces: `ColumnMap.allowedValues?: string[]` — an optional allowlist honored by `coerceValue(col: ColumnMap, raw: string): { value?: unknown; error?: string }`. Task 2 declares it on one column.

- [ ] **Step 1: Create the backend branch**

```bash
cd ../carmen-turborepo-backend-v2
git checkout -b feature/company-profile-remaining-fields
```

- [ ] **Step 2: Add `allowedValues` to `ColumnMap`**

In `preconfig-types.ts`, the interface currently reads:

```ts
/** One Excel column mapped onto one database column. */
export interface ColumnMap {
  excel: string | null;      // null => value is not sourced from the sheet
  column: string;
  kind: ColumnKind;
  required?: boolean;
  maxLength?: number;
  /** Applied when the sheet value is empty (or when `excel` is null). */
  defaultValue?: string | number | boolean;
}
```

Insert the new member between `maxLength` and `defaultValue`:

```ts
  maxLength?: number;
  /**
   * Legal values for this cell, matched case-insensitively. The coerced value is the entry
   * from this list, so a sheet's `Average` normalizes to the catalog's `average`.
   * ค่าที่อนุญาตของเซลล์นี้ เทียบแบบไม่สนตัวพิมพ์ และคืนค่าตามที่ประกาศไว้ในแคตตาล็อก
   */
  allowedValues?: string[];
  /** Applied when the sheet value is empty (or when `excel` is null). */
  defaultValue?: string | number | boolean;
```

- [ ] **Step 3: Enforce it in `coerceValue`**

In `preconfig-workbook.ts`, `coerceValue` currently runs the `maxLength` check and falls straight into the `switch`:

```ts
  if (col.maxLength && text.length > col.maxLength) {
    return { error: `Value exceeds ${col.maxLength} characters` };
  }
  switch (col.kind) {
```

Insert the allowlist check between them:

```ts
  if (col.maxLength && text.length > col.maxLength) {
    return { error: `Value exceeds ${col.maxLength} characters` };
  }
  // A fixed set of legal strings fully determines the result, so no ColumnKind coercion
  // applies afterwards. Matched case-insensitively and returned in the catalog's spelling, so
  // a hand-typed `Average` reaches Prisma as the enum member `average`.
  // ชุดค่าที่กำหนดไว้ตายตัวเป็นตัวกำหนดผลลัพธ์ จึงไม่ต้องแปลงชนิดต่อ และคืนค่าตามที่ประกาศไว้
  if (col.allowedValues) {
    const match = col.allowedValues.find((v) => v.toLowerCase() === text.toLowerCase());
    if (!match) {
      return { error: `"${text}" is not one of: ${col.allowedValues.join(', ')}` };
    }
    return { value: match };
  }
  switch (col.kind) {
```

Placement matters: it sits **after** the empty-cell branch (lines 273-277) so an absent optional label still yields `{}` rather than an allowlist error, and **before** the `switch` because a value drawn from a fixed set of strings needs no further coercion.

- [ ] **Step 4: Type-check**

```bash
cd ../carmen-turborepo-backend-v2/apps/micro-business && bun run check-types
```

Expected: exits 0, no output. If it reports errors in files you did not touch, they are pre-existing — note them and continue.

- [ ] **Step 5: Commit**

```bash
cd ../carmen-turborepo-backend-v2
git add apps/micro-business/src/preconfig-import/preconfig-types.ts \
        apps/micro-business/src/preconfig-import/preconfig-workbook.ts
git commit -m "feat(preconfig-import): allow a column to declare a value allowlist

ColumnKind selects a coercion; this is a constraint. Keeping them separate
avoids touching the shared coercion switch every step runs through for a
rule only one column needs.

Matched case-insensitively and returned in the catalog's spelling, so a
hand-typed 'Average' normalizes to the enum member 'average'."
```

---

### Task 2: Eight catalog columns (backend)

**Files:**
- Modify: `../carmen-turborepo-backend-v2/apps/micro-business/src/preconfig-import/preconfig-catalog.ts:64-72`

**Interfaces:**
- Consumes: `ColumnMap.allowedValues` from Task 1.
- Produces: the `company-profile` preview response `values` map now carries, when the sheet supplies them, the keys `date_format`, `date_time_format`, `time_format`, `short_time_format`, `long_time_format`, `timezone`, `calculation_method`, and `default_currency_code`. Tasks 3 and 4 consume exactly these key names.

**Heads-up on intermediate state:** after this task and before Task 3, the frontend's generic apply loop would send `default_currency_code` — a column that does not exist — to `businessUnitService.update`. That is why Task 3 is not optional and why neither backend commit ships without it.

- [ ] **Step 1: Replace the exclusion comment and add the eight columns**

In `preconfig-catalog.ts`, the `company-profile` step's `columns` array currently ends:

```ts
      { excel: 'Tax ID (*Mandatory*)', column: 'tax_no', kind: 'string', required: true },
      { excel: 'Branch No (*Mandatory*)', column: 'branch_no', kind: 'string', required: true },
      // Deliberately absent, and NOT an oversight:
      //   "Inventory Cost Type" / "Default Currency" — no plain business-unit column to write
      //     (calculation_method is an enum and default_currency_id is a foreign key); the wizard
      //     lists them as "not applied" from its own label list.
      //   "BU Name" — identity, like BU Code; a spreadsheet must not rename a business unit.
      //   "date format" … "time zone" — display preferences owned by the BU settings page.
      // ที่ไม่ได้แมปไว้โดยตั้งใจ: ประเภทต้นทุน/สกุลเงินตั้งต้น (ไม่ใช่คอลัมน์ข้อความธรรมดา)
      // ชื่อหน่วยธุรกิจ (เป็นข้อมูลระบุตัวตน) และรูปแบบวันที่/เวลา (เป็นการตั้งค่าการแสดงผล)
    ],
```

Replace everything from `// Deliberately absent` through the line before `],` with:

```ts
      // Display/format preferences. Plain nullable string columns on tb_business_unit. The
      // workbook writes these labels in lowercase ("date format", "time zone"); normalizeKey
      // lowercases both sides, so the casing here is free.
      // การตั้งค่ารูปแบบการแสดงผล เป็นคอลัมน์ข้อความธรรมดา ตัวพิมพ์ไม่มีผลเพราะ normalizeKey แปลงให้แล้ว
      { excel: 'Date Format', column: 'date_format', kind: 'string' },
      { excel: 'Date Time Format', column: 'date_time_format', kind: 'string' },
      { excel: 'Time Format', column: 'time_format', kind: 'string' },
      { excel: 'Short Time Format', column: 'short_time_format', kind: 'string' },
      { excel: 'Long Time Format', column: 'long_time_format', kind: 'string' },
      { excel: 'Time Zone', column: 'timezone', kind: 'string' },
      // enum_calculation_method has exactly two members. The label carries a "(*Mandatory*)"
      // suffix in the workbook and normalizeKey does not strip it, so it is declared verbatim —
      // but the column is still OPTIONAL here, because a workbook predating this label must
      // land in missing_optional_columns rather than failing the file check.
      // ป้ายกำกับต้องตรงกับชีตเพราะ normalizeKey ไม่ตัดวงเล็บ และยังคงเป็นคอลัมน์ที่ไม่บังคับ
      {
        excel: 'Inventory Cost Type (*Mandatory*)',
        column: 'calculation_method',
        kind: 'string',
        allowedValues: ['average', 'fifo'],
      },
      // VIRTUAL column — tb_business_unit has no `default_currency_code`. The sheet holds a
      // currency CODE while the record stores a UUID, and tb_currency lives in the TENANT
      // database, which this platform-target step never opens (see previewVerticalStep, which
      // deliberately runs before resolveConnection so a BU with no database still previews).
      // The wizard resolves the code against the tenant currency list and writes
      // `default_currency_id`; it must never send this key to the API. See CompanyProfilePanel.
      // คอลัมน์เสมือน ไคลเอนต์ต้องแปลงรหัสสกุลเงินเป็น UUID เอง แล้วเขียนลง default_currency_id
      { excel: 'Default Currency', column: 'default_currency_code', kind: 'string' },
      // Deliberately absent, and NOT an oversight:
      //   "BU Name" — identity, like BU Code; a spreadsheet must not rename a business unit.
      //     The wizard lists it as "not applied" from its own label list.
      // ที่ไม่ได้แมปไว้โดยตั้งใจ: ชื่อหน่วยธุรกิจ เพราะเป็นข้อมูลระบุตัวตน สเปรดชีตต้องไม่เปลี่ยนชื่อหน่วยธุรกิจ
```

None of the eight carries `required: true` — Global Constraints and decision #7 in the spec.

- [ ] **Step 2: Type-check**

```bash
cd ../carmen-turborepo-backend-v2/apps/micro-business && bun run check-types
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd ../carmen-turborepo-backend-v2
git add apps/micro-business/src/preconfig-import/preconfig-catalog.ts
git commit -m "feat(preconfig-import): map the 8 unmapped Company Profile fields

Six date/time preferences are plain nullable string columns and
calculation_method is a two-member enum, so the recorded reasons for
excluding them no longer hold.

Default Currency travels as a virtual 'default_currency_code' column: the
sheet holds a code, the record stores a UUID, and tb_currency lives in the
tenant database this platform-target step deliberately never opens. The
client resolves it.

BU Name stays excluded — identity, not a profile field."
```

---

### Task 3: Show the eight fields and keep the virtual key out of the payload (frontend)

After this task the six format fields and `calculation_method` apply end-to-end through the existing generic loop, and Default Currency displays with an accurate resolution state but is never written. **This state is shippable on its own.**

**Files:**
- Modify: `src/pages/tenantImport/CompanyProfilePanel.tsx`

**Interfaces:**
- Consumes: the preview `values` keys produced by Task 2; `currencyService.getForBu(buCode: string): Promise<TenantCurrency[]>` from `src/services/currencyService.ts`; `TenantCurrency { id: string; code: string; name: string; symbol?: string; decimal_places?: number; is_active?: boolean; description?: string }` from `src/types/index.ts:574-582`.
- Produces: `CURRENCY_CODE_KEY` constant; `FieldRow.currency` discriminated union; `currencyRow(...)` and `renderStatus(...)` module-level helpers. Task 4 reads `FieldRow.currency`.

- [ ] **Step 1: Add the two imports**

`CompanyProfilePanel.tsx` currently imports:

```ts
import businessUnitService from '../../services/businessUnitService';
import preconfigImportService from '../../services/preconfigImportService';
```

Add `currencyService` after `businessUnitService`, and extend the type import on the last import line from

```ts
import type { BusinessUnit, PreconfigStepMeta } from '../../types';
```

to

```ts
import type { BusinessUnit, PreconfigStepMeta, TenantCurrency } from '../../types';
```

- [ ] **Step 2: Shrink `NOT_APPLIED_LABELS` and rewrite its comment**

Replace lines 13-39 in full — the 15-line comment block that starts `// Sheet labels that exist in "Company Profile"`, the blank line after it, and the nine-entry `NOT_APPLIED_LABELS` array — with:

```ts
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
```

- [ ] **Step 3: Extend `FieldRow` with the currency resolution state**

The interface currently reads:

```ts
interface FieldRow {
  key: string;
  label: string;
  buValue: string;
  sheetValue: string;
  changed: boolean;
}
```

Replace it with:

```ts
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
```

- [ ] **Step 4: Add the `currencyRow` helper**

Add directly below `humanizeColumn`:

```ts
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
```

- [ ] **Step 5: Fetch the tenant currency list in `load()`**

The `Promise.all` currently reads:

```ts
      const [preview, currentRes] = await Promise.all([
        preconfigImportService.preview(bu.id, step.id, file),
        businessUnitService.getById(bu.id),
      ]);
```

Replace with:

```ts
      const [preview, currentRes, currencies] = await Promise.all([
        preconfigImportService.preview(bu.id, step.id, file),
        businessUnitService.getById(bu.id),
        // The only tenant-database read this panel makes. A platform-target preview
        // deliberately works for a BU with no provisioned database (see previewVerticalStep),
        // so a failure here must degrade the Default Currency row alone, never the panel.
        // การอ่านจากฐานข้อมูลผู้เช่าเพียงจุดเดียว หากล้มเหลวต้องกระทบเฉพาะแถวสกุลเงิน
        currencyService.getForBu(bu.code).catch(() => null),
      ]);
```

- [ ] **Step 6: Route the virtual key to `currencyRow` when building rows**

The `.map` callback currently reads:

```ts
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
```

Replace with:

```ts
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
```

- [ ] **Step 7: Render the resolution states**

The status cell in the rows table currently reads:

```tsx
                    <td className="px-3 py-2">
                      <Badge variant={r.changed ? 'warning' : 'secondary'}>{r.changed ? 'Changed' : 'Same'}</Badge>
                    </td>
```

Replace with:

```tsx
                    <td className="px-3 py-2">{renderStatus(r)}</td>
```

- [ ] **Step 8: Guard the virtual key out of the payload**

In `handleApply`, the loop currently reads:

```ts
      if (r.changed && r.key !== 'code' && r.key !== 'id') changedFields[r.key] = r.sheetValue;
```

Replace it, and extend the comment above it, so the block reads:

```ts
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
```

- [ ] **Step 9: Build**

```bash
bun run build
```

Expected: build succeeds. eslint runs inside the build in this repo, so a lint failure fails the build — fix every error before continuing. Watch specifically for `TS6133` (unused import) if any step was applied partially.

- [ ] **Step 10: Commit**

```bash
git add src/pages/tenantImport/CompanyProfilePanel.tsx
git commit -m "feat(company-profile): show the 8 newly mapped fields in the diff

The six format fields and calculation_method are ordinary record columns and
flow through the existing apply loop unchanged. Default Currency is a virtual
catalog column carrying a code, so it gets its own row builder that resolves
against the tenant currency list and reports why it cannot, plus an
unconditional guard keeping the virtual key out of the update payload.

An unresolvable currency row reports changed:false rather than only being
dropped from the payload — changedCount enables the Apply button while
handleApply returns early on an empty payload, so changed:true would leave
the button live on a call that does nothing."
```

---

### Task 4: Write the resolved currency id and re-check the enum (frontend)

**Files:**
- Modify: `src/pages/tenantImport/CompanyProfilePanel.tsx`

**Interfaces:**
- Consumes: `FieldRow.currency` and `CURRENCY_CODE_KEY` from Task 3.
- Produces: nothing further.

- [ ] **Step 1: Add the enum constant**

Directly below `CURRENCY_CODE_KEY`, add:

```ts
// enum_calculation_method's two members, mirroring the catalog's `allowedValues`. The backend
// already rejects anything else into `sheetErrors`; this exists because the write path for this
// step is the client, so the client is the last place able to stop a bad value.
// สมาชิกสองค่าของ enum ฝั่งเซิร์ฟเวอร์ตรวจแล้ว แต่ไคลเอนต์เป็นผู้เขียนข้อมูล จึงต้องตรวจซ้ำ
const CALCULATION_METHODS = ['average', 'fifo'];
```

- [ ] **Step 2: Append the resolved currency id and the enum re-check in `handleApply`**

The block between the loop's closing brace and `setApplying(true)` currently reads:

```ts
    }
    if (Object.keys(changedFields).length === 0) return;
    setApplying(true);
```

Replace with:

```ts
      // The virtual currency row writes its resolved UUID under the REAL column name. Only a
      // `resolved` row can reach here with `changed: true` — currencyRow reports `false` for
      // both unresolvable states — so no extra state check is needed beyond narrowing the union.
      // แถวสกุลเงินเสมือนเขียน UUID ที่แปลงแล้วลงในชื่อคอลัมน์จริง
      if (r.changed && r.key === CURRENCY_CODE_KEY && r.currency?.state === 'resolved') {
        changedFields.default_currency_id = r.currency.resolvedId;
      }
    }
    const method = changedFields.calculation_method;
    if (method && !CALCULATION_METHODS.includes(method.toLowerCase())) {
      toast.error(`Inventory Cost Type must be one of: ${CALCULATION_METHODS.join(', ')}`);
      return;
    }
    if (Object.keys(changedFields).length === 0) return;
    setApplying(true);
```

Read the braces carefully: the new `if` block goes **inside** the `for (const r of rows)` loop, after the guard block Task 3 Step 8 produced and before the loop's closing brace. The bare `}` on the fourth line of the replacement **is** that loop's closing brace — it is the same brace that opens the "currently reads" snippet, not a new one. The enum check and everything after it sit outside the loop.

`method` is checked for truthiness rather than `!== undefined`: an empty cell never reaches `changedFields` at all (see Notes), so the two are equivalent here, and truthiness avoids a needless `string`-vs-`undefined` comparison.

- [ ] **Step 3: Build**

```bash
bun run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tenantImport/CompanyProfilePanel.tsx
git commit -m "feat(company-profile): apply the resolved default currency

Writes the tenant currency UUID under default_currency_id, and re-checks
Inventory Cost Type against the enum before calling the API — the backend
reports a violation through sheetErrors, but this step's write path is the
client, so the client is the last place able to stop one."
```

---

### Task 5: Manual verification

No code. This is the verification the skipped automated tests would otherwise have covered, so do not shorten it.

**Files:** none.

- [ ] **Step 1: Start the backend**

Run micro-business and the gateway against the DEV or local platform database, whichever the wizard is normally exercised against.

- [ ] **Step 2: Start the frontend**

```bash
bun run dev
```

Serves on `:3304`.

- [ ] **Step 3: Open the wizard and upload the sample workbook**

Navigate to `/tenant-imports`. Pick a business unit that has a provisioned tenant database. Upload `sample_data/Preconfig-mock.xlsx` — it already carries all eight labels (`scripts/lib/preconfig-mock/property.mjs:73-80`).

- [ ] **Step 4: Check the File check screen**

Company Profile must read `ready`. If it reads `columns_missing`, a catalog entry was declared `required: true` by mistake — fix Task 2.

- [ ] **Step 5: Open Company Profile before running any other step**

Expect eight new rows in the diff table: `Date Format`, `Date Time Format`, `Time Format`, `Short Time Format`, `Long Time Format`, `Timezone`, `Calculation Method`, `Default Currency`.

If the tenant has no `THB` currency row yet, `Default Currency` must show `Not found — run Currency first` and must **not** be counted in the `N changed` badge. Confirm the count excludes it.

`BU Name` must still appear under `Not applied`. `Inventory Cost Type` and the format labels must **no longer** appear there.

- [ ] **Step 6: Run the Currency step, then Refresh**

Run step **Currencies**. Return to Company Profile and press **Refresh**. `Default Currency` must now resolve — workbook column `THB`, status `Changed` (or `Same` if the BU already pointed at THB).

- [ ] **Step 7: Apply and confirm persistence**

Press **Apply to BU**. Expect the success toast. Open `/business-units/:id/edit` for the same BU and confirm under Calculation Settings that Default Currency reads `THB` and Calculation Method reads `Average`, and that the six date/time format fields carry the workbook's values.

- [ ] **Step 8: Confirm the illegal-enum path**

Edit a copy of the workbook so `Inventory Cost Type (*Mandatory*)` reads `LIFO`. Upload it and open Company Profile. Expect the red `sheetErrors` box to name the field with `"LIFO" is not one of: average, fifo`.

- [ ] **Step 9: Record the results**

Report which steps passed and paste the exact text of any failure. Do not report the feature complete on steps that were not run.

---

## Notes for the implementer

- **Do not** add a currency lookup to `previewVerticalStep`. It runs before `resolveConnection` on purpose (`preconfig-import.service.ts:451-458`) so the step previews for a BU with no provisioned database. Moving resolution there is the one change this design exists to avoid.
- **Do not** add a guard against a blank sheet cell overwriting an existing value. `coerceValue` returns `{}` for an empty non-required cell (`preconfig-workbook.ts:273-277`) and `previewVerticalStep` only assigns `values[col.column]` when the value is not `undefined`, so a blank cell produces no key, no row, and no write.
- `humanizeColumn('timezone')` yields `Timezone` and `humanizeColumn('calculation_method')` yields `Calculation Method`. Both are acceptable; only the currency row needs its label overridden, because `humanizeColumn(CURRENCY_CODE_KEY)` would read `Default Currency Code`.
