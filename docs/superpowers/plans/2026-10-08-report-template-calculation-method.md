# Report Template Calculation Method Tag & Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag each report template with the inventory calculation methods it supports and let admins see, edit and filter that tag on `/report-templates`.

**Architecture:** New enum-array column `tb_report_template.calculation_methods` (empty = every method) in the platform Prisma schema; gateway DTO + micro-cluster service read/write it and carry it through version snapshots. The FE list page filters server-side through the existing `paginate.advance` JSON (`where` is passed verbatim into Prisma `where.AND`); the Edit page edits it with three checkboxes.

**Tech Stack:** Prisma 6 / PostgreSQL enum arrays, NestJS + zod v4 (gateway), micro-cluster (NestJS TCP), React 19 + TypeScript + shadcn/ui (FE).

**Spec:** `docs/superpowers/specs/2026-10-08-report-template-calculation-method-design.md`

## Global Constraints

- Enum values exactly: `fifo`, `average`, `average_per_location` (existing `enum_calculation_method`).
- Empty array = supports every method. Never `null` on the wire from the backend.
- Phase A only: no change to `micro-report`, BUs still see every report.
- **No new test files** (user preference). Each task: implement → type-check → lint → existing tests → commit. Manual verification in the last task.
- Backend repo: `../carmen-turborepo-backend-v2`, branch `feature/report-template-calculation-method` off fresh `origin/main` (local `main` is 4 behind — pull first). Never commit to `main`.
- Frontend repo: this repo, branch `feature/report-template-calculation-method` (already exists, holds the spec).
- Backend lint: `bunx eslint <files>` — **never** `bun run lint` (it runs `--fix` across the whole repo).
- **Pushing a backend branch that contains a migration applies it to DEV within ~2 min** (happened twice before). This migration is additive with a default, so that is acceptable — but push only after Task 3 is complete.
- Deploy order: backend to DEV first, then frontend. FE first = list page 500s (filter on unknown column).
- Text in the UI goes through i18n — add every key to both `src/i18n/en.ts` and `src/i18n/th.ts` (`th: Translations` makes a missing key a type error).

## Review Focus

1. **Old localStorage / bogus filter values** — a stored `filters_report_templates_calculation_method` with an unknown value (e.g. `"avg"`) must be dropped on read, not sent to Prisma (an invalid enum value 500s the list). Pinned in Task 5 Step 2 (`readCalculationMethodFilter`).
2. **Restoring a version taken before this feature** — its snapshot has no `calculation_methods` key; restore must keep the current tags, and the versions diff must not claim "tags → —". Pinned in Task 3 Step 4 and Task 6 Step 4.
3. **Form templates** — tags are meaningless for forms (printable documents); the Edit page hides the field for forms and saves `[]`, same as the BU allow/deny lists. Pinned in Task 6 Step 3.
4. **Unsaved-changes false positive** — toggling a checkbox off and on again must not leave the form "dirty" because the array order changed. Order is canonicalised to `CALCULATION_METHODS` order. Pinned in Task 6 Step 2.
5. **Backup → import round trip** — a backup file must carry the tags; an old backup without the key must still import (untagged). Pinned in Task 4 Step 3.

---

### Task 1: Prisma column + migration (backend)

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (model `tb_report_template`, after `signature_config`)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20261008130000_report_template_calculation_methods/migration.sql`

**Interfaces:**
- Produces: Prisma field `tb_report_template.calculation_methods: enum_calculation_method[]` (generated client type `$Enums.enum_calculation_method[]`).

- [ ] **Step 1: Branch from fresh main**

```bash
cd ../carmen-turborepo-backend-v2
git checkout main && git pull --ff-only
git checkout -b feature/report-template-calculation-method
```

- [ ] **Step 2: Add the field to the schema**

In `model tb_report_template`, directly after the `signature_config` line:

```prisma
  // calculation_methods — inventory costing methods this template supports.
  // Empty = supports every method. Phase B (micro-report) will hide templates
  // from a BU whose calculation_method is not listed; phase A only tags + filters.
  calculation_methods enum_calculation_method[] @default([])
