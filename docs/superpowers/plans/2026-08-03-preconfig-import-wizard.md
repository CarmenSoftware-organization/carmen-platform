# Preconfig Import Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This project skips TDD steps by standing user preference.** Do not write `*.spec.ts` /
> `*.test.ts(x)` files unless a task explicitly asks for one (three tasks do — they are
> boot/regression guards, not TDD). Static checks are **not** optional: every task ends with
> type-check/lint and a commit. Manual verification steps are also **not** optional.

**Goal:** Ship a `/tenant-imports` page in carmen-platform that loads `Preconfig.xlsx` master
data into a selected business unit's tenant database through a new authenticated
micro-business endpoint, with preview, duplicate handling, NDJSON progress, and an audit row.

**Architecture:** carmen-platform (SPA) sends multipart requests to
`/api-system/tenant/preconfig-imports/:bu_id/*` on backend-gateway; the gateway enforces
`data_import.manage` and proxies to micro-business over the existing `BUSINESS_SERVICE` RPC
client; micro-business parses the workbook with `exceljs`, owns the 12-step mapping catalog,
and writes through a short-lived tenant `PrismaClient` resolved from the BU's `db_connection`.

**Tech Stack:** NestJS 10 (backend-gateway, micro-business), Prisma 6 + `@prisma/adapter-pg`,
`exceljs@^4.4.0`, RxJS Observables for NDJSON, React 19 + Vite 8 + shadcn/ui + TanStack Table.

## Global Constraints

- Two repos. Backend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` (`BE`). Frontend: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` (`FE`).
- Branch in both repos: `feature/preconfig-import-wizard`. Never commit to `main`, `develop`, `DEV`, or `UAT`.
- The authoritative spec is `FE/docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`. Column mappings, event shapes, and API payloads must match it exactly.
- No new npm dependencies in either repo. `exceljs` already exists in micro-business; the frontend adds nothing.
- Never use `TRUNCATE`, `DELETE FROM`, or `CASCADE` against tenant tables. "Clear" is always `UPDATE … SET deleted_at = now()`.
- Never build SQL by string concatenation from spreadsheet values. All writes go through Prisma model APIs with bound values.
- Backend code comments and JSDoc follow the repo's bilingual convention (`English / ภาษาไทย`) as seen in `BE/apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts`.
- Frontend rules from `FE/CLAUDE.md` apply verbatim: `toast.*` not `alert()`, `<ConfirmDialog>` not `window.confirm()`, `parseApiError(err)` in every catch, debug UI wrapped in `process.env.NODE_ENV === 'development'`, no edits to `src/components/ui/` primitives beyond the two explicitly-scoped moves in Task 9.
- Type-check commands: BE `bun run check-types --filter=micro-business --filter=backend-gateway` (fall back to `npx tsc -p apps/<app>/tsconfig.json --noEmit` if the turbo filter is unavailable). FE `npx tsc --noEmit`.
- Frontend test suite must stay green: `bun run test` in `FE`.

---

# Phase 1 — Walking skeleton (steps `currency`, `unit`, `tax-profile` only)

### Task 1: Platform permission `data_import.manage`

**Files:**
- Modify: `BE/packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`
- Modify: `BE/packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts`

**Interfaces:**
- Consumes: nothing
- Produces: permission key `data_import.manage`, used by `@RequirePlatformPermission` in Task 6 and by `requiredPermission` in Task 12

- [ ] **Step 1: Add the permission row**

In `seed.platform-permission.data.ts`, immediately after the two `sql_workbench` entries
(currently lines 46–47), add:

```ts
  { resource: "data_import", action: "manage", description: "Upload a Preconfig workbook and import tenant master data into a business unit's database" },
```

- [ ] **Step 2: Grant it to platform_admin**

In `seed.platform-role-permission.data.ts`, inside `ROLE_PERMISSIONS.platform_admin`, add
`"data_import.*"` to the list (keep the existing entries; `cluster_admin` already has `["*"]`
so it needs no change):

```ts
  platform_admin: [
    "cluster.*", "user.*", "user_platform.*", "report_template.*",
    "application.*", "news.*", "broadcast.*", "role.*", "sql_workbench.*",
    "email_setting.*", "data_import.*",
  ],
```

- [ ] **Step 3: Verify the drift checkers still parse the data files**

Run: `cd BE && npx tsc -p packages/prisma-shared-schema-platform/tsconfig.json --noEmit`
Expected: no errors. (These are plain data files; a type error here means a typo in the object shape.)

- [ ] **Step 4: Commit**

```bash
cd BE && git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(rbac): add data_import.manage platform permission"
```

---

### Task 2: Mapping catalog and shared types (micro-business)

**Files:**
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-types.ts`
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-catalog.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PreconfigStep`, `ColumnMap`, `DuplicateMode`, `ImportOptions`, `StepMetadata`, `CheckReport`, `PreviewResult`, `ImportProgressEvent`, `ImportSummary`, `PRECONFIG_STEPS`, `getStep(id)`, `toStepMetadata(step)`

- [ ] **Step 1: Write the type module**

Create `preconfig-types.ts`:

```ts
/** Value coercion applied to a spreadsheet cell before it reaches Prisma. */
export type ColumnKind = 'string' | 'number' | 'decimal' | 'boolean' | 'timestamp_now';

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

/** How to treat a row whose duplicate key already exists in the target table. */
export type DuplicateMode = 'skip' | 'upsert' | 'error';

/** Target database for a step. */
export type StepTarget = 'tenant' | 'platform';

/** A single wizard step: one sheet -> one table. */
export interface PreconfigStep {
  id: string;
  sheetName: string;
  tableName: string;
  displayName: string;
  description: string;
  target: StepTarget;
  columns: ColumnMap[];
  duplicateKey: string[];
  defaultDuplicateMode: DuplicateMode;
  supportsClear: boolean;
}

/** Step shape returned to the frontend by GET /steps. */
export interface StepMetadata {
  id: string;
  sheet_name: string;
  table_name: string;
  display_name: string;
  description: string;
  target: StepTarget;
  required_columns: string[];
  optional_columns: string[];
  duplicate_key: string[];
  default_duplicate_mode: DuplicateMode;
  supports_clear: boolean;
  creates_lookups: string[];
}

/** Per-step outcome of POST /check. */
export interface CheckStepReport {
  step_id: string;
  sheet_present: boolean;
  row_count: number;
  missing_required_columns: string[];
  missing_optional_columns: string[];
  status: 'ready' | 'sheet_missing' | 'columns_missing';
}

/** Whole-file outcome of POST /check. */
export interface CheckReport {
  file_name: string;
  sheets_found: string[];
  steps: CheckStepReport[];
}

/** Options accepted by preview and import. */
export interface ImportOptions {
  duplicate_mode?: DuplicateMode;
  clear_existing?: boolean;
  accept_lookup_creation?: boolean;
}

/** One row's verdict in a preview. */
export interface PreviewRow {
  row_number: number;
  verdict: 'new' | 'duplicate' | 'error';
  values: Record<string, unknown>;
  errors: Array<{ column: string; message: string }>;
}

/** Lookup values that do not exist yet and would be created. */
export interface LookupCreation {
  table: string;
  column: string;
  values: string[];
}

/** Result of POST /:step_id/preview. */
export interface PreviewResult {
  step_id: string;
  total_rows: number;
  counts: { new: number; duplicate: number; error: number };
  clear_will_soft_delete: number;
  lookups_to_create: LookupCreation[];
  rows: PreviewRow[];
  rows_truncated: boolean;
}

/** Final tally of an import run. */
export interface ImportSummary {
  step_id: string;
  bu_id: string;
  bu_code: string;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  lookups_created: number;
  errors: Array<{ row_number: number; message: string }>;
}

/** NDJSON events streamed while a step runs. */
export type ImportProgressEvent =
  | { type: 'start'; step_id: string; bu_code: string; total: number }
  | { type: 'cleared'; step_id: string; soft_deleted: number }
  | {
      type: 'progress';
      step_id: string;
      index: number;
      total: number;
      inserted: number;
      updated: number;
      skipped: number;
      failed: number;
    }
  | { type: 'done'; success: boolean; summary: ImportSummary }
  | { type: 'error'; message: string };

/** Preview rows returned to the client are capped to keep payloads small. */
export const PREVIEW_ROW_CAP = 200;

/** Rows written per transaction. */
export const IMPORT_BATCH_SIZE = 200;
```

- [ ] **Step 2: Write the Phase 1 catalog**

Create `preconfig-catalog.ts` with the three lookup-free steps (mappings copied from spec §8.1):

```ts
import type { PreconfigStep, StepMetadata } from './preconfig-types';

/**
 * The fixed Preconfig.xlsx step catalog. Owned by the backend so the client can never
 * choose which table or column an import writes to.
 * แคตตาล็อกขั้นตอนของ Preconfig.xlsx ที่ฝั่งเซิร์ฟเวอร์เป็นเจ้าของ
 */
export const PRECONFIG_STEPS: PreconfigStep[] = [
  {
    id: 'currency',
    sheetName: 'Currency',
    tableName: 'tb_currency',
    displayName: 'Currencies',
    description: 'Currency definitions (THB, USD, …)',
    target: 'tenant',
    columns: [
      { excel: 'Code', column: 'code', kind: 'string', required: true, maxLength: 3 },
      { excel: 'Name', column: 'name', kind: 'string', required: true, maxLength: 100 },
      { excel: 'Symbol', column: 'symbol', kind: 'string', maxLength: 5 },
      { excel: 'Exchange Rate', column: 'exchange_rate', kind: 'decimal', defaultValue: 1 },
      { excel: null, column: 'exchange_rate_at', kind: 'timestamp_now' },
    ],
    duplicateKey: ['code'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'unit',
    sheetName: 'Unit',
    tableName: 'tb_unit',
    displayName: 'Units',
    description: 'Unit of measurement (BAG, BOX, KG, …)',
    target: 'tenant',
    columns: [
      { excel: 'Code', column: 'name', kind: 'string', required: true },
      { excel: 'Description', column: 'description', kind: 'string' },
    ],
    duplicateKey: ['name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'tax-profile',
    sheetName: 'Tax Profile',
    tableName: 'tb_tax_profile',
    displayName: 'Tax Profiles',
    description: 'Tax configurations (None, Vat 7%, …)',
    target: 'tenant',
    columns: [
      { excel: 'Name', column: 'name', kind: 'string', required: true },
      { excel: 'Value', column: 'tax_rate', kind: 'decimal', defaultValue: 0 },
    ],
    duplicateKey: ['name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
];

/**
 * Find a step by id.
 * @param id - Step identifier / ตัวระบุขั้นตอน
 * @returns The step, or undefined / ขั้นตอนที่พบ หรือ undefined
 */
export function getStep(id: string): PreconfigStep | undefined {
  return PRECONFIG_STEPS.find((s) => s.id === id);
}

/**
 * Project a step into the client-facing metadata shape.
 * @param step - Catalog step / ขั้นตอนในแคตตาล็อก
 * @returns Metadata for the wizard UI / ข้อมูลเมตาสำหรับ UI
 */
export function toStepMetadata(step: PreconfigStep): StepMetadata {
  const sheetColumns = step.columns.filter((c) => c.excel !== null);
  return {
    id: step.id,
    sheet_name: step.sheetName,
    table_name: step.tableName,
    display_name: step.displayName,
    description: step.description,
    target: step.target,
    required_columns: sheetColumns.filter((c) => c.required).map((c) => c.excel as string),
    optional_columns: sheetColumns.filter((c) => !c.required).map((c) => c.excel as string),
    duplicate_key: step.duplicateKey,
    default_duplicate_mode: step.defaultDuplicateMode,
    supports_clear: step.supportsClear,
    creates_lookups: [],
  };
}
```

- [ ] **Step 3: Type-check**

Run: `cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd BE && git add apps/micro-business/src/preconfig-import/
git commit -m "feat(preconfig-import): add step catalog and shared types"
```

---

### Task 3: Workbook parser and row coercion

**Files:**
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-workbook.ts`

**Interfaces:**
- Consumes: `PreconfigStep`, `ColumnMap`, `CheckReport` from Task 2
- Produces: `parseWorkbook(buffer)`, `SheetTable`, `buildCheckReport(sheets, fileName, steps)`, `coerceRow(step, headers, row, rowNumber)` returning `{ values, errors }`

- [ ] **Step 1: Write the parser**

```ts
import { Workbook } from 'exceljs';
import type {
  CheckReport,
  CheckStepReport,
  ColumnMap,
  PreconfigStep,
} from './preconfig-types';

/** One worksheet reduced to a header row plus raw string cells. */
export interface SheetTable {
  name: string;
  headers: string[];
  rows: string[][];
}

/**
 * Normalize a header or lookup value for comparison (trim + collapse inner runs of
 * whitespace + lowercase). Sheet headers in the wild contain double spaces.
 * ปรับข้อความให้เทียบกันได้ (ตัดช่องว่าง + ตัวพิมพ์เล็ก)
 * @param v - Raw text / ข้อความดิบ
 * @returns Normalized text / ข้อความที่ปรับแล้ว
 */
export function normalizeKey(v: string): string {
  return v.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Read every worksheet of an .xlsx buffer into header+rows tables.
 * @param buffer - Uploaded workbook bytes / ไบต์ของไฟล์ที่อัปโหลด
 * @returns One SheetTable per worksheet / ตารางต่อหนึ่งเวิร์กชีต
 */
export async function parseWorkbook(buffer: Buffer): Promise<SheetTable[]> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const tables: SheetTable[] = [];
  wb.eachSheet((ws) => {
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cellText(cell.value);
    });
    const rows: string[][] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: string[] = [];
      for (let c = 1; c <= headers.length; c++) {
        values[c - 1] = cellText(row.getCell(c).value);
      }
      if (values.some((v) => v !== '')) rows.push(values);
    }
    tables.push({ name: ws.name, headers, rows });
  });
  return tables;
}