```

- [ ] **Step 3: Write the migration**

`migration.sql`:

```sql
-- 20261008130000_report_template_calculation_methods
-- costing methods ที่ template รองรับ — ว่าง = รองรับทุก method (แถวเดิมทั้งหมดจึงได้ {} )
ALTER TABLE "tb_report_template"
  ADD COLUMN IF NOT EXISTS "calculation_methods" "enum_calculation_method"[] DEFAULT ARRAY[]::"enum_calculation_method"[];
```

(No `NOT NULL` — Prisma scalar-list columns are generated nullable; adding it would make `migrate diff` report drift.)

- [ ] **Step 4: Confirm schema and migrations agree**

```bash
cd packages/prisma-shared-schema-platform
bunx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script
```

Expected: an empty script (or only the known `idx_report_template_default_per_group` partial-index line that the schema comment says Prisma cannot express — that line must NOT be acted on). If no shadow DB is available, skip and rely on Step 5 + the DEV apply in Task 4.

- [ ] **Step 5: Generate the client and type-check**

```bash
bun run db:generate
bun run check-types
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma packages/prisma-shared-schema-platform/prisma/migrations/20261008130000_report_template_calculation_methods
git commit -m "feat(report-template): calculation_methods column (empty = all methods)"
```

---

### Task 2: Gateway DTO + swagger response (backend)

**Files:**
- Modify: `apps/backend-gateway/src/common/dto/report-template/report-template.dto.ts` (both `ReportTemplateCreateSchema` and `ReportTemplateUpdateSchema`, after `signature_config`)
- Modify: `apps/backend-gateway/src/platform/platform_report-templates/swagger/response.ts` (after `deny_business_unit`)

**Interfaces:**
- Consumes: `enum_calculation_method` from `@repo/prisma-shared-schema-platform` (Task 1).
- Produces: `IReportTemplateCreate.calculation_methods?: enum_calculation_method[]`, `IReportTemplateUpdate.calculation_methods?: enum_calculation_method[]` (deduplicated).

- [ ] **Step 1: Add a shared schema and import**

At the top of `report-template.dto.ts`, after the `zod/v4` import:

```ts
import { enum_calculation_method } from '@repo/prisma-shared-schema-platform';
```

After `SOURCE_NAME_PATTERN`:

```ts
/**
 * Costing methods a template supports; empty = every method. Duplicates are dropped
 * costing method ที่ template รองรับ — ว่าง = ทุก method; ค่าซ้ำถูกตัดทิ้ง
 */
const CalculationMethodsSchema = z
  .array(z.nativeEnum(enum_calculation_method))
  .transform((v) => [...new Set(v)])
  .optional()
  .meta({
    example: ['average', 'average_per_location'],
    description:
      'Inventory calculation methods this template supports. Empty = every method. Omitted on update = unchanged',
  });
```

- [ ] **Step 2: Use it in both schemas**

In `ReportTemplateCreateSchema`'s object and in `ReportTemplateUpdateSchema`, directly after the `signature_config` entry:

```ts
    calculation_methods: CalculationMethodsSchema,
```

- [ ] **Step 3: Document it on the response DTO**

In `swagger/response.ts`, after the `deny_business_unit` property:

```ts
  @ApiPropertyOptional({
    description: 'Inventory calculation methods this template supports; empty = every method',
    example: ['average'],
    isArray: true,
    enum: ['fifo', 'average', 'average_per_location'],
  })
  calculation_methods?: string[];
```

- [ ] **Step 4: Check for an `advance` key allowlist**

```bash
grep -rn "advance" apps/backend-gateway/src/platform/platform_report-templates apps/backend-gateway/src/common/paginate* apps/backend-gateway/src/common/**/paginate* 2>/dev/null | grep -iv "spec\|@param\|description" | head
```

Expected: no allowlist of `where` keys (the advance string is forwarded). If one exists, add `calculation_methods` to it in this task.

- [ ] **Step 5: Type-check + lint**

```bash
bun run check-types --filter=backend-gateway
bunx eslint apps/backend-gateway/src/common/dto/report-template/report-template.dto.ts apps/backend-gateway/src/platform/platform_report-templates/swagger/response.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/common/dto/report-template/report-template.dto.ts apps/backend-gateway/src/platform/platform_report-templates/swagger/response.ts
git commit -m "feat(gateway): accept + document report template calculation_methods"
```

---

### Task 3: micro-cluster read/write/snapshot/restore (backend)

**Files:**
- Modify: `apps/micro-cluster/src/cluster/report-template/report-template-version.ts` (`SNAPSHOT_FIELDS`)
- Modify: `apps/micro-cluster/src/cluster/report-template/report-template.service.ts` (`findAll` select ~L56-79, `create` ~L245-265, `update` ~L330-350, `restoreVersion` ~L540-565)

**Interfaces:**
- Consumes: `IReportTemplateUpdate.calculation_methods` (Task 2), Prisma field (Task 1).
- Produces: list rows and `findOne` include `calculation_methods: string[]`; snapshots include `calculation_methods`.

- [ ] **Step 1: Snapshot field**

In `SNAPSHOT_FIELDS`, append `'calculation_methods'` after `'deny_business_unit'`:

```ts
  'allow_business_unit', 'deny_business_unit', 'calculation_methods',
```

(`findOne` uses `findFirst` without `select`, so it already returns the column.)

- [ ] **Step 2: List select**

In `findAll`'s `select` (the first list method, the one using `q.where()`), after `deny_business_unit: true,`:

```ts
        calculation_methods: true,
```

Leave `findForms` alone — forms are not tagged.

- [ ] **Step 3: Create and update**

In `create`'s `data`, after `deny_business_unit: data.deny_business_unit,`:

```ts
          calculation_methods: data.calculation_methods ?? [],
```

In `update`'s `data`, after the `deny_business_unit` line:

```ts
          // undefined = ไม่แตะค่าเดิม (Prisma ข้าม key ที่เป็น undefined)
          calculation_methods: data.calculation_methods,
```

- [ ] **Step 4: Restore keeps current tags for pre-feature snapshots**

In `restoreVersion`'s `data`, after `deny_business_unit: json(snap.deny_business_unit),`:

```ts
          // snapshot ก่อนมีฟิลด์นี้ไม่มี key — คงค่าปัจจุบันไว้ ไม่ล้าง tag ทิ้งเงียบ ๆ
          calculation_methods: Array.isArray(snap.calculation_methods)
            ? (snap.calculation_methods as enum_calculation_method[])
            : current.calculation_methods,
```

Add `enum_calculation_method` to the existing `@repo/prisma-shared-schema-platform` import at the top of the service (it already imports `Prisma` from there; extend that import).

- [ ] **Step 5: Type-check, lint, existing specs**

```bash
bun run check-types --filter=micro-cluster
bunx eslint apps/micro-cluster/src/cluster/report-template/report-template.service.ts apps/micro-cluster/src/cluster/report-template/report-template-version.ts
cd apps/micro-cluster && bunx jest src/cluster/report-template --runInBand --forceExit; cd ../..
```

Expected: all green. If an existing spec asserts the exact `select` object or snapshot key list, update that expectation to include `calculation_methods` (that is fixing an existing test, not writing a new one).

- [ ] **Step 6: Commit**

```bash
git add apps/micro-cluster/src/cluster/report-template
git commit -m "feat(micro-cluster): read/write calculation_methods + carry it through versions"
```

---

### Task 4: Backend gates, push, PR; FE type + backup carry-through

**Files (backend):** none new.
**Files (frontend):**
- Modify: `src/services/reportTemplateService.ts` (type)
- Modify: `src/utils/reportTemplateBackup.ts` (`BACKUP_FIELDS`)

**Interfaces:**
- Produces (FE): `export type CalculationMethod = 'fifo' | 'average' | 'average_per_location'`; `ReportTemplate.calculation_methods?: CalculationMethod[]` — both exported from `src/services/reportTemplateService.ts`.

- [ ] **Step 1: Backend gates, then push + PR**

```bash
cd ../carmen-turborepo-backend-v2
bun run gates
git push -u origin feature/report-template-calculation-method
gh pr create --base main --title "feat(report-template): calculation_methods tag (phase A)" --body "Adds tb_report_template.calculation_methods (enum_calculation_method[], empty = all). Gateway DTO/swagger + micro-cluster read/write/snapshot/restore. No micro-report change (GORM Save only writes model fields). Spec: carmen-platform docs/superpowers/specs/2026-10-08-report-template-calculation-method-design.md"
```

Expected: gates green (if `audit:env-drift` is red on `main` too, it is the known pre-existing failure — note it in the PR, don't fix here). Pushing applies the migration to DEV (see Global Constraints).

- [ ] **Step 2: FE type**

In `src/services/reportTemplateService.ts`, after `export type ReportTemplateType = 'form' | 'list';`:

```ts
export type CalculationMethod = 'fifo' | 'average' | 'average_per_location';
```

In `interface ReportTemplate`, after `deny_business_unit?: unknown;`:

```ts
  // empty / absent = supports every calculation method
  calculation_methods?: CalculationMethod[];