/**
 * Render an ExcelJS cell value as trimmed text (formulas resolve to their cached result).
 * @param value - ExcelJS cell value / ค่าจากเซลล์
 * @returns Trimmed text / ข้อความที่ตัดช่องว่างแล้ว
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v.text !== undefined) return String(v.text).trim();
    return '';
  }
  return String(value).trim();
}

/**
 * Compare the uploaded workbook against the step catalog.
 * @param sheets - Parsed sheets / ชีตที่แปลงแล้ว
 * @param fileName - Original file name / ชื่อไฟล์ต้นฉบับ
 * @param steps - Catalog steps / ขั้นตอนในแคตตาล็อก
 * @returns The file-check report / รายงานตรวจไฟล์
 */
export function buildCheckReport(
  sheets: SheetTable[],
  fileName: string,
  steps: PreconfigStep[],
): CheckReport {
  const bySheet = new Map(sheets.map((s) => [normalizeKey(s.name), s]));
  const reports: CheckStepReport[] = steps.map((step) => {
    const sheet = bySheet.get(normalizeKey(step.sheetName));
    if (!sheet) {
      return {
        step_id: step.id,
        sheet_present: false,
        row_count: 0,
        missing_required_columns: [],
        missing_optional_columns: [],
        status: 'sheet_missing',
      };
    }
    const present = new Set(sheet.headers.map(normalizeKey));
    const sheetColumns = step.columns.filter((c) => c.excel !== null);
    const missingRequired = sheetColumns
      .filter((c) => c.required && !present.has(normalizeKey(c.excel as string)))
      .map((c) => c.excel as string);
    const missingOptional = sheetColumns
      .filter((c) => !c.required && !present.has(normalizeKey(c.excel as string)))
      .map((c) => c.excel as string);
    return {
      step_id: step.id,
      sheet_present: true,
      row_count: sheet.rows.length,
      missing_required_columns: missingRequired,
      missing_optional_columns: missingOptional,
      status: missingRequired.length > 0 ? 'columns_missing' : 'ready',
    };
  });
  return { file_name: fileName, sheets_found: sheets.map((s) => s.name), steps: reports };
}

/**
 * Locate a sheet for a step (case/whitespace-insensitive).
 * @param sheets - Parsed sheets / ชีตที่แปลงแล้ว
 * @param step - Catalog step / ขั้นตอน
 * @returns The matching sheet, or undefined / ชีตที่ตรงกัน
 */
export function findSheet(sheets: SheetTable[], step: PreconfigStep): SheetTable | undefined {
  return sheets.find((s) => normalizeKey(s.name) === normalizeKey(step.sheetName));
}

/** Coerced row plus any per-column validation errors. */
export interface CoercedRow {
  values: Record<string, unknown>;
  errors: Array<{ column: string; message: string }>;
}

/**
 * Map + coerce one spreadsheet row into database column values.
 * @param step - Catalog step / ขั้นตอน
 * @param headers - Sheet header row / แถวหัวตาราง
 * @param row - Sheet data row / แถวข้อมูล
 * @returns Coerced values and errors / ค่าที่แปลงแล้วและข้อผิดพลาด
 */
export function coerceRow(step: PreconfigStep, headers: string[], row: string[]): CoercedRow {
  const index = new Map(headers.map((h, i) => [normalizeKey(h), i]));
  const values: Record<string, unknown> = {};
  const errors: Array<{ column: string; message: string }> = [];

  for (const col of step.columns) {
    const raw = col.excel === null ? '' : (row[index.get(normalizeKey(col.excel)) ?? -1] ?? '');
    const result = coerceValue(col, raw);
    if (result.error) {
      errors.push({ column: col.excel ?? col.column, message: result.error });
      continue;
    }
    if (result.value !== undefined) values[col.column] = result.value;
  }
  return { values, errors };
}

/**
 * Coerce a single cell according to its column mapping.
 * @param col - Column mapping / การจับคู่คอลัมน์
 * @param raw - Raw cell text / ข้อความในเซลล์
 * @returns Coerced value or an error message / ค่าที่แปลงแล้วหรือข้อความผิดพลาด
 */
function coerceValue(col: ColumnMap, raw: string): { value?: unknown; error?: string } {
  if (col.kind === 'timestamp_now') return { value: new Date() };

  const text = raw.trim();
  if (text === '') {
    if (col.required) return { error: 'Required value is empty' };
    if (col.defaultValue !== undefined) return { value: col.defaultValue };
    return {};
  }
  if (col.maxLength && text.length > col.maxLength) {
    return { error: `Value exceeds ${col.maxLength} characters` };
  }
  switch (col.kind) {
    case 'string':
      return { value: text };
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { error: `"${text}" is not a number` };
      return { value: Math.trunc(n) };
    }
    case 'decimal': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { error: `"${text}" is not a number` };
      return { value: n };
    }
    case 'boolean': {
      const v = text.toLowerCase();
      if (['true', '1', 'yes', 'y', 'active'].includes(v)) return { value: true };
      if (['false', '0', 'no', 'n', 'inactive'].includes(v)) return { value: false };
      return { error: `"${text}" is not a boolean` };
    }
    default:
      return { value: text };
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd BE && git add apps/micro-business/src/preconfig-import/preconfig-workbook.ts
git commit -m "feat(preconfig-import): parse workbooks and coerce rows"
```

---

### Task 4: Import service (check / preview / import stream)

**Files:**
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-import.service.ts`

**Interfaces:**
- Consumes: `TenantService` (`BE/apps/micro-business/src/tenant/tenant.service.ts`), `Result`/`ErrorCode` from `@/common`, everything from Tasks 2–3
- Produces: `PreconfigImportService.getSteps()`, `.check(file, fileName)`, `.preview(bu_id, step_id, file, options)`, `.importStream(bu_id, step_id, file, options, actor_id)`

Model the connection resolution, the short-lived client, and the Observable exactly on
`BE/apps/micro-business/src/authen/tenant_seed/tenant_seed.service.ts` — read that file first.

- [ ] **Step 1: Write the service**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@repo/prisma-shared-schema-tenant';
import { PrismaClient_SYSTEM as PrismaSystem } from '@repo/prisma-shared-schema-platform';
import { BackendLogger } from '@/common/helpers/backend.logger';
import { Result, ErrorCode } from '@/common';
import { TenantService } from '@/tenant/tenant.service';
import { PRECONFIG_STEPS, getStep, toStepMetadata } from './preconfig-catalog';
import {
  IMPORT_BATCH_SIZE,
  PREVIEW_ROW_CAP,
  type CheckReport,
  type ImportOptions,
  type ImportProgressEvent,
  type ImportSummary,
  type PreconfigStep,
  type PreviewResult,
  type PreviewRow,
  type StepMetadata,
} from './preconfig-types';
import { buildCheckReport, coerceRow, findSheet, normalizeKey, parseWorkbook, type SheetTable } from './preconfig-workbook';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal shape of the tenant client used here (delegates are addressed dynamically). */
type TenantDb = PrismaClient & Record<string, any>;

interface ResolvedConnection {
  bu_id: string;
  bu_code: string;
  database_url: string;
}

/**
 * Imports Preconfig.xlsx master data into a business unit's tenant database.
 * นำเข้าข้อมูลตั้งต้นจาก Preconfig.xlsx เข้าสู่ฐานข้อมูลผู้เช่าของหน่วยธุรกิจ
 */
@Injectable()
export class PreconfigImportService {
  private readonly logger = new BackendLogger(PreconfigImportService.name);

  constructor(
    @Inject('PRISMA_SYSTEM') private readonly prismaSystem: typeof PrismaSystem,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * List the step catalog as client metadata.
   * @returns Step metadata array / อาร์เรย์ข้อมูลเมตาของขั้นตอน
   */
  getSteps(): StepMetadata[] {
    return PRECONFIG_STEPS.map(toStepMetadata);
  }

  /**
   * Compare an uploaded workbook against the catalog.
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param fileName - Original file name / ชื่อไฟล์
   * @returns Result wrapping the check report / Result ที่ห่อรายงานตรวจไฟล์
   */
  async check(file: Buffer, fileName: string): Promise<Result<CheckReport>> {
    const sheets = await parseWorkbook(file);
    return Result.ok(buildCheckReport(sheets, fileName, PRECONFIG_STEPS));
  }

  /**
   * Resolve the tenant connection for a BU (mirrors TenantSeedService.resolveConnection).
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @returns Result wrapping the resolved connection / Result ที่ห่อการเชื่อมต่อ
   */
  private async resolveConnection(bu_id: string): Promise<Result<ResolvedConnection>> {
    if (!UUID_RE.test(bu_id)) {
      return Result.error('Invalid bu_id format', ErrorCode.INVALID_ARGUMENT);
    }
    const bu = await this.prismaSystem.tb_business_unit.findFirst({
      where: { id: bu_id, deleted_at: null },
      select: { id: true, code: true, db_connection: true },
    });
    if (!bu) return Result.error(`Business unit not found: ${bu_id}`, ErrorCode.NOT_FOUND);
    if (!bu.db_connection) {
      return Result.error(
        `Business unit ${bu.code} has no database connection configured`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }
    const databaseUrl = this.tenantService.getConnectionString(
      bu.db_connection as unknown as Parameters<TenantService['getConnectionString']>[0],
    );
    if (!databaseUrl) {
      return Result.error(
        `Business unit ${bu.code} has an unsupported database provider`,
        ErrorCode.VALIDATION_FAILURE,
      );
    }
    return Result.ok({ bu_id: bu.id, bu_code: bu.code, database_url: databaseUrl });
  }

  /**
   * Build a plain, short-lived tenant client. Overridable seam for tests; caller MUST disconnect.
   * @param database_url - Tenant connection string / สตริงการเชื่อมต่อผู้เช่า
   * @returns A tenant Prisma client / Prisma client ของผู้เช่า
   */
  protected createTenantClient(database_url: string): TenantDb {
    const schema = new URL(database_url).searchParams.get('schema') ?? undefined;
    const adapter = new PrismaPg({ connectionString: database_url }, schema ? { schema } : undefined);
    return new PrismaClient({ adapter }) as TenantDb;
  }

  /**
   * Disconnect a tenant client, swallowing teardown errors.
   * @param db - Tenant client / ไคลเอนต์ผู้เช่า
   */
  private async disconnect(db: TenantDb): Promise<void> {
    try {
      await db.$disconnect();
    } catch (err) {
      this.logger.debug({ function: 'disconnect', err: String(err) }, PreconfigImportService.name);
    }
  }

  /**
   * Composite duplicate key for a row.
   * @param step - Catalog step / ขั้นตอน
   * @param values - Coerced row values / ค่าของแถว
   * @returns Normalized key string / คีย์ที่ปรับรูปแล้ว
   */
  private keyOf(step: PreconfigStep, values: Record<string, unknown>): string {
    return step.duplicateKey.map((c) => normalizeKey(String(values[c] ?? ''))).join(' ');
  }

  /**
   * Load existing active rows of the target table, indexed by duplicate key.
   * @param db - Tenant client / ไคลเอนต์ผู้เช่า
   * @param step - Catalog step / ขั้นตอน
   * @returns Map of duplicate key -> row id / แมปคีย์ซ้ำไปยัง id
   */
  private async loadExisting(db: TenantDb, step: PreconfigStep): Promise<Map<string, string>> {
    const select: Record<string, boolean> = { id: true };
    for (const c of step.duplicateKey) select[c] = true;
    const rows: Array<Record<string, unknown>> = await db[step.tableName].findMany({
      where: { deleted_at: null },
      select,
    });
    const map = new Map<string, string>();
    for (const r of rows) {
      const key = step.duplicateKey.map((c) => normalizeKey(String(r[c] ?? ''))).join(' ');
      if (!map.has(key)) map.set(key, String(r.id));
    }
    return map;
  }

  /**
   * Dry-run a step: coerce, classify, and count without writing.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param options - Import options / ตัวเลือกการนำเข้า
   * @returns Result wrapping the preview / Result ที่ห่อผลตัวอย่าง
   */
  async preview(
    bu_id: string,
    step_id: string,
    file: Buffer,
    options: ImportOptions = {},
  ): Promise<Result<PreviewResult>> {
    const step = getStep(step_id);
    if (!step) return Result.error(`Unknown step: ${step_id}`, ErrorCode.NOT_FOUND);

    const conn = await this.resolveConnection(bu_id);
    if (conn.isError()) return conn as unknown as Result<PreviewResult>;

    const sheets = await parseWorkbook(file);
    const sheet = findSheet(sheets, step);
    if (!sheet) {
      return Result.error(`Sheet "${step.sheetName}" not found in workbook`, ErrorCode.VALIDATION_FAILURE);
    }

    const db = this.createTenantClient(conn.value.database_url);
    try {
      const existing = await this.loadExisting(db, step);
      const seen = new Set<string>();
      const rows: PreviewRow[] = [];
      const counts = { new: 0, duplicate: 0, error: 0 };

      sheet.rows.forEach((raw, i) => {
        const { values, errors } = coerceRow(step, sheet.headers, raw);
        const key = this.keyOf(step, values);
        let verdict: PreviewRow['verdict'];
        if (errors.length > 0) verdict = 'error';
        else if (existing.has(key) || seen.has(key)) verdict = 'duplicate';
        else verdict = 'new';
        if (verdict === 'new') seen.add(key);
        counts[verdict] += 1;
        if (rows.length < PREVIEW_ROW_CAP) {
          rows.push({ row_number: i + 2, verdict, values, errors });
        }
      });

      const clearCount = options.clear_existing
        ? await db[step.tableName].count({ where: { deleted_at: null } })
        : 0;

      return Result.ok({
        step_id: step.id,
        total_rows: sheet.rows.length,
        counts,
        clear_will_soft_delete: clearCount,
        lookups_to_create: [],
        rows,
        rows_truncated: sheet.rows.length > PREVIEW_ROW_CAP,
      });
    } finally {
      await this.disconnect(db);
    }
  }

  /**
   * Run a step and stream progress events.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param options - Import options / ตัวเลือกการนำเข้า
   * @param actor_id - Platform user id of the caller / id ผู้ใช้ที่เรียก
   * @param file_name - Original file name (audit) / ชื่อไฟล์ (สำหรับ audit)
   * @returns Observable of progress events / Observable ของเหตุการณ์ความคืบหน้า
   */
  importStream(
    bu_id: string,
    step_id: string,
    file: Buffer,
    options: ImportOptions,
    actor_id: string | null,
    file_name: string,
  ): Observable<ImportProgressEvent> {
    return new Observable<ImportProgressEvent>((subscriber) => {
      let cancelled = false;
      const run = async () => {
        const step = getStep(step_id);
        if (!step) {
          subscriber.error(new Error(`Unknown step: ${step_id}`));
          return;
        }
        const conn = await this.resolveConnection(bu_id);
        if (conn.isError()) {
          subscriber.error(new Error(conn.error.message || 'cannot resolve connection'));
          return;
        }
        const sheets = await parseWorkbook(file);
        const sheet = findSheet(sheets, step);
        if (!sheet) {
          subscriber.error(new Error(`Sheet "${step.sheetName}" not found in workbook`));
          return;
        }

        const { bu_id: id, bu_code, database_url } = conn.value;
        const db = this.createTenantClient(database_url);
        const mode = options.duplicate_mode ?? step.defaultDuplicateMode;
        const summary: ImportSummary = {
          step_id: step.id,
          bu_id: id,
          bu_code,
          total: sheet.rows.length,
          inserted: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          lookups_created: 0,
          errors: [],
        };

        try {
          subscriber.next({ type: 'start', step_id: step.id, bu_code, total: sheet.rows.length });

          if (options.clear_existing && step.supportsClear) {
            const cleared = await db[step.tableName].updateMany({
              where: { deleted_at: null },
              data: { deleted_at: new Date(), deleted_by_id: actor_id ?? undefined },
            });
            subscriber.next({ type: 'cleared', step_id: step.id, soft_deleted: cleared.count });
          }

          const existing = await this.loadExisting(db, step);
          const seen = new Set<string>();

          for (let start = 0; start < sheet.rows.length; start += IMPORT_BATCH_SIZE) {
            if (cancelled) return;
            const batch = sheet.rows.slice(start, start + IMPORT_BATCH_SIZE);
            await db.$transaction(async (tx: TenantDb) => {
              for (let i = 0; i < batch.length; i++) {
                const rowNumber = start + i + 2;
                const { values, errors } = coerceRow(step, sheet.headers, batch[i]);
                if (errors.length > 0) {
                  summary.failed += 1;
                  summary.errors.push({ row_number: rowNumber, message: errors.map((e) => `${e.column}: ${e.message}`).join('; ') });
                  continue;
                }
                const key = this.keyOf(step, values);
                const existingId = existing.get(key);
                const duplicate = existingId !== undefined || seen.has(key);

                if (duplicate && mode === 'skip') {
                  summary.skipped += 1;
                  continue;
                }
                if (duplicate && mode === 'error') {
                  summary.failed += 1;
                  summary.errors.push({ row_number: rowNumber, message: `Duplicate ${step.duplicateKey.join('+')}` });
                  continue;
                }
                if (duplicate && mode === 'upsert' && existingId) {
                  await tx[step.tableName].update({
                    where: { id: existingId },
                    data: { ...values, updated_at: new Date(), updated_by_id: actor_id ?? undefined },
                  });
                  summary.updated += 1;
                  continue;
                }
                const created = await tx[step.tableName].create({
                  data: { ...values, created_by_id: actor_id ?? undefined, updated_by_id: actor_id ?? undefined },
                  select: { id: true },
                });
                existing.set(key, String(created.id));
                seen.add(key);
                summary.inserted += 1;
              }
            });

            subscriber.next({
              type: 'progress',
              step_id: step.id,
              index: Math.min(start + IMPORT_BATCH_SIZE, sheet.rows.length),
              total: sheet.rows.length,
              inserted: summary.inserted,
              updated: summary.updated,
              skipped: summary.skipped,
              failed: summary.failed,
            });
          }

          await this.writeActivity(db, step, actor_id, file_name, options, summary);
          subscriber.next({ type: 'done', success: summary.failed === 0, summary });
          subscriber.complete();
        } finally {
          await this.disconnect(db);
        }
      };
      run().catch((err: unknown) =>
        subscriber.error(err instanceof Error ? err : new Error(String(err))),
      );
      return () => {
        cancelled = true;
      };
    });
  }

  /**
   * Record one tb_activity row summarising the step run.
   * @param db - Tenant client / ไคลเอนต์ผู้เช่า
   * @param step - Catalog step / ขั้นตอน
   * @param actor_id - Caller user id / id ผู้เรียก
   * @param file_name - Uploaded file name / ชื่อไฟล์
   * @param options - Options used / ตัวเลือกที่ใช้
   * @param summary - Run summary / สรุปผล
   */
  private async writeActivity(
    db: TenantDb,
    step: PreconfigStep,
    actor_id: string | null,
    file_name: string,
    options: ImportOptions,
    summary: ImportSummary,
  ): Promise<void> {
    try {
      await db.tb_activity.create({
        data: {
          action: 'import',
          entity_type: 'preconfig_import',
          actor_id: actor_id ?? undefined,
          created_by_id: actor_id ?? undefined,
          description: `Preconfig import: ${step.displayName} (${step.tableName})`,
          meta_data: { step_id: step.id, file_name, options, summary },
        },
      });
    } catch (err) {
      // Audit must never fail the import / การบันทึก audit ต้องไม่ทำให้การนำเข้าล้มเหลว
      this.logger.error({ function: 'writeActivity', err: String(err) }, PreconfigImportService.name);
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit`
Expected: no errors. If `db[step.tableName]` trips `noImplicitAny`, confirm `TenantDb` is
declared as `PrismaClient & Record<string, any>` as written above.

- [ ] **Step 3: Commit**

```bash
cd BE && git add apps/micro-business/src/preconfig-import/preconfig-import.service.ts
git commit -m "feat(preconfig-import): add check, preview, and streaming import service"
```

---

### Task 5: micro-business message handlers

**Files:**
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-import.controller.ts`
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-import.module.ts`
- Modify: `BE/apps/micro-business/src/app.module.ts`

**Interfaces:**
- Consumes: `PreconfigImportService` from Task 4
- Produces: message patterns `preconfig-import.steps`, `preconfig-import.check`, `preconfig-import.preview`, `preconfig-import.import-stream` (all `service: 'preconfig-import'`)

The gateway cannot send a `Buffer` over JSON-RPC, so the file crosses the boundary as a
base64 string and is re-materialised here.

- [ ] **Step 1: Write the controller**

```ts
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { Observable } from 'rxjs';
import { PreconfigImportService } from './preconfig-import.service';
import type { ImportOptions, ImportProgressEvent } from './preconfig-types';

/** Payload carrying a base64-encoded workbook. */
interface FilePayload {
  file_base64: string;
  file_name: string;
}

/**
 * TCP handlers for the Preconfig import wizard.
 * ตัวจัดการ TCP สำหรับตัวช่วยนำเข้าข้อมูล Preconfig
 */
@Controller()
export class PreconfigImportController {
  constructor(private readonly service: PreconfigImportService) {}

  /**
   * Return the step catalog.
   * @returns Step metadata / ข้อมูลเมตาของขั้นตอน
   */
  @MessagePattern({ cmd: 'preconfig-import.steps', service: 'preconfig-import' })
  steps() {
    return { status: 200, data: { steps: this.service.getSteps() } };
  }

  /**
   * Check an uploaded workbook against the catalog.
   * @param data - Base64 workbook payload / ข้อมูลไฟล์แบบ base64
   * @returns Check report / รายงานตรวจไฟล์
   */
  @MessagePattern({ cmd: 'preconfig-import.check', service: 'preconfig-import' })
  async check(@Payload() data: FilePayload) {
    const result = await this.service.check(Buffer.from(data.file_base64, 'base64'), data.file_name);
    return result.isError()
      ? { status: 400, error: result.error.message }
      : { status: 200, data: result.value };
  }

  /**
   * Dry-run one step.
   * @param data - Request payload / ข้อมูลคำขอ
   * @returns Preview result / ผลตัวอย่าง
   */
  @MessagePattern({ cmd: 'preconfig-import.preview', service: 'preconfig-import' })
  async preview(@Payload() data: FilePayload & { bu_id: string; step_id: string; options?: ImportOptions }) {
    const result = await this.service.preview(
      data.bu_id,
      data.step_id,
      Buffer.from(data.file_base64, 'base64'),
      data.options ?? {},
    );
    return result.isError()
      ? { status: 400, error: result.error.message }
      : { status: 200, data: result.value };
  }

  /**
   * Run one step, streaming progress.
   * @param data - Request payload / ข้อมูลคำขอ
   * @returns Observable of progress events / Observable ของเหตุการณ์ความคืบหน้า
   */
  @MessagePattern({ cmd: 'preconfig-import.import-stream', service: 'preconfig-import' })
  importStream(
    @Payload()
    data: FilePayload & { bu_id: string; step_id: string; options?: ImportOptions; user_id?: string },
  ): Observable<ImportProgressEvent> {
    return this.service.importStream(
      data.bu_id,
      data.step_id,
      Buffer.from(data.file_base64, 'base64'),
      data.options ?? {},
      data.user_id ?? null,
      data.file_name,
    );
  }
}
```

- [ ] **Step 2: Write the module**

```ts
import { Module } from '@nestjs/common';
import { PreconfigImportController } from './preconfig-import.controller';
import { PreconfigImportService } from './preconfig-import.service';
import { TenantModule } from '@/tenant/tenant.module';

/**
 * Module wiring the Preconfig import handlers and service.
 * โมดูลที่เชื่อมต่อตัวจัดการและบริการนำเข้าข้อมูล Preconfig
 */
@Module({
  imports: [TenantModule],
  controllers: [PreconfigImportController],
  providers: [PreconfigImportService],
})
export class PreconfigImportModule {}
```

- [ ] **Step 3: Register the module**

In `BE/apps/micro-business/src/app.module.ts`, add the import next to the existing
`TenantSeedModule` import (line ~31) and add `PreconfigImportModule` to the `imports` array
next to `TenantSeedModule` (line ~225):

```ts
import { PreconfigImportModule } from './preconfig-import/preconfig-import.module';
```

- [ ] **Step 4: Verify the app still boots as a module graph**

Run: `cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit && bun run --cwd apps/micro-business build`
Expected: build succeeds. A missing provider surfaces here or in Task 6's boot test.

- [ ] **Step 5: Commit**

```bash
cd BE && git add apps/micro-business/src/preconfig-import/ apps/micro-business/src/app.module.ts
git commit -m "feat(preconfig-import): expose micro-business message handlers"
```

---

### Task 6: Gateway endpoints (multipart in, NDJSON out)

**Files:**
- Create: `BE/apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.service.ts`
- Create: `BE/apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.controller.ts`
- Create: `BE/apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.module.ts`
- Create: `BE/apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.module.spec.ts` (boot guard — required, not TDD)
- Modify: `BE/apps/backend-gateway/src/app.module.ts`

**Interfaces:**
- Consumes: micro-business patterns from Task 5; `PlatformPermissionGuard`, `PlatformPermissionService`, `RequirePlatformPermission`, `KeycloakGuard`, `BaseHttpController`
- Produces: HTTP routes `GET /api-system/tenant/preconfig-imports/steps`, `POST …/:bu_id/check`, `POST …/:bu_id/:step_id/preview`, `POST …/:bu_id/:step_id/import/stream`

- [ ] **Step 1: Write the proxy service**

Copy the structure of `BE/apps/backend-gateway/src/platform/tenant-seeds/tenant-seeds.service.ts`
(including the local structural copy of the event union — the gateway must not import across
app boundaries):

```ts
import { Inject, HttpStatus, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { Result, MicroserviceResponse } from '@/common';
import { getGatewayRequestContext } from '@/common/context/gateway-request-context';

/** Local structural copy of ImportProgressEvent from micro-business. */
type ImportProgressEvent =
  | { type: 'start'; step_id: string; bu_code: string; total: number }
  | { type: 'cleared'; step_id: string; soft_deleted: number }
  | { type: 'progress'; step_id: string; index: number; total: number; inserted: number; updated: number; skipped: number; failed: number }
  | { type: 'done'; success: boolean; summary: Record<string, unknown> }
  | { type: 'error'; message: string };

/** Options forwarded to the importer. */
export interface ImportOptions {
  duplicate_mode?: 'skip' | 'upsert' | 'error';
  clear_existing?: boolean;
  accept_lookup_creation?: boolean;
}

/**
 * Proxies Preconfig import operations to micro-business.
 * ส่งต่อการนำเข้าข้อมูล Preconfig ไปยัง micro-business
 */
@Injectable()
export class PreconfigImportsService {
  private readonly logger = new BackendLogger(PreconfigImportsService.name);

  constructor(@Inject('BUSINESS_SERVICE') private readonly client: ClientProxy) {}

  /**
   * Unwrap a unary microservice response into a gateway Result.
   * @param res - Microservice response / การตอบกลับจากไมโครเซอร์วิส
   * @returns Result / ผลลัพธ์
   */
  private unwrap(res: MicroserviceResponse): unknown {
    if (res.response?.status !== HttpStatus.OK) return Result.fromMicroserviceError(res);
    return Result.ok(res.data);
  }

  /**
   * Fetch the step catalog.
   * @returns Result wrapping the catalog / Result ที่ห่อแคตตาล็อก
   */
  async getSteps(): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.client.send(
      { cmd: 'preconfig-import.steps', service: 'preconfig-import' },
      { ...getGatewayRequestContext() },
    );
    return this.unwrap(await firstValueFrom(res));
  }

  /**
   * Check an uploaded workbook.
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param file_name - Original file name / ชื่อไฟล์
   * @returns Result wrapping the check report / Result ที่ห่อรายงาน
   */
  async check(file: Buffer, file_name: string): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.client.send(
      { cmd: 'preconfig-import.check', service: 'preconfig-import' },
      { file_base64: file.toString('base64'), file_name, ...getGatewayRequestContext() },
    );
    return this.unwrap(await firstValueFrom(res));
  }

  /**
   * Dry-run one step.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param file_name - Original file name / ชื่อไฟล์
   * @param options - Import options / ตัวเลือก
   * @returns Result wrapping the preview / Result ที่ห่อผลตัวอย่าง
   */
  async preview(bu_id: string, step_id: string, file: Buffer, file_name: string, options: ImportOptions): Promise<unknown> {
    const res: Observable<MicroserviceResponse> = this.client.send(
      { cmd: 'preconfig-import.preview', service: 'preconfig-import' },
      { bu_id, step_id, options, file_base64: file.toString('base64'), file_name, ...getGatewayRequestContext() },
    );
    return this.unwrap(await firstValueFrom(res));
  }

  /**
   * Run one step, streaming progress events.
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param file - Workbook bytes / ไบต์ของไฟล์
   * @param file_name - Original file name / ชื่อไฟล์
   * @param options - Import options / ตัวเลือก
   * @param user_id - Caller user id / id ผู้เรียก
   * @returns Observable of progress events / Observable ของเหตุการณ์
   */
  runImportStream(bu_id: string, step_id: string, file: Buffer, file_name: string, options: ImportOptions, user_id?: string): Observable<ImportProgressEvent> {
    return this.client.send<ImportProgressEvent>(
      { cmd: 'preconfig-import.import-stream', service: 'preconfig-import' },
      { bu_id, step_id, options, user_id, file_base64: file.toString('base64'), file_name, ...getGatewayRequestContext() },
    );
  }
}
```

- [ ] **Step 2: Write the controller**

Upload limits and the NDJSON writer come from the spec §6 and §9. The stream block is the
same shape as `TenantSeedsController.deployStream` — read that file before writing this one.

```ts
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { KeycloakGuard } from 'src/auth/guards/keycloak.guard';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { RequirePlatformPermission } from 'src/auth/decorators/platform-permission.decorator';
import { BaseHttpController } from '@/common';
import { PreconfigImportsService, type ImportOptions } from './preconfig-imports.service';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Preconfig master-data import endpoints (platform admin).
 * เอนด์พอยต์นำเข้าข้อมูลตั้งต้นของผู้เช่า
 */
@Controller('api-system/tenant/preconfig-imports')
@ApiTags('Platform: Preconfig Import')
@UseGuards(KeycloakGuard, PlatformPermissionGuard)
@RequirePlatformPermission('data_import.manage')
@ApiBearerAuth()
export class PreconfigImportsController extends BaseHttpController {
  constructor(private readonly service: PreconfigImportsService) {
    super();
  }

  /**
   * Reject files that are not a plausible .xlsx upload.
   * @param file - Uploaded file / ไฟล์ที่อัปโหลด
   */
  private assertXlsx(file?: Express.Multer.File): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('A workbook file is required (field name: "file")');
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`);
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.mimetype !== XLSX_MIME) {
      throw new BadRequestException('Only .xlsx workbooks are accepted');
    }
  }

  /**
   * Parse the multipart "options" field.
   * @param raw - Raw JSON string / สตริง JSON
   * @returns Parsed options / ตัวเลือกที่แปลงแล้ว
   */
  private parseOptions(raw?: string): ImportOptions {
    if (!raw) return {};
    try {
      return JSON.parse(raw) as ImportOptions;
    } catch {
      throw new BadRequestException('"options" must be a JSON object');
    }
  }

  /**
   * Map a pre-stream failure message to an HTTP status (mirrors TenantSeedsController).
   * @param message - Error message / ข้อความผิดพลาด
   * @returns HTTP status / สถานะ HTTP
   */
  private resolvePreStreamErrorStatus(message: string): HttpStatus {
    if (/not found/i.test(message)) return HttpStatus.NOT_FOUND;
    if (/no database connection configured|unsupported database provider/i.test(message)) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (/invalid bu_id format/i.test(message)) return HttpStatus.BAD_REQUEST;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * List the wizard step catalog.
   * @param res - HTTP response / การตอบกลับ
   */
  @Get('steps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preconfig step catalog', operationId: 'preconfigImport_steps' })
  @ApiResponse({ status: 200, description: 'Catalog returned' })
  async steps(@Res() res: Response): Promise<void> {
    this.respond(res, await this.service.getSteps());
  }

  /**
   * Check an uploaded workbook against the catalog.
   * @param res - HTTP response / การตอบกลับ
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param file - Uploaded workbook / ไฟล์ที่อัปโหลด
   */
  @Post(':bu_id/check')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Check a Preconfig workbook', operationId: 'preconfigImport_check' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiResponse({ status: 200, description: 'Check report returned' })
  @ApiResponse({ status: 400, description: 'Missing or invalid file' })
  @UseInterceptors(FileInterceptor('file'))
  async check(
    @Res() res: Response,
    @Param('bu_id', new ParseUUIDPipe()) bu_id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<void> {
    this.assertXlsx(file);
    this.respond(res, await this.service.check(file.buffer, file.originalname));
  }

  /**
   * Dry-run one step.
   * @param res - HTTP response / การตอบกลับ
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param body - Multipart text fields / ฟิลด์ข้อความ
   * @param file - Uploaded workbook / ไฟล์ที่อัปโหลด
   */
  @Post(':bu_id/:step_id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Preview one import step', operationId: 'preconfigImport_preview' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiParam({ name: 'step_id', description: 'Wizard step id, e.g. "currency"' })
  @ApiResponse({ status: 200, description: 'Preview returned' })
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @Res() res: Response,
    @Param('bu_id', new ParseUUIDPipe()) bu_id: string,
    @Param('step_id') step_id: string,
    @Body() body: { options?: string },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<void> {
    this.assertXlsx(file);
    const options = this.parseOptions(body?.options);
    this.respond(res, await this.service.preview(bu_id, step_id, file.buffer, file.originalname, options));
  }

  /**
   * Run one step and stream NDJSON progress.
   * @param req - HTTP request / คำขอ
   * @param res - HTTP response / การตอบกลับ
   * @param bu_id - Business unit UUID / UUID ของหน่วยธุรกิจ
   * @param step_id - Step identifier / ตัวระบุขั้นตอน
   * @param body - Multipart text fields / ฟิลด์ข้อความ
   * @param file - Uploaded workbook / ไฟล์ที่อัปโหลด
   * @returns Promise settled when the stream ends / Promise ที่จบเมื่อสตรีมสิ้นสุด
   */
  @Post(':bu_id/:step_id/import/stream')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Run one import step (NDJSON)', operationId: 'preconfigImport_importStream' })
  @ApiParam({ name: 'bu_id', description: 'Business unit UUID' })
  @ApiParam({ name: 'step_id', description: 'Wizard step id, e.g. "currency"' })
  @ApiResponse({ status: 200, description: 'application/x-ndjson stream of progress events' })
  @UseInterceptors(FileInterceptor('file'))
  importStream(
    @Req() req: Request,
    @Res() res: Response,
    @Param('bu_id', new ParseUUIDPipe()) bu_id: string,
    @Param('step_id') step_id: string,
    @Body() body: { options?: string },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<void> {
    this.assertXlsx(file);
    const options = this.parseOptions(body?.options);
    const user_id = (req as Request & { user?: { user_id?: string } }).user?.user_id;

    return new Promise<void>((settle) => {
      let started = false;
      const startNdjson = () => {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        started = true;
      };

      const sub = this.service
        .runImportStream(bu_id, step_id, file.buffer, file.originalname, options, user_id)
        .subscribe({
          next: (event) => {
            if (!started) startNdjson();
            res.write(JSON.stringify(event) + '\n');
          },
          error: (err: Error) => {
            if (!started) {
              const status = this.resolvePreStreamErrorStatus(err.message);
              res.status(status).json({ message: err.message, status, success: false });
            } else {
              res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
              res.end();
            }
            settle();
          },
          complete: () => {
            res.end();
            settle();
          },
        });

      req.on('close', () => {
        sub.unsubscribe();
        settle();
      });
    });
  }
}
```

- [ ] **Step 3: Write the module (all three guard dependencies)**

Omitting any of `PlatformPermissionGuard`, `PlatformPermissionService`, or the
`BUSINESS_SERVICE` client registration crashes the gateway at boot.

```ts
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { envConfig } from 'src/libs/config.env';
import { rpcClient } from '@repo/nest-http-transport';
import { PreconfigImportsController } from './preconfig-imports.controller';
import { PreconfigImportsService } from './preconfig-imports.service';
import { PlatformPermissionGuard } from 'src/auth/guards/platform-permission.guard';
import { PlatformPermissionService } from 'src/auth/services/platform-permission.service';

/**
 * Registers the Preconfig import controller, proxy service, and RBAC guard dependencies.
 * ลงทะเบียน controller, บริการ proxy และ dependency ของ guard สำหรับการนำเข้า Preconfig
 */
@Module({
  imports: [
    ClientsModule.register([
      rpcClient({ name: 'BUSINESS_SERVICE', host: envConfig.BUSINESS_SERVICE_HOST, port: Number(envConfig.BUSINESS_SERVICE_RPC_PORT) }),
    ]),
  ],
  controllers: [PreconfigImportsController],
  providers: [PreconfigImportsService, PlatformPermissionGuard, PlatformPermissionService],
})
export class PreconfigImportsModule {}
```

- [ ] **Step 4: Write the boot guard spec (required)**

This is a regression guard for the known gateway-crash failure mode, not TDD.

```ts
import { Test } from '@nestjs/testing';
import { PreconfigImportsModule } from './preconfig-imports.module';

describe('PreconfigImportsModule', () => {
  it('compiles with every guard dependency resolvable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PreconfigImportsModule],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
```

- [ ] **Step 5: Register the module**

In `BE/apps/backend-gateway/src/app.module.ts`, add the import next to `TenantSeedsModule`
(line ~38) and add `PreconfigImportsModule` to the `imports` array next to `TenantSeedsModule`
(line ~91):

```ts
import { PreconfigImportsModule } from './platform/preconfig-imports/preconfig-imports.module';
```

- [ ] **Step 6: Run the boot spec and type-check**

Run in the foreground, scoped (never the whole suite):

```bash
cd BE && npx jest --config apps/backend-gateway/jest.config.js --runTestsByPath apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.module.spec.ts --forceExit
npx tsc -p apps/backend-gateway/tsconfig.json --noEmit
```

Expected: spec passes, no type errors. If the config path differs, find it with
`ls apps/backend-gateway/jest.config*` or the `test` script in `apps/backend-gateway/package.json`.

- [ ] **Step 7: Commit**

```bash
cd BE && git add apps/backend-gateway/src/platform/preconfig-imports/ apps/backend-gateway/src/app.module.ts
git commit -m "feat(preconfig-import): add gateway endpoints with data_import.manage guard"
```

---

### Task 7: Backend manual verification on DEV

**Files:** none (verification only)

**Interfaces:**
- Consumes: Tasks 1–6
- Produces: a green signal that streaming + multipart + the new permission work end to end

- [ ] **Step 1: Open a PR and get the backend deployed to DEV**

```bash
cd BE && git push -u origin feature/preconfig-import-wizard
gh pr create --title "feat(preconfig-import): Preconfig wizard endpoints (phase 1)" --body "$(cat <<'EOF'
Adds `/api-system/tenant/preconfig-imports/*` (steps, check, preview, import stream) for the
Preconfig import wizard, plus the `data_import.manage` platform permission.

Phase 1 covers three lookup-free steps: currency, unit, tax-profile.

Spec: carmen-platform `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then ask the user to merge and deploy micro-business + backend-gateway to DEV, and to run the
two seed scripts against the DEV platform database:

```bash
cd BE/packages/prisma-shared-schema-platform
npx tsx prisma/seed.platform-permission.ts
npx tsx prisma/seed.platform-role-permission.ts
```

(Confirm the exact runner from that package's `package.json` scripts before running.)

- [ ] **Step 2: Verify the catalog endpoint**

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  "$DEV_API/api-system/tenant/preconfig-imports/steps" | jq '.data.steps[].id'
```

Expected: `"currency"`, `"unit"`, `"tax-profile"`.

- [ ] **Step 3: Verify check + preview with a real workbook**

```bash
F=~/GitHub/carmensoftware-organize/support-import-data/"sample data"/Preconfig.xlsx
curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  -F "file=@$F" "$DEV_API/api-system/tenant/preconfig-imports/$BU_ID/check" | jq '.data.steps'

curl -s -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  -F "file=@$F" -F 'options={"duplicate_mode":"skip"}' \
  "$DEV_API/api-system/tenant/preconfig-imports/$BU_ID/unit/preview" | jq '.data.counts'
```

Expected: check reports `ready` for currency/unit/tax-profile; the unit preview reports 34
data rows classified as `new` on a fresh tenant.

- [ ] **Step 4: Verify the NDJSON stream**

```bash
curl -sN -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" \
  -F "file=@$F" -F 'options={"duplicate_mode":"skip"}' \
  "$DEV_API/api-system/tenant/preconfig-imports/$BU_ID/unit/import/stream"
```

Expected: one JSON object per line, ending with a `done` event. **This is the gate for the
whole design** — if the stream never emits or ends without a `done`, stop and diagnose before
starting Task 8 (compare against the `tenant-seeds` stream, which is known to work).

- [ ] **Step 5: Verify the audit row and re-run idempotency**

Re-run the same stream command. Expected on the second run: `skipped` equals the row count and
`inserted` is 0. Then confirm two rows exist:

```sql
SELECT action, entity_type, description, meta_data->'summary'->>'inserted' AS inserted
FROM tb_activity WHERE entity_type = 'preconfig_import' ORDER BY created_at DESC LIMIT 5;
```

---

### Task 8: Frontend types and service

**Files:**
- Modify: `FE/src/types/index.ts`
- Create: `FE/src/services/preconfigImportService.ts`

**Interfaces:**
- Consumes: the API contract from Task 6
- Produces: types `PreconfigStepMeta`, `PreconfigCheckReport`, `PreconfigPreview`, `PreconfigImportEvent`, `PreconfigImportSummary`, `PreconfigImportOptions`; service `preconfigImportService.getSteps/check/preview/importStream`

- [ ] **Step 1: Add the types**

Append to `FE/src/types/index.ts` (after the existing `SeedProgressEvent` block, keeping the
file's style — snake_case wire fields, optional new fields):

```ts
export type PreconfigDuplicateMode = 'skip' | 'upsert' | 'error';

export interface PreconfigStepMeta {
  id: string;
  sheet_name: string;
  table_name: string;
  display_name: string;
  description: string;
  target: 'tenant' | 'platform';
  required_columns: string[];
  optional_columns: string[];
  duplicate_key: string[];
  default_duplicate_mode: PreconfigDuplicateMode;
  supports_clear: boolean;
  creates_lookups: string[];
}

export interface PreconfigCheckStep {
  step_id: string;
  sheet_present: boolean;
  row_count: number;
  missing_required_columns: string[];
  missing_optional_columns: string[];
  status: 'ready' | 'sheet_missing' | 'columns_missing';
}

export interface PreconfigCheckReport {
  file_name: string;
  sheets_found: string[];
  steps: PreconfigCheckStep[];
}

export interface PreconfigPreviewRow {
  row_number: number;
  verdict: 'new' | 'duplicate' | 'error';
  values: Record<string, unknown>;
  errors: Array<{ column: string; message: string }>;
}

export interface PreconfigLookupCreation {
  table: string;
  column: string;
  values: string[];
}

export interface PreconfigPreview {
  step_id: string;
  total_rows: number;
  counts: { new: number; duplicate: number; error: number };
  clear_will_soft_delete: number;
  lookups_to_create: PreconfigLookupCreation[];
  rows: PreconfigPreviewRow[];
  rows_truncated: boolean;
}

export interface PreconfigImportSummary {
  step_id: string;
  bu_id: string;
  bu_code: string;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  lookups_created: number;
  errors: Array<{ row_number: number; message: string }>;
}

export type PreconfigImportEvent =
  | { type: 'start'; step_id: string; bu_code: string; total: number }
  | { type: 'cleared'; step_id: string; soft_deleted: number }
  | { type: 'progress'; step_id: string; index: number; total: number; inserted: number; updated: number; skipped: number; failed: number }
  | { type: 'done'; success: boolean; summary: PreconfigImportSummary }
  | { type: 'error'; message: string };

export interface PreconfigImportOptions {
  duplicate_mode?: PreconfigDuplicateMode;
  clear_existing?: boolean;
  accept_lookup_creation?: boolean;
}
```

- [ ] **Step 2: Write the service**

The streaming reader is the same shape as `FE/src/services/tenantSeedService.ts` — read it
first, then write:

```ts
import api from './api';
import type {
  PreconfigCheckReport,
  PreconfigImportEvent,
  PreconfigImportOptions,
  PreconfigImportSummary,
  PreconfigPreview,
  PreconfigStepMeta,
} from '../types';

// Preconfig master-data import. Requires the `data_import.manage` platform permission;
// the axios interceptor supplies the bearer token + x-app-id.
const base = '/api-system/tenant/preconfig-imports';

/**
 * Build the multipart body shared by check/preview/import.
 */
function formOf(file: File, options?: PreconfigImportOptions): FormData {
  const fd = new FormData();
  fd.append('file', file);
  if (options) fd.append('options', JSON.stringify(options));
  return fd;
}

const preconfigImportService = {
  getSteps: async (): Promise<PreconfigStepMeta[]> => {
    const res = await api.get(`${base}/steps`);
    const body = res.data?.data ?? res.data;
    return body?.steps ?? [];
  },

  check: async (buId: string, file: File): Promise<PreconfigCheckReport> => {
    const res = await api.post(`${base}/${buId}/check`, formOf(file));
    return res.data?.data ?? res.data;
  },

  preview: async (
    buId: string,
    stepId: string,
    file: File,
    options?: PreconfigImportOptions,
  ): Promise<PreconfigPreview> => {
    const res = await api.post(`${base}/${buId}/${stepId}/preview`, formOf(file, options));
    return res.data?.data ?? res.data;
  },

  /**
   * Stream one import step as NDJSON. Uses fetch (not axios) so the body can be read
   * incrementally; resolves with the `done` summary and rejects on a terminal error.
   */
  importStream: async (
    buId: string,
    stepId: string,
    file: File,
    options: PreconfigImportOptions,
    onEvent: (e: PreconfigImportEvent) => void,
    signal?: AbortSignal,
  ): Promise<PreconfigImportSummary> => {
    const root = api.defaults.baseURL ?? '';
    const res = await fetch(`${root}${base}/${buId}/${stepId}/import/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
        'x-app-id': (import.meta.env.REACT_APP_API_APP_ID ?? '') as string,
      },
      body: formOf(file, options),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message || `Import failed (${res.status})`);
    }
    if (!res.body) throw new Error('Import stream: response body is null');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary: PreconfigImportSummary | undefined;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed) as PreconfigImportEvent;
      onEvent(event);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') summary = event.summary;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handleLine(buffer);
    if (!summary) throw new Error('Import stream ended without a result');
    return summary;
  },
};

export default preconfigImportService;
```

Note: do **not** set `Content-Type` on either the axios or fetch calls — the browser must add
the multipart boundary itself.

- [ ] **Step 3: Type-check**

Run: `cd FE && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd FE && git add src/types/index.ts src/services/preconfigImportService.ts
git commit -m "feat(preconfig-import): add frontend types and service"
```

---

### Task 9: Promote `BuSwitcher` to a shared component

**Files:**
- Create: `FE/src/components/BuSwitcher.tsx` (moved from `FE/src/pages/sqlWorkbench/BuSwitcher.tsx`)
- Delete: `FE/src/pages/sqlWorkbench/BuSwitcher.tsx`
- Move: `FE/src/pages/sqlWorkbench/BuSwitcher.test.tsx` → `FE/src/components/BuSwitcher.test.tsx`
- Modify: `FE/src/pages/sqlWorkbench/SqlWorkbench.tsx` (and any other importer)

**Interfaces:**
- Consumes: nothing new
- Produces: `import { BuSwitcher } from '../components/BuSwitcher'` for both SQL Workbench and the new wizard

- [ ] **Step 1: Move the files with git so history follows**

```bash
cd FE
git mv src/pages/sqlWorkbench/BuSwitcher.tsx src/components/BuSwitcher.tsx
git mv src/pages/sqlWorkbench/BuSwitcher.test.tsx src/components/BuSwitcher.test.tsx
```

- [ ] **Step 2: Fix the relative imports inside the moved files**

Inside `src/components/BuSwitcher.tsx`, the paths shorten by one level:
`'../../components/ui/dialog'` → `'./ui/dialog'`, `'../../components/ui/badge'` → `'./ui/badge'`,
`'../../lib/utils'` → `'../lib/utils'`, `'../../types'` → `'../types'`,
`'../../utils/buHue'` → `'../utils/buHue'`. Apply the same shift in `BuSwitcher.test.tsx`.

- [ ] **Step 3: Update every importer**

```bash
cd FE && grep -rn "sqlWorkbench/BuSwitcher\|from './BuSwitcher'" src/ --include=*.tsx --include=*.ts
```

Point each hit at `'../../components/BuSwitcher'` (from a page folder) or
`'../components/BuSwitcher'` (from `src/pages/`).

- [ ] **Step 4: Verify nothing broke**

```bash
cd FE && npx tsc --noEmit && bun run test
```

Expected: type-check clean, full suite green (the moved `BuSwitcher` test still passes).

- [ ] **Step 5: Commit**

```bash
cd FE && git add -A src/components/BuSwitcher.tsx src/components/BuSwitcher.test.tsx src/pages/sqlWorkbench/
git commit -m "refactor: promote BuSwitcher to a shared component"
```

---

### Task 10: Wizard page shell — BU pick, upload, file check

**Files:**
- Create: `FE/src/pages/TenantImportWizard.tsx`
- Create: `FE/src/pages/tenantImport/WorkbookDropzone.tsx`
- Create: `FE/src/pages/tenantImport/FileCheckPanel.tsx`

**Interfaces:**
- Consumes: `preconfigImportService`, `BuSwitcher`, types from Task 8
- Produces: `TenantImportWizard` default export; `WorkbookDropzone` (`onFile(file: File)`); `FileCheckPanel` (`report`, `steps`, `onContinue`)

- [ ] **Step 1: Write the dropzone (no new dependency)**

```tsx
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../lib/utils';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Drag-and-drop or click-to-browse .xlsx picker. Plain DOM events — the repo does not
 * carry react-dropzone and this feature must not add dependencies.
 */
export function WorkbookDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) return;
    onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload Preconfig workbook"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-10 text-center',
        dragging ? 'border-primary bg-accent' : 'border-input bg-card',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Drop Preconfig.xlsx here</p>
        <p className="text-xs text-muted-foreground">or click to browse — .xlsx only, max 10 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={`.xlsx,${XLSX_MIME}`}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the file-check panel**

```tsx
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { PreconfigCheckReport, PreconfigStepMeta } from '../../types';

const STATUS_LABEL: Record<PreconfigCheckReport['steps'][number]['status'], string> = {
  ready: 'Ready',
  sheet_missing: 'Sheet missing',
  columns_missing: 'Columns missing',
};

/**
 * Pre-wizard report: which sheets were found, how many rows, what is missing.
 * A step that is not `ready` still appears here so nothing disappears silently.
 */
export function FileCheckPanel({
  report,
  steps,
  onContinue,
  onReset,
}: {
  report: PreconfigCheckReport;
  steps: PreconfigStepMeta[];
  onContinue: () => void;
  onReset: () => void;
}) {
  const metaById = new Map(steps.map((s) => [s.id, s]));
  const readyCount = report.steps.filter((s) => s.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{report.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {report.sheets_found.length} sheets found · {readyCount} of {report.steps.length} steps ready
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onReset}>Choose another file</Button>
          <Button onClick={onContinue} disabled={readyCount === 0}>Continue</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Step</th>
              <th className="px-3 py-2 text-left font-medium">Sheet</th>
              <th className="px-3 py-2 text-right font-medium">Rows</th>
              <th className="px-3 py-2 text-left font-medium">Missing</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.steps.map((s) => {
              const meta = metaById.get(s.step_id);
              const missing = [...s.missing_required_columns, ...s.missing_optional_columns];
              return (
                <tr key={s.step_id} className="border-t">
                  <td className="px-3 py-2">{meta?.display_name ?? s.step_id}</td>
                  <td className="px-3 py-2 text-muted-foreground">{meta?.sheet_name ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.row_count || '-'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {missing.length ? missing.join(', ') : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status === 'ready' ? 'success' : 'secondary'}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page orchestrator (BU pick + upload + check)**

`TenantImportWizard.tsx` holds all wizard state. Phase 1 renders three screens; Task 11 adds
the stepper branch.

```tsx
import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { BuSwitcher } from '../components/BuSwitcher';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import businessUnitService from '../services/businessUnitService';
import preconfigImportService from '../services/preconfigImportService';
import { parseApiError } from '../utils/errorParser';
import type { BusinessUnit, PreconfigCheckReport, PreconfigStepMeta } from '../types';
import { WorkbookDropzone } from './tenantImport/WorkbookDropzone';
import { FileCheckPanel } from './tenantImport/FileCheckPanel';

type Screen = 'pick-bu' | 'upload' | 'check' | 'steps';

export default function TenantImportWizard() {
  const [screen, setScreen] = useState<Screen>('pick-bu');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buOpen, setBuOpen] = useState(false);
  const [bu, setBu] = useState<BusinessUnit | null>(null);
  const [steps, setSteps] = useState<PreconfigStepMeta[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PreconfigCheckReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, catalog] = await Promise.all([
          businessUnitService.getAll({ perpage: 200 }),
          preconfigImportService.getSteps(),
        ]);
        setBusinessUnits(Array.isArray(list) ? list : (list as { data?: BusinessUnit[] }).data ?? []);
        setSteps(catalog);
      } catch (err) {
        toast.error(parseApiError(err).message);
      }
    })();
  }, []);

  const handleFile = useCallback(
    async (picked: File) => {
      if (!bu) return;
      setBusy(true);
      try {
        const result = await preconfigImportService.check(bu.id, picked);
        setFile(picked);
        setReport(result);
        setScreen('check');
      } catch (err) {
        toast.error(parseApiError(err).message);
      } finally {
        setBusy(false);
      }
    },
    [bu],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Tenant Data Import"
          subtitle="Load Preconfig.xlsx master data into a business unit's database"
          actions={
            <Button variant="outline" onClick={() => setBuOpen(true)}>
              {bu ? `BU: ${bu.code}` : 'Select business unit'}
            </Button>
          }
        />

        <Card>
          <CardContent className="space-y-4 pt-6">
            {screen === 'pick-bu' && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pick the business unit that will receive the data.
                </p>
                <Button onClick={() => setBuOpen(true)}>Select business unit</Button>
              </div>
            )}

            {screen === 'upload' && (
              <>
                {busy ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking workbook…
                  </div>
                ) : (
                  <WorkbookDropzone onFile={handleFile} />
                )}
              </>
            )}

            {screen === 'check' && report && (
              <FileCheckPanel
                report={report}
                steps={steps}
                onContinue={() => setScreen('steps')}
                onReset={() => {
                  setFile(null);
                  setReport(null);
                  setScreen('upload');
                }}
              />
            )}

            {screen === 'steps' && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Stepper arrives in the next task.
              </p>
            )}
          </CardContent>
        </Card>

        {process.env.NODE_ENV === 'development' && (
          <DevDebugSheet data={{ bu, steps, report, fileName: file?.name }} />
        )}
      </div>

      <BuSwitcher
        open={buOpen}
        onOpenChange={setBuOpen}
        businessUnits={businessUnits}
        currentCode={bu?.code ?? ''}
        onSelect={(code) => {
          const picked = businessUnits.find((b) => b.code === code) ?? null;
          setBu(picked);
          setBuOpen(false);
          setFile(null);
          setReport(null);
          setScreen(picked ? 'upload' : 'pick-bu');
        }}
      />
    </Layout>
  );
}
```

- [ ] **Step 4: Reconcile against the real component APIs**

Before type-checking, open `FE/src/components/ui/dev-debug-sheet.tsx` and
`FE/src/services/businessUnitService.ts` and adjust the two call sites above to the actual
prop/parameter names (`DevDebugSheet`'s data prop and `getAll`'s paginate shape). Do not
invent props — match what exists.

- [ ] **Step 5: Type-check**

Run: `cd FE && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd FE && git add src/pages/TenantImportWizard.tsx src/pages/tenantImport/
git commit -m "feat(preconfig-import): add wizard shell with BU picker, upload, and file check"
```

---

### Task 11: Stepper rail, preview table, and import run

**Files:**
- Create: `FE/src/pages/tenantImport/StepRail.tsx`
- Create: `FE/src/pages/tenantImport/StepPanel.tsx`
- Modify: `FE/src/pages/TenantImportWizard.tsx`

**Interfaces:**
- Consumes: Task 10's page state, `preconfigImportService.preview/importStream`
- Produces: `StepRail` (`steps`, `states`, `activeId`, `onSelect`), `StepPanel` (`step`, `state`, `onPreview`, `onImport`, `onOptionsChange`), and the shared `StepState` type exported from `StepPanel.tsx`

- [ ] **Step 1: Write the rail**

```tsx
import { Check, Circle, CircleDot, Loader2, SkipForward, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PreconfigStepMeta } from '../../types';
import type { StepState } from './StepPanel';

const ICONS = {
  pending: Circle,
  previewing: Loader2,
  previewed: CircleDot,
  importing: Loader2,
  completed: Check,
  skipped: SkipForward,
  error: X,
} as const;

/**
 * Vertical list of wizard steps with status and row counts. Collapses into a
 * <select> below `lg`, matching the repo's mobile-first breakpoint rules.
 */
export function StepRail({
  steps,
  states,
  activeId,
  onSelect,
}: {
  steps: PreconfigStepMeta[];
  states: Record<string, StepState>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <select
        aria-label="Import step"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm lg:hidden"
        value={activeId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {steps.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name} — {states[s.id]?.status ?? 'pending'}
          </option>
        ))}
      </select>

      <ul className="hidden w-56 shrink-0 space-y-1 lg:block">
        {steps.map((s) => {
          const state = states[s.id];
          const status = state?.status ?? 'pending';
          const Icon = ICONS[status];
          const spinning = status === 'previewing' || status === 'importing';
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                  s.id === activeId ? 'bg-accent font-medium' : 'hover:bg-muted',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    spinning && 'animate-spin',
                    status === 'completed' && 'text-success',
                    status === 'error' && 'text-destructive',
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{s.display_name}</span>
                {state?.rowCount != null && (
                  <span className="text-xs tabular-nums text-muted-foreground">{state.rowCount}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

If `text-success` is not an available utility, use `text-foreground` and rely on the badge for
colour — check `FE/tailwind.config.js` before assuming.

- [ ] **Step 2: Write the step panel**

```tsx
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
            disabled={running}
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
            {preview.rows_truncated && ` · showing the first ${preview.rows.length}`}
          </span>
        </div>
      )}

      {state.progress && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
                {Object.keys(preview.rows[0].values).map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.row_number} className="border-t">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row_number}</td>
                  {Object.keys(preview.rows[0].values).map((c) => (
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
```

- [ ] **Step 3: Wire the stepper into the page**

In `TenantImportWizard.tsx`: import `StepRail`, `StepPanel`, and `StepState`; add state and
handlers; replace the `screen === 'steps'` placeholder.

```tsx
const [states, setStates] = useState<Record<string, StepState>>({});
const [activeId, setActiveId] = useState<string>('');
const abortRef = useRef<AbortController | null>(null);

// Only steps whose sheet is usable enter the rail.
const readySteps = useMemo(() => {
  if (!report) return [];
  const ok = new Set(report.steps.filter((s) => s.status === 'ready').map((s) => s.step_id));
  return steps.filter((s) => ok.has(s.id));
}, [report, steps]);

const patch = useCallback((id: string, next: Partial<StepState>) => {
  setStates((prev) => ({
    ...prev,
    [id]: { status: 'pending', options: {}, ...prev[id], ...next },
  }));
}, []);

const runPreview = useCallback(
  async (id: string) => {
    if (!bu || !file) return;
    patch(id, { status: 'previewing', error: undefined });
    try {
      const result = await preconfigImportService.preview(bu.id, id, file, states[id]?.options ?? {});
      patch(id, { status: 'previewed', preview: result, rowCount: result.total_rows });
    } catch (err) {
      const message = parseApiError(err).message;
      patch(id, { status: 'error', error: message });
      toast.error(message);
    }
  },
  [bu, file, patch, states],
);

const runImport = useCallback(
  async (id: string) => {
    if (!bu || !file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    patch(id, { status: 'importing', error: undefined, progress: undefined });
    try {
      const summary = await preconfigImportService.importStream(
        bu.id,
        id,
        file,
        states[id]?.options ?? {},
        (event) => {
          if (event.type === 'start') patch(id, { progress: { index: 0, total: event.total } });
          if (event.type === 'progress') patch(id, { progress: { index: event.index, total: event.total } });
        },
        controller.signal,
      );
      patch(id, { status: summary.failed > 0 ? 'error' : 'completed', summary });
      toast.success(`${id}: ${summary.inserted} inserted, ${summary.skipped} skipped`);
    } catch (err) {
      const message = parseApiError(err).message;
      patch(id, { status: 'error', error: message });
      toast.error(message);
    }
  },
  [bu, file, patch, states],
);

useEffect(() => () => abortRef.current?.abort(), []);
useEffect(() => {
  if (screen === 'steps' && !activeId && readySteps.length > 0) setActiveId(readySteps[0].id);
}, [screen, activeId, readySteps]);
```

And the render branch:

```tsx
{screen === 'steps' && readySteps.length > 0 && activeId && (
  <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
    <StepRail steps={readySteps} states={states} activeId={activeId} onSelect={setActiveId} />
    <StepPanel
      step={readySteps.find((s) => s.id === activeId) as PreconfigStepMeta}
      state={states[activeId] ?? { status: 'pending', options: {} }}
      onPreview={() => runPreview(activeId)}
      onImport={() => runImport(activeId)}
      onOptionsChange={(options) => patch(activeId, { options, preview: undefined, status: 'pending' })}
    />
  </div>
)}
```

Add `useMemo` and `useRef` to the React import.

- [ ] **Step 4: Guard the in-progress run and add the run summary**

Two requirements from spec §10.1 (item 5) and §10.3.

Unsaved-changes guard — a wizard run that has started must warn before the user navigates away:

```tsx
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

// A run is "in progress" once a file is loaded and at least one step has been touched
// but not every touched step has finished.
const runInProgress = useMemo(() => {
  const touched = Object.values(states);
  if (!file || touched.length === 0) return false;
  return touched.some((s) => s.status !== 'completed' && s.status !== 'skipped');
}, [file, states]);

useUnsavedChanges(runInProgress);
```

Read `FE/src/hooks/useUnsavedChanges.ts` first and match its actual signature.

Run summary — under the rail/panel row, render totals across every completed step with a
re-run affordance:

```tsx
{screen === 'steps' && (
  <div className="rounded-md border p-3 text-sm">
    <p className="mb-2 font-medium">Run summary</p>
    {readySteps.filter((s) => states[s.id]?.summary).length === 0 ? (
      <p className="text-xs text-muted-foreground">No step has been imported yet.</p>
    ) : (
      <ul className="space-y-1">
        {readySteps
          .filter((s) => states[s.id]?.summary)
          .map((s) => {
            const sum = states[s.id].summary as PreconfigImportSummary;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-40">{s.display_name}</span>
                <span className="tabular-nums text-muted-foreground">
                  +{sum.inserted} · ~{sum.updated} · skip {sum.skipped} · fail {sum.failed}
                </span>
                <Button variant="ghost" size="sm" onClick={() => runImport(s.id)}>
                  Re-run
                </Button>
              </li>
            );
          })}
      </ul>
    )}
  </div>
)}
```

Import `PreconfigImportSummary` from `../types`.

- [ ] **Step 5: Type-check and run the suite**

```bash
cd FE && npx tsc --noEmit && bun run test
```

Expected: clean, suite green.

- [ ] **Step 6: Commit**

```bash
cd FE && git add src/pages/TenantImportWizard.tsx src/pages/tenantImport/
git commit -m "feat(preconfig-import): add step rail, preview table, and streaming import run"
```

---

### Task 12: Route, navigation, and end-to-end verification

**Files:**
- Modify: `FE/src/App.tsx`
- Modify: `FE/src/components/Layout.tsx`
- Modify: `FE/CLAUDE.md`

**Interfaces:**
- Consumes: `TenantImportWizard` from Tasks 10–11
- Produces: `/tenant-imports` route gated on `data_import.manage`, plus a nav item

- [ ] **Step 1: Add the lazy import and route**

In `FE/src/App.tsx`, follow the file's existing import style for pages and add:

```tsx
<Route
  path="/tenant-imports"
  element={
    <PrivateRoute requiredPermission="data_import.manage">
      <TenantImportWizard />
    </PrivateRoute>
  }
/>
```

Place it next to the `/tenant-migrations` route.

- [ ] **Step 2: Add the nav item**

In `FE/src/components/Layout.tsx`, inside `allNavItems`, right after the Tenant Migrations
entry (line ~55):

```tsx
{ path: '/tenant-imports', label: 'Data Import', icon: FileSpreadsheet, permission: 'data_import.manage', group: 'Organization' },
```

Add `FileSpreadsheet` to the `lucide-react` import at the top of the file.

- [ ] **Step 3: Document the feature**

In `FE/CLAUDE.md`, add a short section after **Configuration Page Pattern**:

```markdown
## Tenant Data Import (Preconfig Wizard)

`src/pages/TenantImportWizard.tsx` + `src/pages/tenantImport/` — a wizard page, not a
Management page: pick a BU (shared `BuSwitcher`), upload `Preconfig.xlsx`, review the File
check report, then run one step at a time. The workbook is re-attached to every request
(the backend keeps no upload session), and all mapping lives in micro-business
(`preconfig-import/preconfig-catalog.ts`) — the client only sends `step_id` + options.
Progress arrives as NDJSON via `preconfigImportService.importStream`. Gated on
`data_import.manage`. Spec: `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`.
```

- [ ] **Step 4: Type-check, test, build**

```bash
cd FE && npx tsc --noEmit && bun run test && bun run build:dev
```

Expected: all three succeed.

- [ ] **Step 5: Manual browser verification against DEV**

```bash
cd FE && bun run dev:dev
```

Confirm, with a disposable BU:
1. `/tenant-imports` is reachable and the nav item appears (log in as a `platform_admin`)
2. A user without `data_import.manage` gets the 403 page and no nav item
3. Upload `Preconfig.xlsx` → the File check table lists all steps with row counts
4. Preview `unit` → 34 rows, all `new` on a fresh tenant
5. Import `unit` → progress bar advances, toast reports the insert count
6. Preview `unit` again → all rows now `duplicate`; import again → `skipped` equals the row count
7. Switch duplicate mode to *Update duplicates* → import reports `updated`, not `skipped`

- [ ] **Step 6: Commit and open the PR**

```bash
cd FE && git add src/App.tsx src/components/Layout.tsx CLAUDE.md
git commit -m "feat(preconfig-import): add /tenant-imports route, nav item, and docs"
git push -u origin feature/preconfig-import-wizard
gh pr create --title "feat(preconfig-import): tenant data import wizard (phase 1)" --body "$(cat <<'EOF'
Adds `/tenant-imports`: pick a BU, upload `Preconfig.xlsx`, check the file, then import
master data step by step with preview, duplicate handling, and NDJSON progress.

Phase 1 ships three lookup-free steps (currency, unit, tax-profile). Requires the backend
PR to be deployed and `seed.platform-permission` / `seed.platform-role-permission` to have
been run on the target environment.

Spec: `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Phase 2 — Full catalog

Start only after Phase 1 is verified on DEV (Task 7 step 4 and Task 12 step 5 both green).

### Task 13: Lookup resolution

**Files:**
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-types.ts`
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-lookup.ts`
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-import.service.ts`

**Interfaces:**
- Consumes: Task 4's service internals
- Produces: `LookupMap` type on `PreconfigStep`; `LookupResolver` class with `.plan(rows)`, `.pendingCreations()`, `.resolve(value, tx)`

- [ ] **Step 1: Extend the step type**

Add to `preconfig-types.ts`:

```ts
/** Resolve an Excel value into a foreign key by querying a lookup table. */
export interface LookupMap {
  excel: string;             // Excel column holding the natural key
  column: string;            // Column on the target table to fill (e.g. delivery_point_id)
  lookupTable: string;       // Table to search (e.g. tb_delivery_point)
  lookupColumn: string;      // Column to match on (e.g. name)
  createIfNotFound?: boolean;
  required?: boolean;        // Row fails when the value is empty
}
```

and add `lookups?: LookupMap[];` to `PreconfigStep`.

- [ ] **Step 2: Write the resolver**

```ts
import type { LookupCreation, LookupMap } from './preconfig-types';
import { normalizeKey } from './preconfig-workbook';

type Db = Record<string, any>;

/**
 * Caches lookup-table contents for one request and reports which values are missing.
 * แคชข้อมูลตารางอ้างอิงต่อหนึ่งคำขอ และรายงานค่าที่ยังไม่มี
 */
export class LookupResolver {
  private readonly cache = new Map<string, Map<string, string>>();
  private readonly missing = new Map<string, Set<string>>();

  constructor(private readonly lookups: LookupMap[]) {}

  /**
   * Load every lookup table referenced by this step.
   * @param db - Tenant client / ไคลเอนต์ผู้เช่า
   */
  async load(db: Db): Promise<void> {
    for (const l of this.lookups) {
      const cacheKey = `${l.lookupTable}.${l.lookupColumn}`;
      if (this.cache.has(cacheKey)) continue;
      const rows: Array<Record<string, unknown>> = await db[l.lookupTable].findMany({
        where: { deleted_at: null },
        select: { id: true, [l.lookupColumn]: true },
      });
      const map = new Map<string, string>();
      for (const r of rows) {
        const key = normalizeKey(String(r[l.lookupColumn] ?? ''));
        if (key && !map.has(key)) map.set(key, String(r.id));
      }
      this.cache.set(cacheKey, map);
    }
  }

  /**
   * Look up one value without creating anything.
   * @param lookup - Lookup mapping / การจับคู่การค้นหา
   * @param value - Natural key from the sheet / ค่าจากชีต
   * @returns The foreign id, or undefined / id อ้างอิง หรือ undefined
   */
  find(lookup: LookupMap, value: string): string | undefined {
    const key = normalizeKey(value);
    if (!key) return undefined;
    return this.cache.get(`${lookup.lookupTable}.${lookup.lookupColumn}`)?.get(key);
  }

  /**
   * Record a value that has no match yet.
   * @param lookup - Lookup mapping / การจับคู่การค้นหา
   * @param value - Missing value / ค่าที่ไม่พบ
   */
  noteMissing(lookup: LookupMap, value: string): void {
    const key = `${lookup.lookupTable} ${lookup.lookupColumn}`;
    const set = this.missing.get(key) ?? new Set<string>();
    set.add(value.trim());
    this.missing.set(key, set);
  }

  /**
   * Values that would be auto-created, for preview acceptance.
   * @returns Pending creations grouped by table / รายการที่จะถูกสร้าง
   */
  pendingCreations(): LookupCreation[] {
    return [...this.missing.entries()].map(([key, values]) => {
      const [table, column] = key.split(' ');
      return { table, column, values: [...values].sort() };
    });
  }

  /**
   * Create a missing lookup row inside the caller's transaction and cache it.
   * @param db - Transaction client / ไคลเอนต์ทรานแซกชัน
   * @param lookup - Lookup mapping / การจับคู่การค้นหา
   * @param value - Value to create / ค่าที่จะสร้าง
   * @param actor_id - Caller user id / id ผู้เรียก
   * @returns The new row id / id ของแถวใหม่
   */
  async create(db: Db, lookup: LookupMap, value: string, actor_id: string | null): Promise<string> {
    const created = await db[lookup.lookupTable].create({
      data: { [lookup.lookupColumn]: value.trim(), created_by_id: actor_id ?? undefined, updated_by_id: actor_id ?? undefined },
      select: { id: true },
    });
    this.cache
      .get(`${lookup.lookupTable}.${lookup.lookupColumn}`)
      ?.set(normalizeKey(value), String(created.id));
    return String(created.id);
  }
}
```

- [ ] **Step 3: Use the resolver in preview and import**

In `preconfig-import.service.ts`:

- In `preview`: construct `new LookupResolver(step.lookups ?? [])`, `await resolver.load(db)`
  before the row loop; per row, for each lookup, `find()` the value — on a miss with
  `createIfNotFound` call `noteMissing()`, otherwise push a row error
  `Lookup failed: <lookupTable>.<lookupColumn> = "<value>"` and mark the row `error`.
  Return `resolver.pendingCreations()` in `lookups_to_create`.
- In `importStream`: same load; inside the batch transaction, resolve each lookup — on a miss
  with `createIfNotFound && options.accept_lookup_creation` call `resolver.create(tx, …)` and
  increment `summary.lookups_created`; on a miss with `createIfNotFound` but **without**
  acceptance, fail the row with `Unaccepted new lookup value: "<value>"`; otherwise fail the
  row with the same `Lookup failed:` message. Write the resolved id into
  `values[lookup.column]`.

- [ ] **Step 4: Type-check and commit**

```bash
cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit
git add apps/micro-business/src/preconfig-import/
git commit -m "feat(preconfig-import): resolve lookups with opt-in auto-creation"
```

---

### Task 14: Catalog steps 5–10 (delivery point → item group)

**Files:**
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-catalog.ts`

**Interfaces:**
- Consumes: `LookupMap` from Task 13
- Produces: catalog entries `delivery-point`, `department`, `location`, `product-category`, `product-subcategory`, `item-group`

- [ ] **Step 1: Append the six steps**

Transcribe spec §8.1 exactly. Three of them share the `Item Group` sheet — that is intentional
and not a mistake to "fix".

```ts
  {
    id: 'delivery-point',
    sheetName: 'Delivery Point',
    tableName: 'tb_delivery_point',
    displayName: 'Delivery Points',
    description: 'Delivery locations',
    target: 'tenant',
    columns: [{ excel: 'Code', column: 'name', kind: 'string', required: true }],
    duplicateKey: ['name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'department',
    sheetName: 'Department',
    tableName: 'tb_department',
    displayName: 'Departments',
    description: 'Organization departments',
    target: 'tenant',
    columns: [
      { excel: 'Code', column: 'code', kind: 'string', required: true },
      { excel: 'Description', column: 'name', kind: 'string', required: true },
    ],
    duplicateKey: ['code'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'location',
    sheetName: 'Store Location',
    tableName: 'tb_location',
    displayName: 'Store Locations',
    description: 'Storage and inventory locations (creates delivery points when missing)',
    target: 'tenant',
    columns: [
      { excel: 'Store Code', column: 'code', kind: 'string', required: true },
      { excel: 'Store Name', column: 'name', kind: 'string', required: true },
      { excel: 'Delivery Point', column: 'delivery_point_name', kind: 'string' },
    ],
    lookups: [
      {
        excel: 'Delivery Point',
        column: 'delivery_point_id',
        lookupTable: 'tb_delivery_point',
        lookupColumn: 'name',
        createIfNotFound: true,
      },
    ],
    duplicateKey: ['code'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'product-category',
    sheetName: 'Item Group',
    tableName: 'tb_product_category',
    displayName: 'Product Categories',
    description: 'Main product categories (FOOD, BEVERAGE, …)',
    target: 'tenant',
    columns: [
      { excel: 'Category Code', column: 'code', kind: 'string', required: true },
      { excel: 'Category Description', column: 'name', kind: 'string', required: true },
    ],
    duplicateKey: ['code', 'name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'product-subcategory',
    sheetName: 'Item Group',
    tableName: 'tb_product_sub_category',
    displayName: 'Product Subcategories',
    description: 'Product subcategories (resolved against categories)',
    target: 'tenant',
    columns: [
      { excel: 'Subcategory Code', column: 'code', kind: 'string', required: true },
      { excel: 'Subcategory Description', column: 'name', kind: 'string', required: true },
    ],
    lookups: [
      {
        excel: 'Category Code',
        column: 'product_category_id',
        lookupTable: 'tb_product_category',
        lookupColumn: 'code',
        required: true,
      },
    ],
    duplicateKey: ['code', 'name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
  {
    id: 'item-group',
    sheetName: 'Item Group',
    tableName: 'tb_product_item_group',
    displayName: 'Item Groups',
    description: 'Detailed item groups (resolved against subcategories)',
    target: 'tenant',
    columns: [
      { excel: 'Item Group Code', column: 'code', kind: 'string', required: true },
      { excel: 'Item Group Description', column: 'name', kind: 'string', required: true },
      { excel: 'Quantity Deviation %', column: 'qty_deviation_limit', kind: 'decimal' },
      { excel: 'Price Deviation %', column: 'price_deviation_limit', kind: 'decimal' },
      { excel: 'Tax Profile', column: 'tax_profile_name', kind: 'string' },
    ],
    lookups: [
      {
        excel: 'Subcategory Code',
        column: 'product_subcategory_id',
        lookupTable: 'tb_product_sub_category',
        lookupColumn: 'code',
        required: true,
      },
    ],
    duplicateKey: ['code', 'name'],
    defaultDuplicateMode: 'skip',
    supportsClear: true,
  },
```

- [ ] **Step 2: Verify the column names against the live schema**

```bash
cd BE/packages/prisma-shared-schema-tenant/prisma
for m in tb_delivery_point tb_department tb_location tb_product_category tb_product_sub_category tb_product_item_group; do
  echo "=== $m ==="; awk -v m="model $m {" 'index($0,m)==1,/^}/' schema.prisma | grep -vE "^\s*(tb|@@)" | head -20
done
```

Fix any column that does not exist (e.g. confirm `tb_location.delivery_point_name` and
`tb_product_item_group.product_subcategory_id` are spelled exactly as written above). The
schema wins over this plan.

- [ ] **Step 3: Populate `creates_lookups` metadata**

In `toStepMetadata`, replace the hard-coded empty array:

```ts
    creates_lookups: (step.lookups ?? []).filter((l) => l.createIfNotFound).map((l) => l.lookupTable),
```

- [ ] **Step 4: Type-check and commit**

```bash
cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit
git add apps/micro-business/src/preconfig-import/preconfig-catalog.ts
git commit -m "feat(preconfig-import): add delivery point through item group steps"
```

---

### Task 15: Related inserts, then products and vendors

**Files:**
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-types.ts`
- Create: `BE/apps/micro-business/src/preconfig-import/preconfig-related.ts`
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-import.service.ts`
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-catalog.ts`

**Interfaces:**
- Consumes: `LookupResolver` from Task 13
- Produces: `RelatedInsert` type; `buildRelatedRows(step, headers, row, parentId, resolver)`; catalog entries `product`, `vendor`

- [ ] **Step 1: Add the related-insert types**

```ts
/** Where one column of a related row gets its value. */
export type RelatedSource = 'excel' | 'lookup' | 'static' | 'parent_id' | 'jsonb';

/** One column of a related row. */
export interface RelatedColumn {
  column: string;
  source: RelatedSource;
  excel?: string;
  lookup?: { excel: string; lookupTable: string; lookupColumn: string };
  staticValue?: string | number | boolean;
  jsonbFields?: Array<{ jsonKey: string; excel: string }>;
  kind?: ColumnKind;
}

/** A dependent row written after its parent. */
export interface RelatedInsert {
  tableName: string;
  parentColumn: string;                 // FK column pointing at the parent
  condition?: { excelColumns: string[] }; // all must be non-empty
  columns: RelatedColumn[];
}
```

and add `relatedInserts?: RelatedInsert[];` to `PreconfigStep`.

- [ ] **Step 2: Write the builder**

Create `preconfig-related.ts`:

```ts
import type { LookupMap, PreconfigStep, RelatedColumn } from './preconfig-types';
import { normalizeKey } from './preconfig-workbook';
import type { LookupResolver } from './preconfig-lookup';

/** One dependent row ready to be written. */
export interface RelatedRow {
  tableName: string;
  data: Record<string, unknown>;
}

/** Either the rows to write, or the reason the parent row must fail. */
export interface RelatedBuildResult {
  rows: RelatedRow[];
  error?: string;
}

/**
 * Build every dependent row for one parent row.
 * สร้างแถวที่เกี่ยวข้องทั้งหมดสำหรับแถวแม่หนึ่งแถว
 * @param step - Catalog step / ขั้นตอน
 * @param headers - Sheet header row / แถวหัวตาราง
 * @param row - Sheet data row / แถวข้อมูล
 * @param parentId - Id of the row just inserted / id ของแถวแม่
 * @param resolver - Loaded lookup resolver / ตัวค้นหาที่โหลดแล้ว
 * @returns Rows to insert, or an error / แถวที่จะเพิ่ม หรือข้อผิดพลาด
 */
export function buildRelatedRows(
  step: PreconfigStep,
  headers: string[],
  row: string[],
  parentId: string,
  resolver: LookupResolver,
): RelatedBuildResult {
  const index = new Map(headers.map((h, i) => [normalizeKey(h), i]));
  const cell = (excel?: string): string =>
    excel === undefined ? '' : (row[index.get(normalizeKey(excel)) ?? -1] ?? '').trim();

  const rows: RelatedRow[] = [];

  for (const rel of step.relatedInserts ?? []) {
    const conditionMet = (rel.condition?.excelColumns ?? []).every((c) => cell(c) !== '');
    if (rel.condition && !conditionMet) continue;

    const data: Record<string, unknown> = { [rel.parentColumn]: parentId };

    for (const col of rel.columns) {
      const built = buildColumn(col, cell, resolver);
      if (built.error) return { rows: [], error: built.error };
      if (built.value !== undefined) data[col.column] = built.value;
    }
    rows.push({ tableName: rel.tableName, data });
  }
  return { rows };
}

/**
 * Resolve one column of a dependent row.
 * @param col - Column definition / นิยามคอลัมน์
 * @param cell - Sheet cell accessor / ตัวอ่านเซลล์
 * @param resolver - Lookup resolver / ตัวค้นหา
 * @returns Value or error / ค่าหรือข้อผิดพลาด
 */
function buildColumn(
  col: RelatedColumn,
  cell: (excel?: string) => string,
  resolver: LookupResolver,
): { value?: unknown; error?: string } {
  switch (col.source) {
    case 'parent_id':
      return {}; // already set from rel.parentColumn
    case 'static':
      return { value: col.staticValue };
    case 'excel': {
      const raw = cell(col.excel);
      if (raw === '') return {};
      if (col.kind === 'decimal' || col.kind === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return { error: `"${raw}" is not a number (${col.column})` };
        return { value: col.kind === 'number' ? Math.trunc(n) : n };
      }
      return { value: raw };
    }
    case 'lookup': {
      if (!col.lookup) return { error: `Missing lookup config for ${col.column}` };
      const raw = cell(col.lookup.excel);
      if (raw === '') return {};
      const map: LookupMap = {
        excel: col.lookup.excel,
        column: col.column,
        lookupTable: col.lookup.lookupTable,
        lookupColumn: col.lookup.lookupColumn,
      };
      const id = resolver.find(map, raw);
      if (!id) {
        return { error: `Lookup failed: ${map.lookupTable}.${map.lookupColumn} = "${raw}"` };
      }
      return { value: id };
    }
    case 'jsonb': {
      const obj: Record<string, string> = {};
      for (const f of col.jsonbFields ?? []) {
        const v = cell(f.excel);
        if (v !== '') obj[f.jsonKey] = v;
      }
      return Object.keys(obj).length > 0 ? { value: obj } : {};
    }
    default:
      return {};
  }
}
```

Related-row lookups reuse the parent step's already-loaded resolver, so every lookup table
referenced by a `relatedInserts` entry must **also** appear in the step's top-level `lookups`
array (with the same `lookupTable`/`lookupColumn`) or `resolver.find` will miss. For `product`
that means `tb_unit.name` is already loaded by the `Inventory Unit` lookup — the `Order unit`
and `Recipe unit` conversions hit the same cached table.

- [ ] **Step 3: Call it from the import loop**

After each parent `create()` in `importStream`, build and write the related rows in the same
`tx`. In `upsert` mode, first soft-delete existing related rows for that parent
(`tx[rel.tableName].updateMany({ where: { [rel.parentColumn]: parentId, deleted_at: null }, data: { deleted_at: new Date() } })`)
so conversions and contacts do not accumulate. Never write related rows for a row that was
skipped as a duplicate.

- [ ] **Step 4: Add the product and vendor catalog entries**

Transcribe spec §8.1, including `inventory_unit_name` (non-null with a `""` default — always
write the Excel `Inventory Unit` text into it) and the two `tb_unit_conversion` inserts with
their `order_unit` / `recipe_unit` types, plus `tb_vendor_contact` and the JSONB
`tb_vendor_address`. Verify every column against the schema the same way as Task 14 step 2 —
in particular `tb_unit_conversion`, `tb_vendor_contact`, and `tb_vendor_address`.

- [ ] **Step 5: Type-check and commit**

```bash
cd BE && npx tsc -p apps/micro-business/tsconfig.json --noEmit
git add apps/micro-business/src/preconfig-import/
git commit -m "feat(preconfig-import): add related inserts plus product and vendor steps"
```

---

### Task 16: Clear-existing with typed confirmation (frontend)

**Files:**
- Modify: `FE/src/pages/tenantImport/StepPanel.tsx`
- Modify: `FE/src/pages/TenantImportWizard.tsx`

**Interfaces:**
- Consumes: `clear_existing` option and `clear_will_soft_delete` from the preview
- Produces: a guarded toggle that can only be enabled after typing the BU code

- [ ] **Step 1: Add the guarded toggle**

In `StepPanel`, when `step.supports_clear`, render a checkbox labelled
*Soft-delete existing rows first*. Enabling it opens a `<ConfirmDialog>` whose body states the
exact count from `state.preview?.clear_will_soft_delete` and requires typing the BU code
(passed in as a new `buCode` prop) into an `<Input>` before Confirm becomes enabled. Cancel
leaves the checkbox off. Use `ConfirmDialog` from `FE/src/components/ui/confirm-dialog.tsx` —
read its props before wiring; **never** `window.confirm`.

Copy for the dialog:

> This soft-deletes **{count}** existing rows in `{step.table_name}` for **{buCode}** by setting
> `deleted_at`. Existing documents that reference them keep working. Type the BU code to confirm.

- [ ] **Step 2: Thread the option through**

`onOptionsChange({ ...state.options, clear_existing: true })` on confirm; clearing the checkbox
sets it back to `false`. Changing it must invalidate the current preview (the page already
resets `preview` and `status` in `onOptionsChange`).

- [ ] **Step 3: Verify manually**

`bun run dev:dev`, then on a BU with existing units: enable the toggle, confirm the count shown
matches `SELECT count(*) FROM tb_unit WHERE deleted_at IS NULL`, run the import, and check that
old rows now have `deleted_at` set while the new rows are active.

- [ ] **Step 4: Type-check, test, commit**

```bash
cd FE && npx tsc --noEmit && bun run test
git add src/pages/tenantImport/StepPanel.tsx src/pages/TenantImportWizard.tsx
git commit -m "feat(preconfig-import): guard clear-existing behind typed BU confirmation"
```

---

### Task 17: Lookup-creation acceptance (frontend)

**Files:**
- Modify: `FE/src/pages/tenantImport/StepPanel.tsx`
- Modify: `FE/src/pages/TenantImportWizard.tsx`

**Interfaces:**
- Consumes: `preview.lookups_to_create`
- Produces: `accept_lookup_creation` option, required before Import is enabled when creations are pending

- [ ] **Step 1: Render the pending creations**

When `preview.lookups_to_create.length > 0`, render a bordered block above the preview table:

> **New reference data will be created**
> `tb_delivery_point.name`: Kitchen, Bar, Store
> ☐ Create these {n} values

Import stays disabled until the checkbox is ticked; ticking it sets
`accept_lookup_creation: true` in the step options. Because ticking it must **not** discard the
preview, add a second handler (`onAcceptLookups`) rather than reusing `onOptionsChange`, which
resets the preview.

- [ ] **Step 2: Verify manually**

Edit one `Delivery Point` cell in a copy of the workbook to a value that does not exist, upload
it, preview `location`, and confirm the value is listed, that Import is blocked, and that after
accepting, the import reports `lookups_created: 1`.

- [ ] **Step 3: Type-check, test, commit**

```bash
cd FE && npx tsc --noEmit && bun run test
git add src/pages/tenantImport/
git commit -m "feat(preconfig-import): require acceptance before auto-creating lookup values"
```

---

### Task 18: Company Profile diff step

**Files:**
- Create: `FE/src/pages/tenantImport/CompanyProfilePanel.tsx`
- Modify: `FE/src/pages/TenantImportWizard.tsx`
- Modify: `BE/apps/micro-business/src/preconfig-import/preconfig-catalog.ts`

**Interfaces:**
- Consumes: `businessUnitService.getById/update`, `getDocVersion`, `isVersionConflict`, `notifyVersionConflict` from `FE/src/utils/docVersion.ts`
- Produces: `CompanyProfilePanel` rendering a field-by-field diff with a confirm action

- [ ] **Step 1: Add the platform-target catalog entry**

Add `company-profile` as the **first** catalog entry with `target: 'platform'` and the
corrected columns from spec §8.1, so it appears in `GET /steps` and in the File check report.
Set `supportsClear: false`, `duplicateKey: ['code']`, `defaultDuplicateMode: 'upsert'`.

`preview` stays available for this step — it only reads the workbook and, for a platform step,
must skip the tenant round-trip entirely. At the top of `preview`, before `resolveConnection`:

```ts
if (step.target === 'platform') {
  const sheets = await parseWorkbook(file);
  const sheet = findSheet(sheets, step);
  if (!sheet) {
    return Result.error(`Sheet "${step.sheetName}" not found in workbook`, ErrorCode.VALIDATION_FAILURE);
  }
  const rows: PreviewRow[] = sheet.rows.slice(0, PREVIEW_ROW_CAP).map((raw, i) => {
    const { values, errors } = coerceRow(step, sheet.headers, raw);
    return { row_number: i + 2, verdict: errors.length ? 'error' : 'new', values, errors };
  });
  return Result.ok({
    step_id: step.id,
    total_rows: sheet.rows.length,
    counts: {
      new: rows.filter((r) => r.verdict === 'new').length,
      duplicate: 0,
      error: rows.filter((r) => r.verdict === 'error').length,
    },
    clear_will_soft_delete: 0,
    lookups_to_create: [],
    rows,
    rows_truncated: sheet.rows.length > PREVIEW_ROW_CAP,
  });
}
```

`importStream` **must refuse** it — the write happens client-side through
`businessUnitService`. At the top of the `run()` body, right after `getStep`:

```ts
if (step.target !== 'tenant') {
  subscriber.error(new Error(`Step ${step.id} is applied by the client, not the importer`));
  return;
}
```

- [ ] **Step 2: Build the diff panel**

`CompanyProfilePanel` calls `preconfigImportService.preview(bu.id, 'company-profile', file)` to
get the sheet's single row, and `businessUnitService.getById(bu.id)` for the current record. It
renders one line per mapped column: label, current BU value, workbook value, and a
`Changed` / `Same` badge; a column that exists in the sheet but not on `BusinessUnit`
(Inventory Cost Type) renders as `Not applied`. A single **Apply to BU** button calls:

```ts
await businessUnitService.update(bu.id, {
  ...changedFields,
  ...(docVersion != null ? { doc_version: docVersion } : {}),
});
```

with `docVersion` captured from the `getById` response via `getDocVersion`. On 409, branch with
`isVersionConflict(err)` → `notifyVersionConflict()` + refetch the BU, per `FE/CLAUDE.md` rule 17.

- [ ] **Step 3: Route the step in the wizard**

In `TenantImportWizard`, when the active step's `target === 'platform'`, render
`CompanyProfilePanel` instead of `StepPanel`.

- [ ] **Step 4: Verify manually**

Upload the workbook against a BU whose `hotel_name` differs from the sheet: confirm the diff
marks exactly the changed fields, applying updates the BU, and re-opening shows every field as
`Same`.

- [ ] **Step 5: Type-check, test, commit**

```bash
cd FE && npx tsc --noEmit && bun run test
git add src/pages/tenantImport/CompanyProfilePanel.tsx src/pages/TenantImportWizard.tsx
cd ../carmen-turborepo-backend-v2 && git add apps/micro-business/src/preconfig-import/
git commit -m "feat(preconfig-import): add Company Profile diff step"
```

(Commit each repo separately — they are different repositories.)

---

### Task 19: Full-catalog verification and documentation

**Files:**
- Modify: `FE/CLAUDE.md`
- Modify: `FE/docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md` (status line only)

**Interfaces:**
- Consumes: Tasks 13–18
- Produces: a verified 12-step run and updated docs

- [ ] **Step 1: Full-workbook run on a disposable DEV BU**

Run every step in catalog order against a freshly seeded BU using `Preconfig.xlsx`. Record
inserted/skipped/failed per step. Expected orders of magnitude: Unit 34, Tax Profile 2,
Delivery Point 1, Department 55, Store Location 40, Item Group ~134 across the three
category steps, Product 2,589, Vendor 998.

- [ ] **Step 2: Re-run the whole catalog**

Expected: every step reports `inserted: 0` and `skipped` equal to its row count — the import is
idempotent. Any step that inserts on the second pass has a duplicate-key bug; fix it before
proceeding.

- [ ] **Step 3: Spot-check referential integrity**

```sql
SELECT count(*) FROM tb_product WHERE inventory_unit_id IS NULL AND deleted_at IS NULL;
SELECT count(*) FROM tb_unit_conversion WHERE deleted_at IS NULL;
SELECT count(*) FROM tb_vendor_address WHERE deleted_at IS NULL;
SELECT count(*) FROM tb_activity WHERE entity_type = 'preconfig_import';
```

Expected: no products with a null inventory unit; unit conversions and vendor addresses
present; one activity row per executed step across both runs.

- [ ] **Step 4: Update the docs**

Set the spec's status line to `Implemented (phases 1–2)` and extend the `FE/CLAUDE.md` section
from Task 12 step 3 with the final step list and the note that Company Profile writes to the
platform database through `businessUnitService`, not through the import endpoint.

- [ ] **Step 5: Commit and update the PRs**

```bash
cd FE && git add CLAUDE.md docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md
git commit -m "docs(preconfig-import): record phase 2 verification results"
git push
cd ../carmen-turborepo-backend-v2 && git push
```

---

## Verification summary

| Gate | Command / action | Blocking? |
|------|------------------|-----------|
| Backend types | `npx tsc -p apps/<app>/tsconfig.json --noEmit` | yes, every backend task |
| Gateway boot | scoped jest run of `preconfig-imports.module.spec.ts` | yes, Task 6 |
| NDJSON stream on DEV | Task 7 step 4 | **yes — design gate for Phase 2** |
| Frontend types | `npx tsc --noEmit` | yes, every frontend task |
| Frontend suite | `bun run test` | yes, Tasks 9, 11, 12, 16, 17, 18 |
| Frontend build | `bun run build:dev` | yes, Task 12 |
| Browser walkthrough | Task 12 step 5 | yes |
| Idempotent re-run | Task 19 step 2 | yes |