```

- [ ] **Step 3: Backup carries the field**

In `src/utils/reportTemplateBackup.ts`, `BACKUP_FIELDS` (kept identical to backend `SNAPSHOT_FIELDS`):

```ts
  'allow_business_unit', 'deny_business_unit', 'calculation_methods',
```

Old backup files have no key → `ReportTemplateImportDialog` only picks keys present (`key in tpl`) → create defaults to `[]`, update leaves it unchanged.

- [ ] **Step 4: Type-check + lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/services/reportTemplateService.ts src/utils/reportTemplateBackup.ts
git commit -m "feat(report-templates): calculation_methods type + include in backups"
```

---

### Task 5: Shared helpers + list page filter, column, CSV

**Files:**
- Create: `src/pages/reportTemplates/calculationMethods.tsx`
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (`pages.reportTemplates` block)

**Interfaces:**
- Consumes: `CalculationMethod` (Task 4).
- Produces (from `calculationMethods.tsx`):
  - `CALCULATION_METHODS: readonly CalculationMethod[]` — canonical order `['fifo', 'average', 'average_per_location']`
  - `CALCULATION_METHOD_KEYS: Record<CalculationMethod, TKey>`
  - `type CalculationMethodFilterValue = CalculationMethod | 'restricted'`
  - `readCalculationMethodFilter(raw: unknown): CalculationMethodFilterValue[]`
  - `buildCalculationMethodWhere(sel: CalculationMethodFilterValue[]): Record<string, unknown> | null`
  - `sortCalculationMethods(list: CalculationMethod[]): CalculationMethod[]`
  - `<CalculationMethodBadges methods={...} />`

- [ ] **Step 1: i18n keys**

`src/i18n/en.ts`, inside `pages.reportTemplates`, after `templateTypeList: 'List',`:

```ts
      calculationMethodLabel: 'Calculation Method',
      calculationMethodAll: 'All methods',
      calculationMethodRestricted: 'Restricted only',
      calculationMethodHelp: 'Leave all unchecked if the report works with every costing method.',
      columnCalculationMethod: 'Calculation Method',
```

`src/i18n/th.ts`, same position:

```ts
      calculationMethodLabel: 'วิธีคำนวณต้นทุน',
      calculationMethodAll: 'ทุกวิธี',
      calculationMethodRestricted: 'เฉพาะที่จำกัดวิธี',
      calculationMethodHelp: 'ไม่ต้องเลือกเลย ถ้ารายงานใช้ได้กับทุกวิธีคำนวณต้นทุน',
      columnCalculationMethod: 'วิธีคำนวณต้นทุน',
```

Also change `filtersDescription` to `'Filter report templates by status, type and calculation method'` / `'กรองเทมเพลตรายงานตามสถานะ ประเภท และวิธีคำนวณต้นทุน'`.

- [ ] **Step 2: Helper module**

`src/pages/reportTemplates/calculationMethods.tsx`:

```tsx
import React from 'react';
import { Badge } from '../../components/ui/badge';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';
import type { CalculationMethod } from '../../services/reportTemplateService';

/** ลำดับมาตรฐาน — ใช้เรียงทุกที่ เพื่อให้ JSON.stringify ของ formData เทียบกันได้ */
export const CALCULATION_METHODS: readonly CalculationMethod[] = ['fifo', 'average', 'average_per_location'];

export const CALCULATION_METHOD_KEYS: Record<CalculationMethod, TKey> = {
  fifo: 'common.option.fifo',
  average: 'common.option.average',
  average_per_location: 'common.option.averagePerLocation',
};

/** ค่าในตัวกรอง: method หรือ 'restricted' = เฉพาะ template ที่ติด tag แล้ว */
export type CalculationMethodFilterValue = CalculationMethod | 'restricted';

const FILTER_VALUES: readonly CalculationMethodFilterValue[] = [...CALCULATION_METHODS, 'restricted'];

/** อ่านค่าจาก localStorage — ทิ้งค่าที่ไม่รู้จัก เพราะ enum ผิดตัวเดียวทำ Prisma ตอบ 500 ทั้งหน้า */
export function readCalculationMethodFilter(raw: unknown): CalculationMethodFilterValue[] {
  if (!Array.isArray(raw)) return [];
  return FILTER_VALUES.filter((v) => raw.includes(v));
}

export function sortCalculationMethods(list: CalculationMethod[]): CalculationMethod[] {
  return CALCULATION_METHODS.filter((m) => list.includes(m));
}

/**
 * where ของ Prisma สำหรับตัวกรอง:
 * - เลือก method → ติด tag ที่มี method ใดก็ได้ที่เลือก หรือไม่ได้ติด tag (= ทุก method)
 * - restricted อย่างเดียว → ติด tag แล้ว
 * - ทั้งคู่ → ติด tag และมี method ที่เลือก (hasSome บังคับไม่ว่างอยู่แล้ว)
 */
export function buildCalculationMethodWhere(sel: CalculationMethodFilterValue[]): Record<string, unknown> | null {
  const methods = CALCULATION_METHODS.filter((m) => sel.includes(m));
  const restricted = sel.includes('restricted');
  if (methods.length > 0 && restricted) return { calculation_methods: { hasSome: methods } };
  if (methods.length > 0) {
    return { OR: [{ calculation_methods: { isEmpty: true } }, { calculation_methods: { hasSome: methods } }] };
  }
  if (restricted) return { calculation_methods: { isEmpty: false } };
  return null;
}

export const CalculationMethodBadges: React.FC<{ methods?: CalculationMethod[] | null }> = ({ methods }) => {
  const { t } = useI18n();
  const list = sortCalculationMethods(methods ?? []);
  if (list.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('pages.reportTemplates.calculationMethodAll')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((m) => (
        <Badge key={m} variant="outline">{t(CALCULATION_METHOD_KEYS[m])}</Badge>
      ))}
    </div>
  );
};
```

(If `i18n/types` exports `TKey` from a different path, match the import `ReportTemplateManagement.tsx` uses.)

- [ ] **Step 3: State + `buildAdvance`**

In `ReportTemplateManagement.tsx`:

Import:

```ts
import {
  CALCULATION_METHODS,
  CALCULATION_METHOD_KEYS,
  CalculationMethodBadges,
  buildCalculationMethodWhere,
  readCalculationMethodFilter,
  type CalculationMethodFilterValue,
} from './reportTemplates/calculationMethods';
```

Next to `storedTemplateTypes`:

```ts
  const storedCalcMethods = readCalculationMethodFilter(
    getStoredJSON<unknown>('filters_report_templates_calculation_method', []),
  );
```

Next to `templateTypeFilter` state:

```ts
  const [calcMethodFilter, setCalcMethodFilter] = useState<CalculationMethodFilterValue[]>(storedCalcMethods);
```

Replace `buildAdvance` with a 4-argument version (keep the existing body, add the last block before `where.deleted_at = null;`):

```ts
  const buildAdvance = (
    filters: string[],
    sourceTypes: string[],
    templateTypes: string[],
    calcMethods: CalculationMethodFilterValue[],
  ) => {
    // ...existing is_active / source_type / template_type blocks unchanged...
    const calcWhere = buildCalculationMethodWhere(calcMethods);
    if (calcWhere) Object.assign(where, calcWhere);
    where.deleted_at = null;
    return Object.keys(where).length > 0 ? JSON.stringify({ where }) : '';
  };
```

Update every existing `buildAdvance(...)` call to pass the 4th argument:
- initial `paginate` state: `buildAdvance(storedFilters, storedSourceTypes, storedTemplateTypes, storedCalcMethods)`
- `handleStatusFilter`: `buildAdvance(next, sourceTypeFilter, templateTypeFilter, calcMethodFilter)`
- `handleSourceTypeFilter`: `buildAdvance(statusFilter, next, templateTypeFilter, calcMethodFilter)`
- `handleTemplateTypeFilter`: `buildAdvance(statusFilter, sourceTypeFilter, next, calcMethodFilter)`
- `handleClearAllFilters`: `buildAdvance([], [], [], [])`

Add the handler after `handleTemplateTypeFilter` (copy its exact body shape, including whatever it does on the line between `localStorage.setItem` and `setPaginate`):

```ts
  const handleCalcMethodFilter = (value: CalculationMethodFilterValue) => {
    const next = calcMethodFilter.includes(value)
      ? calcMethodFilter.filter((s) => s !== value)
      : [...calcMethodFilter, value];
    setCalcMethodFilter(next);
    localStorage.setItem('filters_report_templates_calculation_method', JSON.stringify(next));
    // (same line as in handleTemplateTypeFilter here)
    setPaginate(prev => ({ ...prev, page: 1, advance: buildAdvance(statusFilter, sourceTypeFilter, templateTypeFilter, next), filter: {} }));
  };
```

In `handleClearAllFilters`, add:

```ts
    setCalcMethodFilter([]);
    localStorage.setItem('filters_report_templates_calculation_method', JSON.stringify([]));
```

`activeFilterCount` adds `+ (calcMethodFilter.length > 0 ? 1 : 0)`.

A label helper used by the sheet and the active-filter badges:

```ts
  const calcMethodLabel = (v: CalculationMethodFilterValue) =>
    v === 'restricted' ? t('pages.reportTemplates.calculationMethodRestricted') : t(CALCULATION_METHOD_KEYS[v]);
```

- [ ] **Step 4: Filter Sheet group**

After the Template Type group (`templateTypeLabel` block), before the clear-all button:

```tsx
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t('pages.reportTemplates.calculationMethodLabel')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {([...CALCULATION_METHODS, 'restricted'] as const).map((v) => (
                          <Button
                            key={v}
                            variant={calcMethodFilter.includes(v) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleCalcMethodFilter(v)}
                          >
                            {calcMethodLabel(v)}
                          </Button>
                        ))}
                      </div>
                    </div>
```

After the `templateTypeFilter.map(...)` active-filter badges, add the same badge shape:

```tsx
                {calcMethodFilter.map((v) => (
                  <Badge key={`calc-method-${v}`} variant="secondary" className="text-xs gap-1 pr-1">
                    {calcMethodLabel(v)}
                    <button
                      onClick={() => handleCalcMethodFilter(v)}
                      className="ml-0.5 hover:text-foreground"
                      aria-label={t('pages.reportTemplates.removeFilterAria', { label: calcMethodLabel(v) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
```

- [ ] **Step 5: Column + CSV**

In `columns`, after the `report_group` column:

```tsx
    {
      id: 'calculation_methods',
      header: t('pages.reportTemplates.columnCalculationMethod'),
      enableSorting: false,
      cell: ({ row }) => <CalculationMethodBadges methods={row.original.calculation_methods} />,
    },
```

In `handleExport`, add to the row object:

```ts
      calculation_methods_csv: (tpl.calculation_methods ?? []).length
        ? CALCULATION_METHODS.filter((m) => tpl.calculation_methods?.includes(m)).map((m) => t(CALCULATION_METHOD_KEYS[m])).join(', ')
        : t('pages.reportTemplates.calculationMethodAll'),
```

and to the column list after `report_group`:

```ts
      { key: 'calculation_methods_csv', label: t('pages.reportTemplates.columnCalculationMethod') },
```

- [ ] **Step 6: Static checks + existing tests**

```bash
bun run typecheck && bun run lint && bun run test src/pages/ReportTemplateManagement.test.tsx
```

Expected: green. If an existing test asserts the exact `advance` string, update the expectation (existing-test fix, not a new test).

- [ ] **Step 7: Commit**

```bash
git add src/pages/reportTemplates/calculationMethods.tsx src/pages/ReportTemplateManagement.tsx src/i18n/en.ts src/i18n/th.ts
git commit -m "feat(report-templates): filter + column + CSV by calculation method"
```

---

### Task 6: Edit page field + versions diff

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx` (`ReportTemplateFormData` ~L82, `initialFormData` ~L102, load ~L250-275, payload ~L371-393, BU Scope section ~L818-853)
- Modify: `src/pages/reportTemplates/ReportTemplateVersionsSheet.tsx` (`SCALAR_FIELDS` ~L40, diff filter ~L247)

**Interfaces:**
- Consumes: `CALCULATION_METHODS`, `CALCULATION_METHOD_KEYS`, `CalculationMethodBadges`, `sortCalculationMethods` (Task 5); `CalculationMethod` (Task 4).

- [ ] **Step 1: Form state**

Import:

```ts
import reportTemplateService, { type ReportTemplate, type CalculationMethod } from '../services/reportTemplateService';
import { CALCULATION_METHODS, CALCULATION_METHOD_KEYS, CalculationMethodBadges, sortCalculationMethods } from './reportTemplates/calculationMethods';
```

(merge the first into the existing `reportTemplateService` import line.)

`ReportTemplateFormData`, after `deny_business_unit: string;`:

```ts
  calculation_methods: CalculationMethod[];
```

`initialFormData`, after `deny_business_unit: '',`:

```ts
  calculation_methods: [],
```

Load (`loaded` object), after the `deny_business_unit` line:

```ts
        calculation_methods: sortCalculationMethods(
          Array.isArray(template.calculation_methods) ? template.calculation_methods : [],
        ),
```

- [ ] **Step 2: Toggle handler (canonical order)**

Next to `handleChipChange`:

```ts
  // เรียงตาม CALCULATION_METHODS เสมอ — ติ๊กออกแล้วติ๊กกลับต้องได้ array เดิม ไม่งั้น hasChanges ค้างเป็น true
  const toggleCalculationMethod = (method: CalculationMethod) => {
    setFormData((prev) => {
      const set = new Set(prev.calculation_methods);
      if (set.has(method)) set.delete(method);
      else set.add(method);
      return { ...prev, calculation_methods: CALCULATION_METHODS.filter((m) => set.has(m)) };
    });
  };
```

- [ ] **Step 3: Payload (forms save `[]`)**

In `payload`, after `deny_business_unit: isForm ? '' : formData.deny_business_unit,`:

```ts
      // form = เอกสารพิมพ์ ไม่ขึ้นกับวิธีคิดต้นทุน — ล้างเหมือน allow/deny
      calculation_methods: isForm ? [] : formData.calculation_methods,
```

- [ ] **Step 4: Field in the BU Scope section**

Inside the BU Scope `<section>`, after the `deny_business_unit` `div.space-y-2`, still inside the non-loading fragment:

```tsx
                      {!isForm && (
                        <div className="space-y-2">
                          <Label>{t('pages.reportTemplates.calculationMethodLabel')}</Label>
                          {editing ? (
                            <>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {CALCULATION_METHODS.map((m) => (
                                  <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                      type="checkbox"
                                      id={`calculation_method_${m}`}
                                      checked={formData.calculation_methods.includes(m)}
                                      onChange={() => toggleCalculationMethod(m)}
                                      className="h-4 w-4 rounded border-input"
                                    />
                                    {t(CALCULATION_METHOD_KEYS[m])}
                                  </label>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">{t('pages.reportTemplates.calculationMethodHelp')}</p>
                            </>
                          ) : (
                            <CalculationMethodBadges methods={formData.calculation_methods} />
                          )}
                        </div>
                      )}
```

- [ ] **Step 5: Versions diff**

`ReportTemplateVersionsSheet.tsx`, append to `SCALAR_FIELDS` after `deny_business_unit`:

```ts
  // snapshot ก่อนมีฟิลด์นี้ = undefined — restore คงค่าปัจจุบัน จึงไม่นับเป็นความต่าง (ดู filter ด้านล่าง)
  { key: 'calculation_methods', read: (s) => (s.calculation_methods === undefined ? undefined : [...s.calculation_methods].sort().join(', ')) },
```

In the `changes` filter:

```ts
        (c) => fmt(c.from) !== fmt(c.to) && !(c.key === 'calculation_methods' && c.from === undefined),
```

- [ ] **Step 6: Static checks + existing tests**

```bash
bun run typecheck && bun run lint && bun run test src/pages/ReportTemplateEdit.test.tsx src/pages/reportTemplates
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx src/pages/reportTemplates/ReportTemplateVersionsSheet.tsx
git commit -m "feat(report-templates): edit calculation methods on the template"
```

---

### Task 7: Manual verification (after backend is on DEV)

No code. Run against DEV (`bun run dev:dev`, port 3304) once the backend PR is merged and deployed — or against a local backend on the branch.

- [ ] **Step 1: Backend contract via curl** (token from a logged-in session)

```bash
B=https://dev.blueledgers.com:4001
ADV_FIFO='{"where":{"OR":[{"calculation_methods":{"isEmpty":true}},{"calculation_methods":{"hasSome":["fifo"]}}],"deleted_at":null}}'
curl -sk "$B/api-system/report-templates?perpage=5&advance=$(jq -rn --arg a "$ADV_FIFO" '$a|@uri')" -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.paginate.total, [.data[].calculation_methods]'
```

Expected: 200, every row has an array (`[]` before tagging). Repeat with `{"calculation_methods":{"isEmpty":false}}` → total 0 before tagging. Confirm the list path matches `reportTemplateService.getAll`.

- [ ] **Step 2: Browser — `/report-templates`**

1. Open a list template → Edit → tick **Average** + **Average per location** → Save → toast, read mode shows two badges.
2. Untick and re-tick one box → bottom bar shows no unsaved changes (Review Focus 4).
3. List: column shows the two badges; others show "All methods".
4. Filter **FIFO** → that template disappears, untagged ones remain. Filter **Restricted only** → only it. **FIFO + Restricted only** → empty.
5. Reload → filters restored from localStorage. Clear all → reset.
6. Set `localStorage.filters_report_templates_calculation_method = '["avg"]'` in devtools, reload → no error, no filter (Review Focus 1).
7. Export CSV → column present.
8. Versions sheet → a pre-feature version shows no `calculation_methods` diff (Review Focus 2); a post-tag version restore round-trips.
9. Form template Edit → field not shown (Review Focus 3).
10. Backup one tagged template → JSON has `calculation_methods` (Review Focus 5).
11. 390px width → list card view still readable.

- [ ] **Step 3: Push FE + PR** (only after backend is on DEV)

```bash
git push -u origin feature/report-template-calculation-method
gh pr create --base main --title "feat(report-templates): filter + tag by calculation method (phase A)" --body "Needs backend PR (calculation_methods column) deployed first — list page 500s otherwise."
```
