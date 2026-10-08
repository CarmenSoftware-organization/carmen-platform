# Report Template — Versions, Backup/Import, i18n Name/Description — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User override (`~/.claude/CLAUDE.md`):** skip every "write failing test / run test" step — implement, type-check, lint, commit. Do **not** create new `*.spec.ts` / `*.test.ts` files. Existing suites must still pass (fix existing mocks if a change breaks them). Static checks are not tests — always run them.

**Goal:** Every save of a report template becomes a viewable/diffable/restorable version; templates export to JSON one-by-one or in batch and import back; name and description gain EN/TH.

**Architecture:** Backend (`carmen-turborepo-backend-v2`) adds `name_i18n`/`description_i18n` columns, a `tb_report_template_version` snapshot table written inside the same `$transaction` as each create/update/restore, three version endpoints, and fixes six fields create/update silently drop. Frontend (`carmen-platform`) adds EN/TH inputs, a versions Sheet with a `@codemirror/merge` XML diff and restore, and a backup/import flow that runs entirely client-side over the existing create/update endpoints.

**Tech Stack:** NestJS + Prisma + zod v4 (backend), React 19 + Vite + shadcn/ui + CodeMirror 6 (frontend), Bun.

**Spec:** `docs/superpowers/specs/2026-10-08-report-template-versions-backup-design.md` (carmen-platform) — read it before starting any task.

## Global Constraints

- Backend repo: `../carmen-turborepo-backend-v2`, branch **`feature/report-template-versions-i18n`** (create from fresh `main`). Never commit to `main`. Subagents working there must be told the branch name explicitly.
- Frontend repo: `carmen-platform`, branch **`feature/report-template-versions-backup`** (already exists, holds the spec + this plan).
- **Do not push the backend branch until Task B5** — any push of a branch carrying a migration applies it to DEV within ~2 minutes.
- Version number = `doc_version` of the main row **after** the write (the platform Prisma extension auto-increments it — read it back, never compute it).
- `snapshot` fields (exact list, order irrelevant): `name, name_i18n, description, description_i18n, report_group, template_type, dialog, content, builder_key, view_name, source_type, source_name, source_params, orientation, signature_config, is_standard, is_default, is_active, allow_business_unit, deny_business_unit`.
- `change_type` ∈ `create | update | restore | import`. Clients may send only `'import'`; any other value is ignored.
- Restore and import **never change `is_default`** of an existing row; import-created rows get `is_default: false`.
- `name_i18n.en` is required and equals `name` (still the unique key, still what search/import matching uses). `description_i18n` may hold `th` only → `description = null`.
- Backup file: `format: "carmen.report-template-backup"`, `format_version: 1`; single = `report-template_{slug}_v{version}_{YYYY-MM-DD}.json`, batch = `report-templates_{n}_{YYYY-MM-DD}.json`; max import size 10 MB.
- Export fetch concurrency 4; import runs strictly sequentially.
- FE rules from `CLAUDE.md`: `toast.*` not `alert`; `<ConfirmDialog>` not `confirm`; `<Can>` for permission gating; catch blocks use `getErrorDetail`/`isNotFoundError`/`isVersionConflict`; no edits under `src/components/ui/`; every user-visible string goes through `t()` with keys in **both** `src/i18n/en.ts` and `src/i18n/th.ts`.
- Backend: use `bunx eslint <files>` — **never** `bun run lint` (rewrites the whole repo).

## Review Focus

1. **Snapshot written but main row write fails (or vice-versa)** — must be one `$transaction`; a 409 must leave no orphan version row. Owner: Task B3 (step verifies via curl with a stale `doc_version`).
2. **Old client sends only `name`/`description`** (e.g. inventory app, older carmen-platform build) — `name_i18n.th`/`description_i18n.th` must survive. Owner: Task B2 (curl step).
3. **Restoring a snapshot taken before i18n existed / with a name now used by another template** — must derive i18n from plain columns, and must return `REPORT_TEMPLATE_NAME_ALREADY_EXISTS`, not a 500. Owner: Task B4 (curl steps).
4. **Import file with one bad entry among good ones / a file from a newer format / non-JSON** — bad entry locked to skip with a reason, others proceed; whole-file errors stop at the picker. Owner: Task F4 (manual steps).
5. **Restore while the Edit form has unsaved changes** — button disabled; and export from Edit while dirty exports the *saved* record. Owner: Tasks F3 and F6.

---

# Part 1 — Backend (`carmen-turborepo-backend-v2`)

All paths in Part 1 are relative to `../carmen-turborepo-backend-v2`.

### Task B1: Persist the six silently-dropped fields

**Files:**
- Modify: `apps/backend-gateway/src/common/dto/report-template/report-template.dto.ts`
- Modify: `apps/micro-cluster/src/cluster/report-template/interface/report-template.interface.ts`
- Modify: `apps/micro-cluster/src/cluster/report-template/report-template.service.ts` (create `:226-240`, update `:287-301`)

**Interfaces:**
- Produces: DTO + `IReportTemplateUpdate` accept `builder_key?, source_type?, source_name?, source_params?, orientation?, signature_config?`.

- [ ] **Step 1: Branch**

```bash
cd ../carmen-turborepo-backend-v2
git checkout main && git pull --ff-only && git checkout -b feature/report-template-versions-i18n
```

- [ ] **Step 2: Confirm the bug before fixing (manual, local backend)**

Start the stack locally, then with a valid platform token (`$TOKEN`, `$APP_ID`) and an existing template id (`$ID`, `$V` = its `doc_version`):

```bash
curl -s -X PUT "http://localhost:4000/api-system/report-templates/$ID" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" -H 'content-type: application/json' \
  -d "{\"doc_version\": $V, \"source_name\": \"probe_view_xyz\"}"
curl -s "http://localhost:4000/api-system/report-templates/$ID" -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APP_ID" | jq '.data.source_name'
```

Expected today: **not** `"probe_view_xyz"`. If it *is* saved, stop and report — the spec's §0.1 premise is wrong.

- [ ] **Step 3: Extend both zod schemas**

In `report-template.dto.ts`, add to **both** `ReportTemplateCreateSchema` and `ReportTemplateUpdateSchema` (before the closing `})`):

```ts
  builder_key: z.string().max(100).optional().meta({
    example: 'pr-summary',
    description: 'Go report.Definition key; empty string when not linked',
  }),
  source_type: z.enum(['view', 'function', 'procedure']).optional().meta({
    example: 'view',
    description: 'How the executor reads data: view | function | procedure',
  }),
  source_name: z.string().nullable().optional().meta({
    example: 'v_inventory_valuation',
    description: 'Bare identifier of the view / function / procedure',
  }),
  source_params: z
    .object({
      params: z.array(
        z.object({ filter: z.string(), type: z.string().optional(), nullable: z.boolean().optional() }),
      ),
    })
    .optional()
    .meta({ example: { params: [] }, description: 'Positional argument mapping' }),
  orientation: z.enum(['portrait', 'landscape']).optional().meta({
    example: 'portrait',
    description: 'Page orientation for print layouts',
  }),
  signature_config: z
    .object({
      blocks: z.array(
        z.object({ key: z.string(), label: z.string(), required: z.boolean().optional() }),
      ),
    })
    .optional()
    .meta({ example: { blocks: [] }, description: 'Labelled signature blocks on the print layout' }),
```

- [ ] **Step 4: Extend `IReportTemplateUpdate`**

Append to the interface in `interface/report-template.interface.ts`:

```ts
  builder_key?: string;
  source_type?: 'view' | 'function' | 'procedure';
  source_name?: string | null;
  source_params?: unknown;
  orientation?: 'portrait' | 'landscape';
  signature_config?: unknown;
```

- [ ] **Step 5: Write them in the service**

In `create`'s `data:` add:

```ts
        builder_key: data.builder_key ?? '',
        source_type: data.source_type ?? 'view',
        source_name: data.source_name ?? null,
        source_params: (data.source_params ?? { params: [] }) as Prisma.InputJsonValue,
        orientation: data.orientation ?? 'portrait',
        signature_config: (data.signature_config ?? { blocks: [] }) as Prisma.InputJsonValue,
```

In `update`'s `data:` add (undefined = leave unchanged):

```ts
        builder_key: data.builder_key,
        source_type: data.source_type,
        source_name: data.source_name,
        source_params: data.source_params as Prisma.InputJsonValue | undefined,
        orientation: data.orientation,
        signature_config: data.signature_config as Prisma.InputJsonValue | undefined,
```

- [ ] **Step 6: Static checks + existing tests**

```bash
bun run --cwd apps/micro-cluster check-types
bun run --cwd apps/backend-gateway check-types
bunx eslint apps/micro-cluster/src/cluster/report-template apps/backend-gateway/src/common/dto/report-template
cd apps/micro-cluster && bunx jest src/cluster/report-template --runInBand --forceExit; cd ../..
```

Expected: all clean/green. Then repeat Step 2's curl → now returns `"probe_view_xyz"`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend-gateway/src/common/dto/report-template apps/micro-cluster/src/cluster/report-template
git commit -m "fix(report-template): บันทึก builder_key/source_*/orientation/signature_config ที่เคยหายเงียบตอน create/update"
```

### Task B2: `name_i18n` / `description_i18n`

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20261008110000_report_template_name_description_i18n/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma` (`model tb_report_template`, after `description`)
- Create: `apps/micro-cluster/src/cluster/report-template/report-template-i18n.ts`
- Modify: DTO, interface, service (same three files as B1)

**Interfaces:**
- Produces (`report-template-i18n.ts`):
  - `type LocalizedText = { en?: string; th?: string }`
  - `normalizeI18n(value: unknown): LocalizedText | null`
  - `resolveNameWrite(data: { name?: string; name_i18n?: unknown }, current?: unknown): { name?: string; name_i18n?: Prisma.InputJsonObject }`
  - `resolveDescriptionWrite(data: { description?: string | null; description_i18n?: unknown }, current?: unknown): { description?: string | null; description_i18n?: Prisma.InputJsonObject | typeof Prisma.DbNull }`

- [ ] **Step 1: Migration**

```sql
-- 20261008110000_report_template_name_description_i18n
-- ชื่อ/คำอธิบายหลายภาษา {en?, th?} — ขั้น expand: คอลัมน์ name/description เดิมยังอยู่และถูก dual-write (= *_i18n.en)
-- ต้องรันก่อน 20261008120000_report_template_version เพื่อให้ snapshot ที่ backfill มีฟิลด์ i18n
ALTER TABLE "tb_report_template" ADD COLUMN IF NOT EXISTS "name_i18n" JSONB;
ALTER TABLE "tb_report_template" ADD COLUMN IF NOT EXISTS "description_i18n" JSONB;

UPDATE "tb_report_template"
   SET "name_i18n" = jsonb_build_object('en', btrim("name"))
 WHERE "name_i18n" IS NULL AND btrim("name") <> '';

UPDATE "tb_report_template"
   SET "description_i18n" = jsonb_build_object('en', btrim("description"))
 WHERE "description_i18n" IS NULL AND "description" IS NOT NULL AND btrim("description") <> '';
```

- [ ] **Step 2: Prisma schema** — after `description  String?` add:

```prisma
  // name_i18n / description_i18n — {en?, th?}. name stays the unique key and is dual-written = name_i18n.en
  name_i18n        Json? @db.JsonB
  description_i18n Json? @db.JsonB
```

Run `bun run --cwd packages/prisma-shared-schema-platform build` (and the package's prisma generate step if `build` doesn't include it — check `package.json` scripts) so `tsc` sees the new fields; stale `dist/*.d.ts` produces fake type errors.

- [ ] **Step 3: Helper `report-template-i18n.ts`**

```ts
import { Prisma } from '@repo/prisma-shared-schema-platform';

const LOCALES = ['en', 'th'] as const;

export type LocalizedText = { en?: string; th?: string };

/**
 * Trims an i18n value and drops blank locales; null when nothing remains
 * ตัดช่องว่างและภาษาที่ว่างออก — ไม่เหลือภาษาใดคืน null
 */
export function normalizeI18n(value: unknown): LocalizedText | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = value as Record<string, unknown>;
  const out: LocalizedText = {};
  for (const locale of LOCALES) {
    const text = src[locale];
    if (typeof text === 'string' && text.trim()) out[locale] = text.trim();
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Name columns to write: name_i18n wins (en required); a legacy plain name merges into the stored i18n so TH survives
 * คอลัมน์ name ที่ต้องเขียน — name_i18n มาก่อน (ต้องมี en); name เดี่ยวของ client เก่า merge ลง i18n เดิมเพื่อไม่ให้ TH หาย
 */
export function resolveNameWrite(
  data: { name?: string; name_i18n?: unknown },
  current?: unknown,
): { name?: string; name_i18n?: Prisma.InputJsonObject } {
  const next = data.name_i18n !== undefined ? normalizeI18n(data.name_i18n) : null;
  if (next?.en) return { name: next.en, name_i18n: { ...next } };
  if (data.name !== undefined) {
    const en = data.name.trim();
    return { name: en, name_i18n: { ...(normalizeI18n(current) ?? {}), en } };
  }
  return {};
}

/**
 * Description columns to write: description_i18n wins (th-only allowed → description null); legacy plain description merges
 * คอลัมน์ description ที่ต้องเขียน — description_i18n มาก่อน (มีแค่ th ได้ → description เป็น null); ค่าเดี่ยวของ client เก่า merge
 */
export function resolveDescriptionWrite(
  data: { description?: string | null; description_i18n?: unknown },
  current?: unknown,
): { description?: string | null; description_i18n?: Prisma.InputJsonObject | typeof Prisma.DbNull } {
  if (data.description_i18n !== undefined) {
    const next = normalizeI18n(data.description_i18n);
    return {
      description: next?.en ?? null,
      description_i18n: next ? { ...next } : Prisma.DbNull,
    };
  }
  if (data.description !== undefined) {
    const en = data.description?.trim() || undefined;
    const base: LocalizedText = { ...(normalizeI18n(current) ?? {}) };
    if (en) base.en = en;
    else delete base.en;
    return {
      description: en ?? null,
      description_i18n: Object.keys(base).length ? { ...base } : Prisma.DbNull,
    };
  }
  return {};
}
```

- [ ] **Step 4: DTO** — in `ReportTemplateCreateSchema`, make `name` optional and add the i18n fields; then add a refine. Replace the `name:` entry of the create schema with:

```ts
  name: z.string().min(1, { message: 'Name must not be empty' }).optional().meta({
    example: 'Monthly Inventory Valuation',
    description: 'Display name (EN). Required unless name_i18n.en is given; always equals name_i18n.en after save',
  }),
  name_i18n: z
    .object({ en: z.string().min(1, { message: 'name_i18n.en is required' }), th: z.string().optional() })
    .optional()
    .meta({ example: { en: 'Monthly Inventory Valuation', th: 'มูลค่าสินค้าคงคลังรายเดือน' }, description: 'Localized name; en is the unique key' }),
  description_i18n: z
    .object({ en: z.string().optional(), th: z.string().optional() })
    .nullable()
    .optional()
    .meta({ example: { th: 'มูลค่าคงคลังแยกตามสถานที่' }, description: 'Localized description; th-only allowed' }),
```

and wrap the create schema: change `export const ReportTemplateCreateSchema = z.object({ … });` to

```ts
export const ReportTemplateCreateSchema = z
  .object({ … unchanged fields … })
  .refine((v) => !!v.name?.trim() || !!v.name_i18n?.en?.trim(), {
    message: 'Name is required',
    path: ['name'],
  });
```

Add `name_i18n` and `description_i18n` (same definitions) to `ReportTemplateUpdateSchema`, plus to both schemas:

```ts
  change_type: z.enum(['import']).optional().meta({
    example: 'import',
    description: "Label the resulting version as an import. Only 'import' is accepted",
  }),
```

(Task B3 consumes `change_type`.) If `createZodDto` rejects a `ZodEffects`/refined schema in this repo's nestjs-zod version, keep the plain object for the DTO class and run the refine check inside the service instead (`if (!resolved.name) return Result.error(...)`) — check `bun run audit:zod-dto-openapi` output.

- [ ] **Step 5: Interface** — add to `IReportTemplateUpdate`:

```ts
  name_i18n?: unknown;
  description_i18n?: unknown;
  change_type?: 'import';
```

- [ ] **Step 6: Service create/update**

Import: `import { resolveDescriptionWrite, resolveNameWrite } from './report-template-i18n';`

`create`: at the top, before the duplicate check:

```ts
    const nameCols = resolveNameWrite(data);
    const descCols = resolveDescriptionWrite(data);
    if (!nameCols.name) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED);
    }
```

Change the duplicate lookup to `where: { name: nameCols.name, deleted_at: null }`, and in `data:` replace `name: data.name, description: data.description,` with `...nameCols, ...descCols,`.

`update`: change the duplicate check to use the resolved name:

```ts
    const nameCols = resolveNameWrite(data, existingTemplate.name_i18n);
    const descCols = resolveDescriptionWrite(data, existingTemplate.description_i18n);
    if (nameCols.name && nameCols.name !== existingTemplate.name) {
      const duplicate = await this.prismaSystem.tb_report_template.findFirst({
        where: { name: nameCols.name, deleted_at: null, id: { not: id } },
      });
      if (duplicate) {
        return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_NAME_ALREADY_EXISTS);
      }
    }
```

and replace `name: data.name, description: data.description,` with `...nameCols, ...descCols,`.

`findAll` and `findForms` `select:` — add `name_i18n: true, description_i18n: true,`.

- [ ] **Step 7: Static checks + tests** — same commands as B1 Step 6, plus apply the migration locally:

```bash
cd packages/prisma-shared-schema-platform && bunx prisma migrate deploy && cd ../..
```

Expected: clean. If the existing service spec asserts `findFirst` was called with `{ name: data.name, … }` it still holds (resolved name = trimmed input).

- [ ] **Step 8: Manual curl (Review Focus #2)**

```bash
# set TH via i18n
curl -s -X PUT .../report-templates/$ID ... -d "{\"doc_version\":$V,\"name_i18n\":{\"en\":\"Probe\",\"th\":\"ทดสอบ\"}}"
# old client: plain name only
curl -s -X PUT .../report-templates/$ID ... -d "{\"doc_version\":$((V+1)),\"name\":\"Probe 2\"}"
curl -s .../report-templates/$ID ... | jq '.data | {name, name_i18n}'
```

Expected: `{"name":"Probe 2","name_i18n":{"en":"Probe 2","th":"ทดสอบ"}}`. Also `name_i18n: {"th":"x"}` alone → HTTP 400.

- [ ] **Step 9: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma apps/micro-cluster/src/cluster/report-template apps/backend-gateway/src/common/dto/report-template
git commit -m "feat(report-template): ชื่อและคำอธิบายหลายภาษา name_i18n/description_i18n แบบ dual-write"
```

### Task B3: Version table + snapshot on create/update

**Files:**
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20261008120000_report_template_version/migration.sql`
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma`
- Create: `apps/micro-cluster/src/cluster/report-template/report-template-version.ts`
- Modify: `apps/micro-cluster/src/cluster/report-template/report-template.service.ts`

**Interfaces:**
- Consumes: `resolveNameWrite`, `resolveDescriptionWrite` (B2).
- Produces (`report-template-version.ts`):
  - `SNAPSHOT_FIELDS: readonly string[]`
  - `type VersionChangeType = 'create' | 'update' | 'restore' | 'import'`
  - `buildSnapshot(row: Record<string, unknown>): Prisma.InputJsonObject`
  - `writeVersion(tx: Prisma.TransactionClient, row: { id: string; doc_version: number } & Record<string, unknown>, change_type: VersionChangeType, user_id: string, restored_from_version?: number): Promise<void>`

- [ ] **Step 1: Migration**

```sql
-- 20261008120000_report_template_version
-- snapshot ทั้งแถวของ tb_report_template ทุกครั้งที่ create/update/restore — version = doc_version หลังเขียน
CREATE TABLE IF NOT EXISTS "tb_report_template_version" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "report_template_id"    UUID         NOT NULL,
  "version"               INTEGER      NOT NULL,
  "snapshot"              JSONB        NOT NULL,
  "change_type"           VARCHAR(20)  NOT NULL,
  "restored_from_version" INTEGER,
  "note"                  TEXT,
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "created_by_id"         UUID,
  CONSTRAINT "tb_report_template_version_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tb_report_template_version_report_template_id_fkey"
    FOREIGN KEY ("report_template_id") REFERENCES "tb_report_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_template_version_template_version_u"
  ON "tb_report_template_version" ("report_template_id", "version");
CREATE INDEX IF NOT EXISTS "idx_report_template_version_template_created"
  ON "tb_report_template_version" ("report_template_id", "created_at" DESC);

-- backfill: 1 เวอร์ชันต่อ template ที่ยังไม่ถูกลบ = สภาพปัจจุบัน เพื่อให้กู้กลับมา "ตอนนี้" ได้เสมอ
INSERT INTO "tb_report_template_version"
  ("report_template_id", "version", "snapshot", "change_type", "created_at", "created_by_id")
SELECT t."id", t."doc_version",
       jsonb_build_object(
         'name', t."name", 'name_i18n', t."name_i18n",
         'description', t."description", 'description_i18n', t."description_i18n",
         'report_group', t."report_group", 'template_type', t."template_type",
         'dialog', t."dialog", 'content', t."content",
         'builder_key', t."builder_key", 'view_name', t."view_name",
         'source_type', t."source_type", 'source_name', t."source_name", 'source_params', t."source_params",
         'orientation', t."orientation", 'signature_config', t."signature_config",
         'is_standard', t."is_standard", 'is_default', t."is_default", 'is_active', t."is_active",
         'allow_business_unit', t."allow_business_unit", 'deny_business_unit', t."deny_business_unit"
       ),
       'create',
       COALESCE(t."updated_at", t."created_at", now()),
       COALESCE(t."updated_by_id", t."created_by_id")
  FROM "tb_report_template" t
 WHERE t."deleted_at" IS NULL
ON CONFLICT ("report_template_id", "version") DO NOTHING;
```

- [ ] **Step 2: Prisma schema** — add the model from spec §1.1 verbatim, but with `created_at DateTime @default(now()) @db.Timestamptz(6)`; add the back-relation to `tb_report_template`: `versions tb_report_template_version[]`. Rebuild the package (B2 Step 2).

- [ ] **Step 3: `report-template-version.ts`**

```ts
import { Prisma } from '@repo/prisma-shared-schema-platform';

export const SNAPSHOT_FIELDS = [
  'name', 'name_i18n', 'description', 'description_i18n', 'report_group', 'template_type',
  'dialog', 'content', 'builder_key', 'view_name', 'source_type', 'source_name', 'source_params',
  'orientation', 'signature_config', 'is_standard', 'is_default', 'is_active',
  'allow_business_unit', 'deny_business_unit',
] as const;

export type VersionChangeType = 'create' | 'update' | 'restore' | 'import';

/**
 * Picks the editable fields of a report-template row into a snapshot object
 * เลือกเฉพาะฟิลด์ที่แก้ได้ของแถว report template มาเป็น snapshot
 */
export function buildSnapshot(row: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_FIELDS) out[key] = row[key] ?? null;
  return out as Prisma.InputJsonObject;
}

/**
 * Writes one version row for the just-written template, inside the caller's transaction
 * เขียนแถวเวอร์ชันของ template ที่เพิ่งเขียน ภายใน transaction ของผู้เรียก
 */
export async function writeVersion(
  tx: Prisma.TransactionClient,
  row: { id: string; doc_version: number } & Record<string, unknown>,
  change_type: VersionChangeType,
  user_id: string,
  restored_from_version?: number,
): Promise<void> {
  await tx.tb_report_template_version.create({
    data: {
      report_template_id: row.id,
      version: row.doc_version,
      snapshot: buildSnapshot(row),
      change_type,
      restored_from_version: restored_from_version ?? null,
      created_by_id: user_id,
    },
  });
}
```

- [ ] **Step 4: Wrap create/update in `$transaction`**

`create`: replace `const template = await this.prismaSystem.tb_report_template.create({ data: {...} });` with

```ts
    const changeType = data.change_type === 'import' ? 'import' : 'create';
    const template = await this.prismaSystem.$transaction(async (tx) => {
      const created = await tx.tb_report_template.create({ data: { /* unchanged data object */ } });
      await writeVersion(tx, created, changeType, user_id);
      return created;
    });
```

`update`: likewise wrap the `tb_report_template.update` call:

```ts
    const changeType = data.change_type === 'import' ? 'import' : 'update';
    const updatedTemplate = await this.prismaSystem.$transaction(async (tx) => {
      const updated = await tx.tb_report_template.update({ where: { id, doc_version: data.doc_version }, data: { /* unchanged */ } });
      await writeVersion(tx, updated, changeType, user_id);
      return updated;
    });
```

**Check the doc_version auto-increment still fires inside `tx`** (it is a client extension in `packages/prisma-shared-schema-platform/src/index.ts:74`): after Step 6, two consecutive saves must produce versions N and N+1, not N twice (which the unique index would reject with a 500).

- [ ] **Step 5: Keep existing tests green** — `createMockPrisma` already runs `$transaction(fn)` with the root mock, so `tb_report_template_version.create` is an auto `jest.fn()`. If a test mocks `create` as `{ id: 'rt-9' }` with no `doc_version`, `writeVersion` writes `version: undefined` into a mock — harmless. Run:

```bash
bun run --cwd apps/micro-cluster check-types
bunx eslint apps/micro-cluster/src/cluster/report-template
cd apps/micro-cluster && bunx jest src/cluster/report-template --runInBand --forceExit; cd ../..
cd packages/prisma-shared-schema-platform && bunx prisma migrate deploy && cd ../..
```

- [ ] **Step 6: Manual (Review Focus #1)**

```bash
psql "$SYSTEM_DIRECT_URL" -c 'select count(*) from tb_report_template_version'   # = live templates
# save twice through the API, then:
psql "$SYSTEM_DIRECT_URL" -c "select version, change_type from tb_report_template_version where report_template_id='$ID' order by version"
# stale doc_version → expect 409 and NO new row
curl -s -o /dev/null -w '%{http_code}\n' -X PUT .../report-templates/$ID ... -d '{"doc_version":0,"name":"x"}'
```

- [ ] **Step 7: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma apps/micro-cluster/src/cluster/report-template
git commit -m "feat(report-template): ตาราง tb_report_template_version เก็บ snapshot ทุกครั้งที่ create/update"
```

### Task B4: Version endpoints (list / get / restore)

**Files:**
- Modify: `packages/error-catalog/src/catalog.ts` (after `REPORT_TEMPLATE_NAME_ALREADY_EXISTS`)
- Modify: `apps/micro-cluster/src/cluster/report-template/report-template.service.ts`, `report-template.controller.ts`
- Modify: `packages/rpc-contract/src/contracts/report-templates.ts` (generated)
- Modify: `apps/backend-gateway/src/platform/platform_report-templates/platform_report-templates.service.ts`, `.controller.ts`
- Modify: `apps/backend-gateway/src/common/dto/report-template/report-template.dto.ts` (restore body)
- Modify: `apps/micro-cluster/src/common/activity/platform-activity-registry.ts`
- Modify: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` (generated)

**Interfaces:**
- Consumes: `buildSnapshot`, `writeVersion` (B3), `normalizeI18n` (B2).
- Produces (HTTP, consumed by Task F1):
  - `GET  /api-system/report-templates/:report_template_id/versions` → `data: Array<{ version, change_type, restored_from_version, created_at, created_by_id, …enriched name fields }>` newest first
  - `GET  /api-system/report-templates/:report_template_id/versions/:version_no` → `data: { …same, snapshot }`
  - `POST /api-system/report-templates/:report_template_id/versions/:version_no/restore` body `{ doc_version: number }` → `data: { id, doc_version }`
- RPC cmds: `report-templates.list-versions`, `report-templates.find-version`, `report-templates.restore-version`. The template version number travels as **`version_no`** — `payload.version` is already the API-contract version string.

- [ ] **Step 1: Error catalog entry**

```ts
  REPORT_TEMPLATE_VERSION_NOT_FOUND: {
    code: 'REPORT_TEMPLATE_VERSION_NOT_FOUND',
    id: makeId(MODULE.REPORT_TEMPLATE, 3),
    http_status: 404,
    message_en: 'Report template version not found',
    message_th: 'ไม่พบเวอร์ชันของเทมเพลตรายงาน',
  },
```

Rebuild the package if consumers read `dist` (`bun run --cwd packages/error-catalog build`).

- [ ] **Step 2: Service methods** (append to `ReportTemplateService`; import `buildSnapshot, writeVersion` and `normalizeI18n`)

```ts
  @TryCatch
  async listVersions(id: string, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'listVersions', id, user_id, version }, ReportTemplateService.name);
    const template = await this.prismaSystem.tb_report_template.findFirst({ where: { id }, select: { id: true } });
    if (!template) return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_NOT_FOUND);
    const rows = await this.prismaSystem.tb_report_template_version.findMany({
      where: { report_template_id: id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, change_type: true, restored_from_version: true, created_at: true, created_by_id: true },
    });
    return Result.ok(rows);
  }

  @TryCatch
  async findVersion(id: string, version_no: number, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'findVersion', id, version_no, user_id, version }, ReportTemplateService.name);
    const row = await this.prismaSystem.tb_report_template_version.findFirst({
      where: { report_template_id: id, version: version_no },
    });
    if (!row) return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_VERSION_NOT_FOUND);
    return Result.ok(row);
  }

  @TryCatch
  async restoreVersion(
    id: string,
    version_no: number,
    doc_version: number,
    user_id: string,
    version: string,
  ): Promise<Result<{ id: string; doc_version: number }>> {
    this.logger.debug({ function: 'restoreVersion', id, version_no, doc_version, user_id, version }, ReportTemplateService.name);
    const current = await this.prismaSystem.tb_report_template.findFirst({ where: { id, deleted_at: null } });
    if (!current) return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_NOT_FOUND);
    const source = await this.prismaSystem.tb_report_template_version.findFirst({
      where: { report_template_id: id, version: version_no },
    });
    if (!source) return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_VERSION_NOT_FOUND);

    const snap = source.snapshot as Record<string, unknown>;
    // snapshot ก่อนมี i18n ไม่มีฟิลด์ *_i18n — สร้างจากคอลัมน์เดิม
    const nameI18n = normalizeI18n(snap.name_i18n) ?? { en: String(snap.name ?? current.name) };
    const name = nameI18n.en ?? current.name;
    const descI18n =
      normalizeI18n(snap.description_i18n) ??
      (typeof snap.description === 'string' && snap.description.trim() ? { en: snap.description.trim() } : null);

    if (name !== current.name) {
      const duplicate = await this.prismaSystem.tb_report_template.findFirst({
        where: { name, deleted_at: null, id: { not: id } },
      });
      if (duplicate) return Result.errorFromCatalog(ERROR_CATALOG.REPORT_TEMPLATE_NAME_ALREADY_EXISTS);
    }

    const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
    const updated = await this.prismaSystem.$transaction(async (tx) => {
      const row = await tx.tb_report_template.update({
        where: { id, doc_version },
        data: {
          name,
          name_i18n: { ...nameI18n },
          description: descI18n?.en ?? null,
          description_i18n: descI18n ? { ...descI18n } : Prisma.DbNull,
          report_group: snap.report_group as string,
          template_type: snap.template_type as string,
          dialog: snap.dialog as string,
          content: snap.content as string,
          builder_key: (snap.builder_key as string) ?? '',
          view_name: (snap.view_name as string | null) ?? null,
          source_type: (snap.source_type as string) ?? 'view',
          source_name: (snap.source_name as string | null) ?? null,
          source_params: (snap.source_params ?? { params: [] }) as Prisma.InputJsonValue,
          orientation: (snap.orientation as string) ?? 'portrait',
          signature_config: (snap.signature_config ?? { blocks: [] }) as Prisma.InputJsonValue,
          is_standard: snap.is_standard as boolean,
          is_active: snap.is_active as boolean,
          allow_business_unit: json(snap.allow_business_unit),
          deny_business_unit: json(snap.deny_business_unit),
          // is_default deliberately untouched — partial unique index (one default per group)
          updated_at: new Date().toISOString(),
          updated_by_id: user_id,
        },
      });
      await writeVersion(tx, row, 'restore', user_id, version_no);
      return row;
    });
    return Result.ok({ id, doc_version: updated.doc_version });
  }
```

- [ ] **Step 3: Micro controller handlers with temporary literals** (copy the `update` handler shape):

```ts
  @MessagePattern({ cmd: 'report-templates.list-versions', service: 'micro-cluster' })
  async listVersions(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'listVersions', payload }, ReportTemplateController.name);
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.reportTemplateService.listVersions(payload.id, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  @MessagePattern({ cmd: 'report-templates.find-version', service: 'micro-cluster' })
  async findVersion(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'findVersion', payload }, ReportTemplateController.name);
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.reportTemplateService.findVersion(payload.id, Number(payload.version_no), payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  @MessagePattern({ cmd: 'report-templates.restore-version', service: 'micro-cluster' })
  async restoreVersion(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    this.logger.debug({ function: 'restoreVersion', payload }, ReportTemplateController.name);
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.reportTemplateService.restoreVersion(
        payload.id,
        Number(payload.version_no),
        Number(payload.data?.doc_version),
        payload.user_id,
        payload.version,
      ),
    );
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 4: Generate the RPC contract, then swap literals**

```bash
bun run gen:rpc-contract
grep -n "Versions\|Version" packages/rpc-contract/src/contracts/report-templates.ts
```

Replace the three literals with `ReportTemplates.listVersions.pattern`, `ReportTemplates.findVersion.pattern`, `ReportTemplates.restoreVersion.pattern` (use the exact generated keys). Rebuild `packages/rpc-contract` if the gateway reads its `dist`.

- [ ] **Step 5: Restore body DTO** — append to `report-template.dto.ts`:

```ts
export const ReportTemplateRestoreVersionSchema = z.object({
  doc_version: z.number().int().meta({ description: 'Current doc_version of the template (optimistic lock)', example: 12 }),
});
export class ReportTemplateRestoreVersionDto extends createZodDto(ReportTemplateRestoreVersionSchema) {}
```

Export it wherever `ReportTemplateUpdateDto` is re-exported from `@/common` (grep `report-template.dto` in `apps/backend-gateway/src/common/index.ts` or `dto/index.ts`).

- [ ] **Step 6: Gateway service** (append):

```ts
  async listVersions(id: string, user_id: string, tenant_id: string, version: string): Promise<unknown> {
    this.logger.debug({ function: 'listVersions', id, user_id, tenant_id, version }, PlatformReportTemplatesService.name);
    return this.rpc.call(ReportTemplates.listVersions, { id, user_id, tenant_id, version });
  }

  async findVersion(id: string, version_no: number, user_id: string, tenant_id: string, version: string): Promise<unknown> {
    this.logger.debug({ function: 'findVersion', id, version_no, user_id, tenant_id, version }, PlatformReportTemplatesService.name);
    return this.rpc.call(ReportTemplates.findVersion, { id, version_no, user_id, tenant_id, version });
  }

  async restoreVersion(
    id: string,
    version_no: number,
    data: { doc_version: number },
    user_id: string,
    tenant_id: string,
    version: string,
  ): Promise<unknown> {
    this.logger.debug({ function: 'restoreVersion', id, version_no, data, user_id, tenant_id, version }, PlatformReportTemplatesService.name);
    return this.rpc.call(ReportTemplates.restoreVersion, { id, version_no, data, user_id, tenant_id, version });
  }
```

- [ ] **Step 7: Gateway controller routes** — place them **after** `findOne`; follow the `findOne` decorator stack exactly (AppIdGuard + PlatformPermissionGuard + RequirePlatformPermission + HttpCode + ApiVersionMinRequest + ApiOperation with unique `operationId` + ApiParam + ApiQuery version + ApiResponse 401/403/404). Import `ParseIntPipe`.

```ts
  @Get(':report_template_id/versions')
  @UseGuards(new AppIdGuard('report-template.listVersions'), PlatformPermissionGuard)
  @RequirePlatformPermission('report_template.read')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  // …swagger decorators, operationId: 'platformReportTemplate_listVersions'
  async listVersions(
    @Param('report_template_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    const { user_id, tenant_id } = ExtractRequestHeader(req);
    this.respond(res, await this.reportTemplateService.listVersions(id, user_id, tenant_id, version));
  }

  @Get(':report_template_id/versions/:version_no')
  @UseGuards(new AppIdGuard('report-template.findVersion'), PlatformPermissionGuard)
  @RequirePlatformPermission('report_template.read')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  // …swagger, operationId: 'platformReportTemplate_findVersion'
  async findVersion(
    @Param('report_template_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('version_no', ParseIntPipe) versionNo: number,
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    const { user_id, tenant_id } = ExtractRequestHeader(req);
    this.respond(res, await this.reportTemplateService.findVersion(id, versionNo, user_id, tenant_id, version));
  }

  @Post(':report_template_id/versions/:version_no/restore')
  @UseGuards(new AppIdGuard('report-template.restoreVersion'), PlatformPermissionGuard)
  @RequirePlatformPermission('report_template.update')
  @HttpCode(HttpStatus.OK)
  // …swagger + @ApiBody({ type: ReportTemplateRestoreVersionDto }), operationId: 'platformReportTemplate_restoreVersion'
  async restoreVersion(
    @Param('report_template_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('version_no', ParseIntPipe) versionNo: number,
    @Body() body: ReportTemplateRestoreVersionDto,
    @Req() req: Request,
    @Res() res: Response,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    const { user_id, tenant_id } = ExtractRequestHeader(req);
    this.respond(res, await this.reportTemplateService.restoreVersion(id, versionNo, body, user_id, tenant_id, version));
  }
```

Write out every swagger decorator in full in the code (copy from `findOne`/`update`) — the `// …` comments above are only to keep this plan readable.

- [ ] **Step 8: Activity registry** — next to `'report-templates.update'` add:

```ts
  [
    'report-templates.restore-version',
    { action: 'update', entityName: 'tb_report_template', idSource: EDITED_ID },
  ],
```

(use the exact cmd string generated in Step 4).

- [ ] **Step 9: Regenerate catalogs + run every audit gate**

```bash
bun run scripts/generate-app-api-catalog/run.ts
bun run check-types
bun run audit:api-system-permission
bun run audit:app-api-catalog-drift
bun run audit:rest-contract
bun run audit:message-pattern-literal
bun run audit:enrich-audit-paths
bun run audit:zod-dto-openapi
bun run audit:zod-version
bunx eslint apps/micro-cluster/src/cluster/report-template apps/backend-gateway/src/platform/platform_report-templates apps/backend-gateway/src/common/dto/report-template apps/micro-cluster/src/common/activity
cd apps/micro-cluster && bunx jest src/cluster/report-template src/common/activity --runInBand --forceExit; cd ../..
cd apps/backend-gateway && bunx jest src/platform/platform_report-templates src/platform/applications --runInBand --forceExit; cd ../..
```

Expected: all clean. A gate that is already red on `main` (see memory `reference_backend_env_drift_audit_red_on_main`) — compare against `main` before treating it as yours.

- [ ] **Step 10: Manual curls (Review Focus #3)**

```bash
B=http://localhost:4000/api-system/report-templates
curl -s "$B/$ID/versions" -H … | jq '.data[0:3]'                 # newest first, created_by name present
curl -s "$B/$ID/versions/1" -H … | jq '.data.snapshot.name'
curl -s -X POST "$B/$ID/versions/1/restore" -H … -d "{\"doc_version\":$CUR}" | jq   # new doc_version
curl -s "$B/$ID/versions" -H … | jq '.data[0] | {version, change_type, restored_from_version}'  # restore, 1
# name clash: rename template B to template A's old name, restore A's old version → 409 REPORT_TEMPLATE_NAME_ALREADY_EXISTS
# backfilled pre-i18n snapshot: restore it → name_i18n == {en: name}
curl -s -X POST "$B/$ID/versions/9999/restore" -H … -d '{"doc_version":0}' -w '%{http_code}'   # 404
```

Check `x-app-id` of carmen-platform on DEV is `allow_all` (or add the three new api names) — otherwise the new routes answer 401/403 for real users.

- [ ] **Step 11: Commit**

```bash
git add -A packages/error-catalog packages/rpc-contract apps/micro-cluster apps/backend-gateway
git commit -m "feat(report-template): endpoint ดู/กู้คืนเวอร์ชัน (list/get/restore) + error VERSION_NOT_FOUND"
```

### Task B5: Backend PR

- [ ] **Step 1:** `git log --oneline main..` shows exactly the four commits from B1–B4; `git status` clean.
- [ ] **Step 2: Push + PR** (migration applies to DEV on push — this is the intended moment):

```bash
git push -u origin feature/report-template-versions-i18n
gh pr create --base main --title "feat(report-template): versions + i18n name/description + fix dropped fields" --body "Spec: carmen-platform docs/superpowers/specs/2026-10-08-report-template-versions-backup-design.md …"
gh pr merge --auto --merge
```

- [ ] **Step 3:** After merge, confirm both migrations applied on DEV: `curl https://dev.blueledgers.com:4001/api-system/report-templates/$ID/versions` returns a list (not 404 route) — a fake route returning a different 404 shape proves nothing; compare against `/versions-nope`.

---

# Part 2 — Frontend (`carmen-platform`)

All paths are relative to `carmen-platform`. Branch `feature/report-template-versions-backup`.

### Task F1: Types, service, localized helper

**Files:**
- Modify: `src/types/index.ts` (append)
- Modify: `src/services/reportTemplateService.ts`
- Create: `src/utils/localized.ts`

**Interfaces:**
- Produces:
  - `LocalizedText = { en?: string; th?: string }` (types/index.ts)
  - `ReportTemplate` gains `name_i18n?`, `description_i18n?: LocalizedText | null`, `orientation?`, `signature_config?`, `view_name?`, `change_type?: 'import'`
  - `ReportTemplateVersionChange`, `ReportTemplateVersionSummary`, `ReportTemplateVersion` (service file)
  - `reportTemplateService.listVersions(id): Promise<ReportTemplateVersionSummary[]>`, `.getVersion(id, v): Promise<ReportTemplateVersion>`, `.restoreVersion(id, v, docVersion?): Promise<{ id: string; doc_version: number }>`
  - `pickLocalized(i18n, fallback, lang): string`, `secondaryLocalized(i18n, lang): string | undefined`

- [ ] **Step 1: `src/types/index.ts`** — append:

```ts
/** ข้อความสองภาษา — en/th ไม่บังคับทั้งคู่ (ฝั่ง name บังคับ en ที่ backend) */
export interface LocalizedText {
  en?: string;
  th?: string;
}
```

- [ ] **Step 2: Service types** — in `reportTemplateService.ts` import `LocalizedText` from `'../types'` and extend `ReportTemplate`:

```ts
  name_i18n?: LocalizedText | null;
  description_i18n?: LocalizedText | null;
  view_name?: string | null;
  orientation?: 'portrait' | 'landscape';
  signature_config?: { blocks: Array<{ key: string; label: string; required?: boolean }> };
  // write-only label: makes the resulting version show as "import"
  change_type?: 'import';
```

Add below the interface:

```ts
export type ReportTemplateVersionChange = 'create' | 'update' | 'restore' | 'import';

export interface ReportTemplateVersionSummary {
  id: string;
  version: number;
  change_type: ReportTemplateVersionChange;
  restored_from_version?: number | null;
  created_at?: string;
  created_by_id?: string | null;
  created_by_name?: string;
  audit?: unknown;
}

export type ReportTemplateSnapshot = Omit<
  ReportTemplate,
  'id' | 'doc_version' | 'created_at' | 'created_by_id' | 'updated_at' | 'updated_by_id' | 'change_type'
>;

export interface ReportTemplateVersion extends ReportTemplateVersionSummary {
  snapshot: ReportTemplateSnapshot;
}
```

- [ ] **Step 3: Service methods** — add before `delete`:

```ts
  listVersions: async (id: string): Promise<ReportTemplateVersionSummary[]> => {
    const response = await api.get(`/api-system/report-templates/${id}/versions`);
    const body = response.data?.data ?? response.data;
    return Array.isArray(body) ? body : [];
  },

  getVersion: async (id: string, version: number): Promise<ReportTemplateVersion> => {
    const response = await api.get(`/api-system/report-templates/${id}/versions/${version}`);
    return response.data?.data ?? response.data;
  },

  restoreVersion: async (
    id: string,
    version: number,
    docVersion?: number,
  ): Promise<{ id: string; doc_version: number }> => {
    const response = await api.post(`/api-system/report-templates/${id}/versions/${version}/restore`, {
      ...(docVersion != null ? { doc_version: docVersion } : {}),
    });
    return response.data?.data ?? response.data;
  },
```

- [ ] **Step 4: `src/utils/localized.ts`**

```ts
import type { Lang } from '../i18n/types';
import type { LocalizedText } from '../types';

/**
 * เลือกข้อความตามภาษาที่ใช้อยู่ — ไม่มีภาษานั้นตกไปภาษาอื่น แล้วค่อย fallback (คอลัมน์เดิม)
 */
export function pickLocalized(
  i18n: LocalizedText | null | undefined,
  fallback: string | null | undefined,
  lang: Lang,
): string {
  return (lang === 'th' && i18n?.th) || i18n?.en || i18n?.th || fallback || '';
}

/**
 * ข้อความอีกภาษาสำหรับบรรทัดรอง — undefined เมื่อไม่มีหรือซ้ำกับตัวหลัก
 */
export function secondaryLocalized(
  i18n: LocalizedText | null | undefined,
  lang: Lang,
): string | undefined {
  const primary = pickLocalized(i18n, '', lang);
  const other = lang === 'th' ? i18n?.en : i18n?.th;
  return other && other !== primary ? other : undefined;
}
```

- [ ] **Step 5: Checks + commit**

```bash
bun run typecheck && bun run lint
git add src/types/index.ts src/services/reportTemplateService.ts src/utils/localized.ts
git commit -m "feat(report-templates): type/service สำหรับเวอร์ชันและชื่อหลายภาษา"
```

### Task F2: EN/TH name & description on Edit + list + CSV

**Files:**
- Modify: `src/pages/ReportTemplateEdit.tsx`
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (inside `pages.reportTemplates`, after `fieldLabelTemplateType`)

**Interfaces:**
- Consumes: `pickLocalized`, `secondaryLocalized` (F1).

- [ ] **Step 1: i18n keys** — `en.ts` (after `fieldLabelTemplateType: 'Template type',`):

```ts
      nameEnLabel: 'Name (EN)',
      nameThLabel: 'Name (TH)',
      nameThPlaceholder: 'Thai name (optional)',
      descriptionEnLabel: 'Description (EN)',
      descriptionThLabel: 'Description (TH)',
      descriptionThPlaceholder: 'Thai description (optional)',
      csvNameTh: 'Name (TH)',
      csvDescriptionTh: 'Description (TH)',
```

`th.ts` (after `fieldLabelTemplateType: 'ประเภทเทมเพลต',`):

```ts
      nameEnLabel: 'ชื่อ (EN)',
      nameThLabel: 'ชื่อ (TH)',
      nameThPlaceholder: 'ชื่อภาษาไทย (ไม่บังคับ)',
      descriptionEnLabel: 'คำอธิบาย (EN)',
      descriptionThLabel: 'คำอธิบาย (TH)',
      descriptionThPlaceholder: 'คำอธิบายภาษาไทย (ไม่บังคับ)',
      csvNameTh: 'ชื่อ (TH)',
      csvDescriptionTh: 'คำอธิบาย (TH)',
```

- [ ] **Step 2: Form data** — in `ReportTemplateFormData` add `name_th: string; description_th: string;`; in `initialFormData` add `name_th: '', description_th: '',`.

- [ ] **Step 3: Load** — in `fetchTemplate`'s `loaded` object replace the `name` / `description` lines with:

```ts
        name: template.name_i18n?.en || template.name || '',
        name_th: template.name_i18n?.th || '',
        description: template.description_i18n?.en ?? template.description ?? '',
        description_th: template.description_i18n?.th || '',
```

- [ ] **Step 4: Save payload** — in `handleSubmit`, replace `const payload = { ...formData,` with:

```ts
    const { name_th, description_th, ...rest } = formData;
    const nameEn = rest.name.trim();
    const nameTh = name_th.trim();
    const descEn = rest.description.trim();
    const descTh = description_th.trim();
    const payload = {
      ...rest,
      // ส่งคอลัมน์เดิมคู่ด้วย: backend รุ่นเก่าอ่าน name/description / รุ่นใหม่ใช้ *_i18n เป็นหลัก
      name: nameEn,
      name_i18n: { en: nameEn, ...(nameTh ? { th: nameTh } : {}) },
      description: descEn,
      description_i18n: descEn || descTh ? { ...(descEn ? { en: descEn } : {}), ...(descTh ? { th: descTh } : {}) } : null,
```

(keep the remaining existing payload keys after this). The existing `!formData.name.trim()` check already rejects a TH-only name.

- [ ] **Step 5: Fields JSX** — replace the Name block and Description block (`ReportTemplateEdit.tsx:565-607`) with a `grid gap-4 lg:grid-cols-2` pair each. Name EN keeps every existing attribute (`id="name"`, `name="name"`, error display, `required`) with label `t('pages.reportTemplates.nameEnLabel')`; add:

```tsx
<div className="space-y-2">
  <Label htmlFor="name_th">{t('pages.reportTemplates.nameThLabel')}</Label>
  {editing ? (
    <Input
      type="text"
      id="name_th"
      name="name_th"
      value={formData.name_th}
      onChange={handleChange}
      placeholder={t('pages.reportTemplates.nameThPlaceholder')}
      maxLength={255}
    />
  ) : (
    <ReadOnlyField value={formData.name_th} />
  )}
</div>
```

Description EN keeps the existing textarea (label `descriptionEnLabel`); Description TH is the same textarea with `id/name="description_th"`, `value={formData.description_th}`, placeholder `descriptionThPlaceholder`, and the same `ReadOnlyField` read-only branch. `handleChange` sets `formData[e.target.name]`, so no handler change is needed — confirm by reading it.

- [ ] **Step 6: Header title** — `const { t, lang } = useI18n();` and in `PageHeader title` replace `formData.name || t(...)` with `pickLocalized({ en: formData.name, th: formData.name_th }, '', lang) || t('pages.reportTemplates.singularTitle')`.

- [ ] **Step 7: List** — in `ReportTemplateManagement.tsx` get `lang` from `useI18n()`; in the `name` column cell render:

```tsx
{pickLocalized(row.original.name_i18n, row.original.name, lang)}
```

as the Link text (keep `title=`), then a secondary line when `secondaryLocalized(row.original.name_i18n, lang)` is defined (`<span className="text-xs text-muted-foreground">`). The description line under it uses `pickLocalized(row.original.description_i18n, row.original.description, lang)`. Add `lang` to the columns `useMemo` deps.

- [ ] **Step 8: CSV** — in `handleExport`'s rows map add `name_th: t.name_i18n?.th ?? '', description_th: t.description_i18n?.th ?? ''` (rename the inner arrow param from `t` to `tpl` — it shadows the translator) and columns `{ key: 'name_th', label: t('pages.reportTemplates.csvNameTh') }`, `{ key: 'description_th', label: t('pages.reportTemplates.csvDescriptionTh') }` after `description`.

- [ ] **Step 9: Checks + commit**

```bash
bun run typecheck && bun run lint && bun run test -- src/pages/ReportTemplate
git add src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateManagement.tsx src/i18n
git commit -m "feat(report-templates): ชื่อและคำอธิบาย EN/TH บนหน้าแก้ไข ตาราง และ CSV"
```

If an existing page test fails because the Name label text changed, update its query to the new label — that is maintaining an existing test, not writing a new one.

### Task F3: Backup util + every export entry point

**Files:**
- Create: `src/utils/reportTemplateBackup.ts`
- Modify: `src/pages/ReportTemplateEdit.tsx`, `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `ReportTemplate`, `ReportTemplateSnapshot` (F1), `mapWithConcurrency` (`src/utils/concurrent.ts`), `validateXml` (`src/utils/xml.ts`), `CURRENT_VERSION` (`src/components/VersionBadge.tsx`).
- Produces (`reportTemplateBackup.ts`):
  - `BACKUP_FORMAT = 'carmen.report-template-backup'`, `BACKUP_FORMAT_VERSION = 1`, `MAX_BACKUP_BYTES = 10 * 1024 * 1024`
  - `type BackupTemplate = ReportTemplateSnapshot & { id?: string; version?: number }`
  - `interface ReportTemplateBackup { format; format_version; exported_at; source: { api_base_url?: string; app_version: string }; templates: BackupTemplate[] }`
  - `toBackupTemplate(src: Partial<ReportTemplate> & Record<string, unknown>, version?: number): BackupTemplate`
  - `buildBackup(templates: BackupTemplate[]): ReportTemplateBackup`
  - `backupFileName(templates: BackupTemplate[], now?: Date): string`
  - `downloadJSON(data: unknown, filename: string): void`
  - `fetchFullTemplates(ids: string[], onProgress?: (done: number, total: number) => void): Promise<{ ok: BackupTemplate[]; failed: number }>`
  - `type BackupProblem = 'missingName' | 'missingGroup' | 'missingXml' | 'badTemplateType' | 'badDialogXml' | 'badContentXml' | 'duplicateInFile'`
  - `type ParseBackupResult = { ok: true; entries: Array<{ index: number; template: BackupTemplate; problems: BackupProblem[] }> } | { ok: false; error: 'invalidJson' | 'wrongFormat' | 'newerFormat' | 'empty' }`
  - `parseBackup(text: string): ParseBackupResult`

- [ ] **Step 1: `reportTemplateBackup.ts`**

```ts
import reportTemplateService, {
  type ReportTemplate,
  type ReportTemplateSnapshot,
} from '../services/reportTemplateService';
import { CURRENT_VERSION } from '../components/VersionBadge';
import { mapWithConcurrency } from './concurrent';
import { validateXml } from './xml';

export const BACKUP_FORMAT = 'carmen.report-template-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** ฟิลด์ที่เก็บลงไฟล์ — ชุดเดียวกับ snapshot ฝั่ง backend (SNAPSHOT_FIELDS) */
const BACKUP_FIELDS = [
  'name', 'name_i18n', 'description', 'description_i18n', 'report_group', 'template_type',
  'dialog', 'content', 'builder_key', 'view_name', 'source_type', 'source_name', 'source_params',
  'orientation', 'signature_config', 'is_standard', 'is_default', 'is_active',
  'allow_business_unit', 'deny_business_unit',
] as const;

export type BackupTemplate = ReportTemplateSnapshot & { id?: string; version?: number };

export interface ReportTemplateBackup {
  format: typeof BACKUP_FORMAT;
  format_version: number;
  exported_at: string;
  source: { api_base_url?: string; app_version: string };
  templates: BackupTemplate[];
}

export function toBackupTemplate(
  src: Partial<ReportTemplate> & Record<string, unknown>,
  version?: number,
): BackupTemplate {
  const out: Record<string, unknown> = {};
  if (src.id) out.id = src.id;
  const v = version ?? (typeof src.doc_version === 'number' ? src.doc_version : undefined);
  if (v != null) out.version = v;
  for (const key of BACKUP_FIELDS) if (src[key] !== undefined) out[key] = src[key];
  return out as BackupTemplate;
}

export function buildBackup(templates: BackupTemplate[]): ReportTemplateBackup {
  return {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    source: { api_base_url: import.meta.env.REACT_APP_API_BASE_URL, app_version: CURRENT_VERSION },
    templates,
  };
}

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'template';

export function backupFileName(templates: BackupTemplate[], now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  if (templates.length === 1) {
    const t = templates[0];
    return `report-template_${slug(t.name ?? '')}_v${t.version ?? 0}_${date}.json`;
  }
  return `report-templates_${templates.length}_${date}.json`;
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** list endpoint ไม่คืน content — ต้อง getById ทีละตัว (พร้อมกันสูงสุด 4) */
export async function fetchFullTemplates(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: BackupTemplate[]; failed: number }> {
  const results: Array<BackupTemplate | undefined> = new Array(ids.length);
  let done = 0;
  let failed = 0;
  await mapWithConcurrency(
    ids,
    4,
    async (id) => {
      const res = await reportTemplateService.getById(id);
      return (res?.data ?? res) as ReportTemplate & Record<string, unknown>;
    },
    (_id, i, row, err) => {
      done += 1;
      if (err || !row) failed += 1;
      else results[i] = toBackupTemplate(row);
      onProgress?.(done, ids.length);
    },
  );
  return { ok: results.filter((r): r is BackupTemplate => !!r), failed };
}

export type BackupProblem =
  | 'missingName' | 'missingGroup' | 'missingXml' | 'badTemplateType'
  | 'badDialogXml' | 'badContentXml' | 'duplicateInFile';

export type ParseBackupResult =
  | { ok: true; entries: Array<{ index: number; template: BackupTemplate; problems: BackupProblem[] }> }
  | { ok: false; error: 'invalidJson' | 'wrongFormat' | 'newerFormat' | 'empty' };

export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const doc = raw as Partial<ReportTemplateBackup> | null;
  if (!doc || doc.format !== BACKUP_FORMAT || !Array.isArray(doc.templates)) return { ok: false, error: 'wrongFormat' };
  if (typeof doc.format_version !== 'number' || doc.format_version > BACKUP_FORMAT_VERSION) return { ok: false, error: 'newerFormat' };
  if (doc.templates.length === 0) return { ok: false, error: 'empty' };

  const seen = new Set<string>();
  const entries = doc.templates.map((tpl, index) => {
    const template = (tpl ?? {}) as BackupTemplate;
    const problems: BackupProblem[] = [];
    const name = (template.name_i18n?.en || template.name || '').trim();
    if (!name) problems.push('missingName');
    if (!template.report_group?.trim()) problems.push('missingGroup');
    // dialog/content ต้องเป็นสตริง — ว่างได้ (template บางตัวไม่มี dialog)
    if (typeof template.dialog !== 'string' || typeof template.content !== 'string') problems.push('missingXml');
    else {
      if (!validateXml(template.dialog).valid) problems.push('badDialogXml');
      if (!validateXml(template.content).valid) problems.push('badContentXml');
    }
    if (template.template_type && template.template_type !== 'form' && template.template_type !== 'list') {
      problems.push('badTemplateType');
    }
    if (name) {
      if (seen.has(name)) problems.push('duplicateInFile');
      seen.add(name);
    }
    return { index, template: { ...template, name }, problems };
  });
  return { ok: true, entries };
}
```

(Spec §3.1 said dialog/content "non-empty"; this deliberately accepts empty strings because the create DTO does and real templates may have no dialog — note the deviation in the PR description.)

- [ ] **Step 2: i18n keys** — `pages.reportTemplates.backup` object in both files:

en:
```ts
      backup: {
        download: 'Download backup',
        downloadSelected: 'Download backup ({{count}})',
        downloadAll: 'Backup all',
        progress: 'Backing up {{done}}/{{total}}',
        done: 'Backed up {{count}} templates',
        partial: 'Backed up {{count}}, {{failed}} failed',
        failed: 'Backup failed',
      },
```

th:
```ts
      backup: {
        download: 'ดาวน์โหลด backup',
        downloadSelected: 'ดาวน์โหลด backup ({{count}})',
        downloadAll: 'Backup ทั้งหมด',
        progress: 'กำลัง backup {{done}}/{{total}}',
        done: 'Backup แล้ว {{count}} รายการ',
        partial: 'Backup แล้ว {{count}} ล้มเหลว {{failed}}',
        failed: 'Backup ไม่สำเร็จ',
      },
```

- [ ] **Step 3: Edit page** — add to the `PageHeader actions` fragment, right after the `ActivityTrailSheet` `<Can>`:

```tsx
<Can permission="report_template.read">
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      // templateRecord = ค่าที่บันทึกแล้ว ไม่ใช่ formData ที่กำลังแก้ (Review Focus #5)
      const tpl = toBackupTemplate(templateRecord as ReportTemplate & Record<string, unknown>);
      downloadJSON(buildBackup([tpl]), backupFileName([tpl]));
      toast.success(t('pages.reportTemplates.backup.done', { count: 1 }));
    }}
    disabled={!templateRecord}
  >
    <Download className="mr-2 h-4 w-4" />
    {t('pages.reportTemplates.backup.download')}
  </Button>
</Can>
```

Import `Download` from `lucide-react`, `type ReportTemplate` from the service, and the three util functions.

- [ ] **Step 4: Management — shared runner** inside the component:

```tsx
const [backupProgress, setBackupProgress] = useState<{ done: number; total: number } | null>(null);

const runBackup = useCallback(async (ids: string[]) => {
  if (ids.length === 0) return;
  setBackupProgress({ done: 0, total: ids.length });
  try {
    const { ok, failed } = await fetchFullTemplates(ids, (done, total) => setBackupProgress({ done, total }));
    if (ok.length === 0) {
      toast.error(t('pages.reportTemplates.backup.failed'));
      return;
    }
    downloadJSON(buildBackup(ok), backupFileName(ok));
    if (failed > 0) toast.warning(t('pages.reportTemplates.backup.partial', { count: ok.length, failed }));
    else toast.success(t('pages.reportTemplates.backup.done', { count: ok.length }));
  } finally {
    setBackupProgress(null);
  }
}, [t]);
```

- [ ] **Step 5: Row menu** — in the actions `DropdownMenuContent`, after the activity item:

```tsx
<Can permission="report_template.read">
  <DropdownMenuItem onSelect={() => runBackup([row.original.id])} className="cursor-pointer">
    <Download className="mr-2 h-4 w-4" />
    {t('pages.reportTemplates.backup.download')}
  </DropdownMenuItem>
</Can>
```

Add `runBackup` to the columns `useMemo` deps.

- [ ] **Step 6: Row selection + bulk bar** — copy NewsManagement's pattern exactly: `selectedTemplates` state, `selectionResetKey` state, `clearSelection`, the `useEffect` that clears on `paginate.page/perpage/search/sort/advance`, and on `<DataTable>` add `enableRowSelection`, `getRowId={(row) => row.id}`, `onSelectionChange={setSelectedTemplates}`, `selectionResetKey={selectionResetKey}`, `getRowSelectionLabel={(r) => r.name}`. Bump `TableSkeleton columns` by one. Bulk bar above the table when `selectedTemplates.length > 0`:

```tsx
<div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
  <span className="text-sm font-medium">{t('common.state.nSelected', { count: selectedTemplates.length })}</span>
  <div className="ml-auto flex items-center gap-2">
    <Button variant="outline" size="sm" disabled={!!backupProgress} onClick={() => runBackup(selectedTemplates.map((r) => r.id))}>
      <Download className="mr-2 h-4 w-4" />
      {t('pages.reportTemplates.backup.downloadSelected', { count: selectedTemplates.length })}
    </Button>
    <Button variant="ghost" size="sm" onClick={clearSelection}>{t('common.action.clear')}</Button>
  </div>
</div>
```

Check `stickyLeftColumns` (if the table sets it) increases by one like News does.

- [ ] **Step 7: "Backup all"** — collect ids across pages with the current filter, then `runBackup`:

```tsx
const handleBackupAll = async () => {
  const ids: string[] = [];
  try {
    for (let page = 1; ; page += 1) {
      const res: any = await reportTemplateService.getAll({ ...paginate, page, perpage: 100 });
      const inner = res.data?.data ?? res.data ?? res;
      const items: ReportTemplate[] = Array.isArray(inner) ? inner : (inner?.data ?? []);
      ids.push(...items.map((r) => r.id));
      const total = (inner?.paginate ?? res.data?.paginate ?? res.paginate)?.total ?? ids.length;
      if (items.length === 0 || ids.length >= total) break;
    }
  } catch (err: unknown) {
    toast.error(`${t('pages.reportTemplates.backup.failed')}: ${getErrorDetail(err, t)}`);
    return;
  }
  await runBackup(ids);
};
```

Button in `PageHeader actions`, before the CSV export button:

```tsx
<Can permission="report_template.read">
  <Button variant="outline" size="sm" onClick={handleBackupAll} disabled={!!backupProgress || loading || totalRows === 0}>
    {backupProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
    {backupProgress
      ? t('pages.reportTemplates.backup.progress', backupProgress)
      : t('pages.reportTemplates.backup.downloadAll')}
  </Button>
</Can>
```

- [ ] **Step 8: Checks + commit**

```bash
bun run typecheck && bun run lint && bun run test -- src/pages/ReportTemplate
git add src/utils/reportTemplateBackup.ts src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateManagement.tsx src/i18n
git commit -m "feat(report-templates): backup เป็นไฟล์ JSON ทีละรายการ เลือกหลายแถว และทั้งหมด"
```

### Task F4: Import dialog

**Files:**
- Create: `src/pages/reportTemplates/ReportTemplateImportDialog.tsx`
- Modify: `src/pages/ReportTemplateManagement.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `parseBackup`, `MAX_BACKUP_BYTES`, `BackupTemplate`, `BackupProblem` (F3); `pickLocalized`, `secondaryLocalized` (F1).
- Produces: `<ReportTemplateImportDialog open onOpenChange onImported />` (default export).

- [ ] **Step 1: i18n** — `pages.reportTemplates.importDialog` in both files:

en:
```ts
      importDialog: {
        button: 'Import',
        title: 'Import report templates',
        description: 'Choose a backup file (.json). Templates are matched by name (EN).',
        pickFile: 'Choose file',
        tooLarge: 'File is larger than 10 MB',
        invalidJson: 'The file is not valid JSON',
        wrongFormat: 'This is not a report template backup file',
        newerFormat: 'This file comes from a newer version of the app',
        empty: 'The file contains no templates',
        loadingExisting: 'Checking existing templates…',
        colName: 'Name',
        colGroup: 'Group',
        colType: 'Type',
        colStatus: 'Status',
        colAction: 'Action',
        statusNew: 'New',
        statusConflict: 'Name exists',
        statusInvalid: 'Invalid',
        actionCreate: 'Create',
        actionOverwrite: 'Overwrite',
        actionSkip: 'Skip',
        overwriteAll: 'Overwrite all',
        run: 'Import {{count}}',
        running: 'Importing {{done}}/{{total}}',
        summary: 'Created {{created}} · overwritten {{overwritten}} · skipped {{skipped}} · failed {{failed}}',
        resultCreated: 'Created',
        resultOverwritten: 'Overwritten',
        resultFailed: 'Failed',
        nothingToDo: 'Nothing to import',
        problem: {
          missingName: 'Missing name',
          missingGroup: 'Missing report group',
          missingXml: 'Missing dialog/content XML',
          badTemplateType: 'Unknown template type',
          badDialogXml: 'Dialog XML is invalid',
          badContentXml: 'Content XML is invalid',
          duplicateInFile: 'Name repeated in this file',
        },
      },
```

th:
```ts
      importDialog: {
        button: 'นำเข้า',
        title: 'นำเข้าเทมเพลตรายงาน',
        description: 'เลือกไฟล์ backup (.json) ระบบจับคู่กับของเดิมด้วยชื่อ (EN)',
        pickFile: 'เลือกไฟล์',
        tooLarge: 'ไฟล์ใหญ่เกิน 10 MB',
        invalidJson: 'ไฟล์ไม่ใช่ JSON ที่ถูกต้อง',
        wrongFormat: 'ไฟล์นี้ไม่ใช่ไฟล์ backup ของเทมเพลตรายงาน',
        newerFormat: 'ไฟล์นี้มาจากแอปเวอร์ชันใหม่กว่า',
        empty: 'ไม่มีเทมเพลตในไฟล์',
        loadingExisting: 'กำลังตรวจเทมเพลตที่มีอยู่…',
        colName: 'ชื่อ',
        colGroup: 'กลุ่ม',
        colType: 'ประเภท',
        colStatus: 'สถานะ',
        colAction: 'การทำงาน',
        statusNew: 'ใหม่',
        statusConflict: 'ชื่อซ้ำ',
        statusInvalid: 'ไม่ผ่านตรวจ',
        actionCreate: 'สร้าง',
        actionOverwrite: 'เขียนทับ',
        actionSkip: 'ข้าม',
        overwriteAll: 'เขียนทับทั้งหมด',
        run: 'นำเข้า {{count}} รายการ',
        running: 'กำลังนำเข้า {{done}}/{{total}}',
        summary: 'สร้าง {{created}} · เขียนทับ {{overwritten}} · ข้าม {{skipped}} · ล้มเหลว {{failed}}',
        resultCreated: 'สร้างแล้ว',
        resultOverwritten: 'เขียนทับแล้ว',
        resultFailed: 'ล้มเหลว',
        nothingToDo: 'ไม่มีรายการให้นำเข้า',
        problem: {
          missingName: 'ไม่มีชื่อ',
          missingGroup: 'ไม่มีกลุ่มรายงาน',
          missingXml: 'ไม่มี XML ของ dialog/content',
          badTemplateType: 'ประเภทเทมเพลตไม่รู้จัก',
          badDialogXml: 'Dialog XML ไม่ถูกต้อง',
          badContentXml: 'Content XML ไม่ถูกต้อง',
          duplicateInFile: 'ชื่อซ้ำกันในไฟล์',
        },
      },
```

- [ ] **Step 2: Component**

```tsx
import React, { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import reportTemplateService, { type ReportTemplate } from '../../services/reportTemplateService';
import { parseBackup, MAX_BACKUP_BYTES, type BackupTemplate, type BackupProblem } from '../../utils/reportTemplateBackup';
import { pickLocalized, secondaryLocalized } from '../../utils/localized';
import { getErrorDetail } from '../../utils/errorParser';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

type Status = 'new' | 'conflict' | 'invalid';
type Action = 'create' | 'overwrite' | 'skip';
type Outcome = 'created' | 'overwritten' | 'skipped' | 'failed';

interface Row {
  index: number;
  template: BackupTemplate;
  problems: BackupProblem[];
  status: Status;
  existingId?: string;
  action: Action;
  outcome?: Outcome;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** โหลดชื่อ template ทั้งหมดในระบบ (หน้าละ 100 ตาม cap) → Map<name, id> */
async function loadExistingNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const res: any = await reportTemplateService.getAll({ page, perpage: 100 });
    const inner = res.data?.data ?? res.data ?? res;
    const items: ReportTemplate[] = Array.isArray(inner) ? inner : (inner?.data ?? []);
    items.forEach((r) => map.set(r.name, r.id));
    const total = (inner?.paginate ?? res.data?.paginate ?? res.paginate)?.total ?? map.size;
    if (items.length === 0 || page * 100 >= total) break;
  }
  return map;
}

/** ตัด id/version ของไฟล์ทิ้ง — import ไม่ใช้ */
function payloadOf(tpl: BackupTemplate): Partial<ReportTemplate> {
  const { id: _id, version: _version, ...rest } = tpl;
  return { ...rest, change_type: 'import' };
}

export default function ReportTemplateImportDialog({ open, onOpenChange, onImported }: Props) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState(false);

  const running = progress !== null;

  const reset = () => {
    setRows(null);
    setFinished(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (next: boolean) => {
    if (running) return; // ปิดระหว่างนำเข้าไม่ได้
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error(t('pages.reportTemplates.importDialog.tooLarge'));
      return;
    }
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      toast.error(t(`pages.reportTemplates.importDialog.${parsed.error}` as TKey));
      return;
    }
    setChecking(true);
    try {
      const existing = await loadExistingNames();
      setRows(
        parsed.entries.map((e) => {
          const existingId = existing.get(e.template.name);
          const status: Status = e.problems.length ? 'invalid' : existingId ? 'conflict' : 'new';
          return { ...e, status, existingId, action: status === 'new' ? 'create' : 'skip' };
        }),
      );
    } catch (err: unknown) {
      toast.error(getErrorDetail(err, t));
    } finally {
      setChecking(false);
    }
  };

  const setAction = (index: number, action: Action) =>
    setRows((prev) => prev?.map((r) => (r.index === index ? { ...r, action } : r)) ?? null);

  const overwriteAll = () =>
    setRows((prev) => prev?.map((r) => (r.status === 'conflict' ? { ...r, action: 'overwrite' } : r)) ?? null);

  const todo = rows?.filter((r) => r.action !== 'skip') ?? [];

  const run = async () => {
    if (!rows) return;
    if (todo.length === 0) {
      toast.info(t('pages.reportTemplates.importDialog.nothingToDo'));
      return;
    }
    setProgress({ done: 0, total: todo.length });
    const next = [...rows];
    let done = 0;
    // ทีละรายการตามลำดับ — ลำดับเวอร์ชันอ่านง่าย และไม่ชน partial index ของ is_default
    for (const row of next) {
      if (row.action === 'skip') {
        row.outcome = 'skipped';
        continue;
      }
      try {
        if (row.action === 'create') {
          await reportTemplateService.create({ ...payloadOf(row.template), is_default: false });
          row.outcome = 'created';
        } else if (row.existingId) {
          const res = await reportTemplateService.getById(row.existingId);
          const current = (res?.data ?? res) as ReportTemplate;
          await reportTemplateService.update(row.existingId, {
            ...payloadOf(row.template),
            is_default: current.is_default,
            ...(current.doc_version != null ? { doc_version: current.doc_version } : {}),
          });
          row.outcome = 'overwritten';
        }
      } catch (err: unknown) {
        row.outcome = 'failed';
        row.error = getErrorDetail(err, t);
      }
      done += 1;
      setProgress({ done, total: todo.length });
      setRows([...next]);
    }
    setProgress(null);
    setFinished(true);

    const count = (o: Outcome) => next.filter((r) => r.outcome === o).length;
    const failed = count('failed');
    const succeeded = count('created') + count('overwritten');
    const summary = t('pages.reportTemplates.importDialog.summary', {
      created: count('created'), overwritten: count('overwritten'), skipped: count('skipped'), failed,
    });
    if (failed === 0) toast.success(summary);
    else if (succeeded === 0) toast.error(summary);
    else toast.warning(summary);
    if (succeeded > 0) onImported();
  };

  const statusBadge = (s: Status) => (
    <Badge variant={s === 'new' ? 'success' : s === 'conflict' ? 'secondary' : 'destructive'}>
      {t(`pages.reportTemplates.importDialog.status${s === 'new' ? 'New' : s === 'conflict' ? 'Conflict' : 'Invalid'}` as TKey)}
    </Badge>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pages.reportTemplates.importDialog.title')}</DialogTitle>
          <DialogDescription>{t('pages.reportTemplates.importDialog.description')}</DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="flex flex-col items-start gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={checking}>
              {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {checking ? t('pages.reportTemplates.importDialog.loadingExisting') : t('pages.reportTemplates.importDialog.pickFile')}
            </Button>
          </div>
        )}

        {rows && (
          <div className="space-y-3">
            {!finished && rows.some((r) => r.status === 'conflict') && (
              <Button variant="outline" size="sm" onClick={overwriteAll} disabled={running}>
                {t('pages.reportTemplates.importDialog.overwriteAll')}
              </Button>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colName')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colGroup')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colType')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colStatus')}</th>
                    <th className="px-3 py-2">{t('pages.reportTemplates.importDialog.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const secondary = secondaryLocalized(r.template.name_i18n, lang);
                    return (
                      <tr key={r.index} className="border-t align-top">
                        <td className="px-3 py-2">
                          <div>{pickLocalized(r.template.name_i18n, r.template.name, lang)}</div>
                          {secondary && <div className="text-xs text-muted-foreground">{secondary}</div>}
                          {r.problems.map((p) => (
                            <div key={p} className="text-xs text-destructive">
                              {t(`pages.reportTemplates.importDialog.problem.${p}` as TKey)}
                            </div>
                          ))}
                          {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                        </td>
                        <td className="px-3 py-2">{r.template.report_group}</td>
                        <td className="px-3 py-2">{r.template.template_type ?? 'list'}</td>
                        <td className="px-3 py-2">{statusBadge(r.status)}</td>
                        <td className="px-3 py-2">
                          {r.outcome ? (
                            <span className={r.outcome === 'failed' ? 'text-destructive' : ''}>
                              {t(`pages.reportTemplates.importDialog.${
                                r.outcome === 'created' ? 'resultCreated'
                                : r.outcome === 'overwritten' ? 'resultOverwritten'
                                : r.outcome === 'failed' ? 'resultFailed' : 'actionSkip'}` as TKey)}
                            </span>
                          ) : r.status === 'conflict' ? (
                            <Select value={r.action} onValueChange={(v) => setAction(r.index, v as Action)} disabled={running}>
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="skip">{t('pages.reportTemplates.importDialog.actionSkip')}</SelectItem>
                                <SelectItem value="overwrite">{t('pages.reportTemplates.importDialog.actionOverwrite')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground">
                              {t(r.action === 'create' ? 'pages.reportTemplates.importDialog.actionCreate' : 'pages.reportTemplates.importDialog.actionSkip')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={running}>
            {t('common.cancel')}
          </Button>
          {rows && !finished && (
            <Button onClick={run} disabled={running || todo.length === 0}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {running
                ? t('pages.reportTemplates.importDialog.running', progress!)
                : t('pages.reportTemplates.importDialog.run', { count: todo.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Verify every imported ui export name exists (`grep -n "^export" src/components/ui/dialog.tsx src/components/ui/select.tsx`). Confirm `Badge` has `destructive` variant; if not, use `outline` + `text-destructive`.

- [ ] **Step 3: Wire into Management** — state `const [importOpen, setImportOpen] = useState(false);`; button in `PageHeader actions` before "Add":

```tsx
<Can permission="report_template.create">
  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
    <Upload className="mr-2 h-4 w-4" />
    {t('pages.reportTemplates.importDialog.button')}
  </Button>
</Can>
```

and next to the delete `ConfirmDialog`:

```tsx
<ReportTemplateImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => fetchTemplates(paginate)} />
```

- [ ] **Step 4: Checks + commit**

```bash
bun run typecheck && bun run lint && bun run test -- src/pages/ReportTemplate
git add src/pages/reportTemplates/ReportTemplateImportDialog.tsx src/pages/ReportTemplateManagement.tsx src/i18n
git commit -m "feat(report-templates): นำเข้าไฟล์ backup พร้อมพรีวิว สร้าง/เขียนทับ/ข้าม รายแถว"
```

### Task F5: `@codemirror/merge` + `XmlDiffView`

**Files:**
- Modify: `package.json`, `bun.lock`, `package-lock.json`
- Create: `src/components/XmlDiffView.tsx`

**Interfaces:**
- Produces: `<XmlDiffView original: string; current: string; height?: string />` — left/top = `original` (the version), right = `current`; side-by-side at `md+`, unified below.

- [ ] **Step 1: Install (user approved this dependency)**

```bash
bun add @codemirror/merge
npm install --package-lock-only --ignore-scripts
bun pm ls 2>/dev/null | grep -E "@codemirror/(state|view)@" | sort -u
```

Expected: exactly one `@codemirror/state` and one `@codemirror/view` version (the `overrides` pin them). If two appear, stop and report — two copies break CM6 at runtime with "Unrecognized extension value".

- [ ] **Step 2: Component**

```tsx
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { xml } from '@codemirror/lang-xml';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { carmenEditorTheme, carmenHighlightStyle } from '../lib/codemirrorTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface XmlDiffViewProps {
  /** เนื้อหาของเวอร์ชันที่เลือก (ฝั่งซ้าย/ต้นฉบับ) */
  original: string;
  /** เนื้อหาปัจจุบัน (ฝั่งขวา) */
  current: string;
  height?: string;
}

const readOnlyExtensions = () => [
  lineNumbers(),
  xml(),
  syntaxHighlighting(carmenHighlightStyle, { fallback: true }),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  carmenEditorTheme('12px'),
];

const COLLAPSE = { margin: 3, minSize: 4 };

/**
 * diff XML แบบอ่านอย่างเดียว — side-by-side ที่ md ขึ้นไป, unified บนจอแคบ
 */
export const XmlDiffView: React.FC<XmlDiffViewProps> = ({ original, current, height = '420px' }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    if (wide) {
      const view = new MergeView({
        a: { doc: original, extensions: readOnlyExtensions() },
        b: { doc: current, extensions: readOnlyExtensions() },
        parent,
        collapseUnchanged: COLLAPSE,
        highlightChanges: true,
        gutter: true,
      });
      return () => view.destroy();
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: current,
        extensions: [
          ...readOnlyExtensions(),
          unifiedMergeView({ original, mergeControls: false, collapseUnchanged: COLLAPSE }),
        ],
      }),
    });
    return () => view.destroy();
  }, [original, current, wide]);

  return <div ref={hostRef} className="overflow-auto rounded-md border" style={{ maxHeight: height }} />;
};
```

Check the `@codemirror/language` import path for `syntaxHighlighting` matches what `XmlEditor.tsx` uses (lines 6-12).

- [ ] **Step 3: Checks + commit**

```bash
bun run typecheck && bun run lint && bun run build
git add package.json bun.lock package-lock.json src/components/XmlDiffView.tsx
git commit -m "feat(xml): XmlDiffView ด้วย @codemirror/merge (side-by-side / unified บนจอแคบ)"
```

### Task F6: Versions Sheet + version badge + restore

**Files:**
- Create: `src/pages/reportTemplates/useReportTemplateVersions.ts`
- Create: `src/pages/reportTemplates/ReportTemplateVersionsSheet.tsx`
- Modify: `src/pages/ReportTemplateEdit.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `listVersions`, `getVersion`, `restoreVersion` (F1); `XmlDiffView` (F5); `toBackupTemplate`, `buildBackup`, `backupFileName`, `downloadJSON` (F3); `pickLocalized` (F1); `normalizeAudit` + `AuditMeta`.
- Produces: `<ReportTemplateVersionsSheet templateId current docVersion editing onRestored />`.

- [ ] **Step 1: i18n** — `pages.reportTemplates.versions`:

en:
```ts
      versions: {
        button: 'Versions',
        title: 'Version history',
        description: 'Every save creates a version. Expand one to compare it with the current template.',
        empty: 'No versions yet',
        emptyDescription: 'Versions are recorded from the next save.',
        loadError: 'Could not load versions',
        current: 'Current',
        changeCreate: 'Created',
        changeUpdate: 'Updated',
        changeImport: 'Imported',
        changeRestore: 'Restored from v{{from}}',
        changedFields: 'Changed fields',
        noFieldChanges: 'Same metadata as current',
        download: 'Download this version',
        restore: 'Restore this version',
        restoreBlocked: 'Save or cancel your edits first',
        restoreTitle: 'Restore v{{version}}?',
        restoreDescription: 'This creates v{{next}} from the content of v{{version}}. The default-form flag is not changed.',
        restored: 'Restored v{{version}}',
      },
```

th:
```ts
      versions: {
        button: 'เวอร์ชัน',
        title: 'ประวัติเวอร์ชัน',
        description: 'ทุกครั้งที่บันทึกจะเกิดเวอร์ชันใหม่ กางดูเพื่อเทียบกับเทมเพลตปัจจุบัน',
        empty: 'ยังไม่มีเวอร์ชัน',
        emptyDescription: 'ระบบจะเริ่มบันทึกเวอร์ชันตั้งแต่การบันทึกครั้งถัดไป',
        loadError: 'โหลดเวอร์ชันไม่สำเร็จ',
        current: 'ปัจจุบัน',
        changeCreate: 'สร้าง',
        changeUpdate: 'แก้ไข',
        changeImport: 'นำเข้า',
        changeRestore: 'กู้จาก v{{from}}',
        changedFields: 'ฟิลด์ที่ต่างจากปัจจุบัน',
        noFieldChanges: 'ข้อมูลทั่วไปเหมือนปัจจุบัน',
        download: 'ดาวน์โหลดเวอร์ชันนี้',
        restore: 'กู้คืนเวอร์ชันนี้',
        restoreBlocked: 'บันทึกหรือยกเลิกการแก้ไขก่อน',
        restoreTitle: 'กู้คืน v{{version}}?',
        restoreDescription: 'จะสร้าง v{{next}} จากเนื้อหาของ v{{version}} · ค่าฟอร์มเริ่มต้น (is_default) จะไม่เปลี่ยน',
        restored: 'กู้คืน v{{version}} แล้ว',
      },
```

- [ ] **Step 2: Hook `useReportTemplateVersions.ts`** (generation-counter race guard, per `agent-os/standards/hooks/`)

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import reportTemplateService, {
  type ReportTemplateVersion,
  type ReportTemplateVersionSummary,
} from '../../services/reportTemplateService';
import { getErrorDetail, isNotFoundError } from '../../utils/errorParser';

/**
 * รายการเวอร์ชันของ template หนึ่งตัว + โหลด snapshot ทีละเวอร์ชันพร้อม cache
 * `unsupported` = backend ยังไม่มี endpoint (404) → หน้าแม่ซ่อนปุ่ม
 */
export function useReportTemplateVersions(templateId: string | undefined, enabled: boolean) {
  const [versions, setVersions] = useState<ReportTemplateVersionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [details, setDetails] = useState<Record<number, ReportTemplateVersion | undefined>>({});
  const [detailLoading, setDetailLoading] = useState<Record<number, boolean>>({});
  const generationRef = useRef(0);
  const requestedRef = useRef<Set<number>>(new Set());

  const reload = useCallback(() => {
    if (!templateId) return;
    const generation = ++generationRef.current;
    setLoading(true);
    setError('');
    reportTemplateService
      .listVersions(templateId)
      .then((list) => {
        if (generation === generationRef.current) setVersions(list);
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        if (isNotFoundError(err)) setUnsupported(true);
        else setError(getErrorDetail(err));
      })
      .finally(() => {
        if (generation === generationRef.current) setLoading(false);
      });
  }, [templateId]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const loadDetail = useCallback(
    (version: number) => {
      if (!templateId || requestedRef.current.has(version)) return;
      requestedRef.current.add(version);
      setDetailLoading((d) => ({ ...d, [version]: true }));
      reportTemplateService
        .getVersion(templateId, version)
        .then((row) => setDetails((d) => ({ ...d, [version]: row })))
        .catch((err: unknown) => {
          requestedRef.current.delete(version);
          setError(getErrorDetail(err));
        })
        .finally(() => setDetailLoading((d) => ({ ...d, [version]: false })));
    },
    [templateId],
  );

  return { versions, loading, error, unsupported, details, detailLoading, loadDetail, reload };
}
```

Probe once on mount for `unsupported` so the Edit page can hide the button before it is ever opened: in the Sheet, call the hook with `enabled = open || !probed`, where `probed` flips true after the first response (see Step 3).

- [ ] **Step 3: `ReportTemplateVersionsSheet.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { ChevronDown, Download, GitCompare, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Tooltip } from '../../components/ui/tooltip';
import { EmptyState } from '../../components/EmptyState';
import { AuditMeta } from '../../components/AuditMeta';
import { TabStrip } from '../../components/TabStrip';
import { XmlDiffView } from '../../components/XmlDiffView';
import Can from '../../components/Can';
import reportTemplateService, {
  type ReportTemplate,
  type ReportTemplateVersionSummary,
  type ReportTemplateSnapshot,
} from '../../services/reportTemplateService';
import { normalizeAudit } from '../../utils/audit';
import { isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { getErrorDetail } from '../../utils/errorParser';
import { countLines } from '../../utils/xml';
import { buildBackup, backupFileName, downloadJSON, toBackupTemplate } from '../../utils/reportTemplateBackup';
import { useI18n } from '../../hooks/useI18n';
import { cn } from '../../lib/utils';
import { useReportTemplateVersions } from './useReportTemplateVersions';

interface Props {
  templateId: string;
  /** แถวล่าสุดที่บันทึกแล้ว (templateRecord) — ใช้เทียบ diff */
  current: ReportTemplate;
  docVersion?: number;
  /** หน้าแม่อยู่ในโหมดแก้ไข → ปิดปุ่มกู้คืน */
  editing: boolean;
  onRestored: () => Promise<void> | void;
}

/** ฟิลด์ scalar ที่แสดงในรายการ "ต่างจากปัจจุบัน" (XML ไปอยู่ใน diff แยก) */
const SCALAR_FIELDS: Array<{ key: string; read: (s: Partial<ReportTemplateSnapshot>) => unknown }> = [
  { key: 'name', read: (s) => s.name_i18n?.en ?? s.name },
  { key: 'name.th', read: (s) => s.name_i18n?.th ?? '' },
  { key: 'description', read: (s) => s.description_i18n?.en ?? s.description ?? '' },
  { key: 'description.th', read: (s) => s.description_i18n?.th ?? '' },
  { key: 'report_group', read: (s) => s.report_group },
  { key: 'template_type', read: (s) => s.template_type },
  { key: 'is_active', read: (s) => s.is_active },
  { key: 'is_standard', read: (s) => s.is_standard },
  { key: 'builder_key', read: (s) => s.builder_key ?? '' },
  { key: 'source_type', read: (s) => s.source_type },
  { key: 'source_name', read: (s) => s.source_name ?? '' },
  { key: 'source_params', read: (s) => JSON.stringify(s.source_params ?? {}) },
  { key: 'orientation', read: (s) => s.orientation },
  { key: 'allow_business_unit', read: (s) => JSON.stringify(s.allow_business_unit ?? null) },
  { key: 'deny_business_unit', read: (s) => JSON.stringify(s.deny_business_unit ?? null) },
];

const fmt = (v: unknown) => (v === '' || v == null ? '—' : String(v));

export const ReportTemplateVersionsSheet: React.FC<Props> = ({ templateId, current, docVersion, editing, onRestored }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [probed, setProbed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [xmlTab, setXmlTab] = useState<'dialog' | 'content'>('content');
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const v = useReportTemplateVersions(templateId, open || !probed);

  React.useEffect(() => {
    if (!v.loading && (v.versions.length > 0 || v.error || v.unsupported)) setProbed(true);
  }, [v.loading, v.versions.length, v.error, v.unsupported]);

  const changeLabel = (row: ReportTemplateVersionSummary) =>
    row.change_type === 'restore'
      ? t('pages.reportTemplates.versions.changeRestore', { from: row.restored_from_version ?? '?' })
      : t(row.change_type === 'create' ? 'pages.reportTemplates.versions.changeCreate'
        : row.change_type === 'import' ? 'pages.reportTemplates.versions.changeImport'
        : 'pages.reportTemplates.versions.changeUpdate');

  const toggle = (version: number) => {
    if (expanded === version) {
      setExpanded(null);
      return;
    }
    setExpanded(version);
    v.loadDetail(version); // cache ในตัว — กางซ้ำไม่ยิงใหม่
  };

  const restore = async () => {
    if (confirmVersion == null) return;
    try {
      await reportTemplateService.restoreVersion(templateId, confirmVersion, docVersion);
      toast.success(t('pages.reportTemplates.versions.restored', { version: confirmVersion }));
      await onRestored();
      v.reload();
      setExpanded(null);
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict(t);
        await onRestored();
      } else {
        toast.error(getErrorDetail(err, t));
      }
    }
  };

  const nextVersion = (docVersion ?? 0) + 1;

  if (v.unsupported) return null; // backend ยังไม่ขึ้น — ซ่อนทั้งปุ่ม

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitCompare className="mr-2 h-4 w-4" />
        {t('pages.reportTemplates.versions.button')}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{t('pages.reportTemplates.versions.title')}</SheetTitle>
            <SheetDescription>{t('pages.reportTemplates.versions.description')}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {v.error && (
              <p className="text-destructive text-sm">{t('pages.reportTemplates.versions.loadError')} — {v.error}</p>
            )}
            {v.loading && v.versions.length === 0 && <Skeleton className="h-24 w-full" />}
            {!v.loading && !v.error && v.versions.length === 0 && (
              <EmptyState icon={GitCompare} title={t('pages.reportTemplates.versions.empty')} description={t('pages.reportTemplates.versions.emptyDescription')} />
            )}

            {v.versions.map((row) => {
              const isCurrent = row.version === docVersion;
              const detail = v.details[row.version];
              const isOpen = expanded === row.version;
              return (
                <div key={row.version} className="border-border border-b last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(row.version)}
                    className="focus-visible:ring-ring flex w-full items-center gap-3 py-3 text-left focus-visible:ring-1 focus-visible:outline-hidden"
                  >
                    <span className="font-mono text-sm font-medium">v{row.version}</span>
                    <Badge variant="outline">{changeLabel(row)}</Badge>
                    {isCurrent && <Badge variant="secondary">{t('pages.reportTemplates.versions.current')}</Badge>}
                    <span className="min-w-0 flex-1">
                      <AuditMeta variant="compact" actor={normalizeAudit(row).created} className="text-muted-foreground text-xs" />
                    </span>
                    <ChevronDown className={cn('text-muted-foreground size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                  </button>

                  {isOpen && (
                    <div className="space-y-4 pb-4">
                      {v.detailLoading[row.version] || !detail ? (
                        <Skeleton className="h-40 w-full" />
                      ) : (
                        <VersionDetail
                          snapshot={detail.snapshot}
                          current={current}
                          xmlTab={xmlTab}
                          onXmlTab={setXmlTab}
                        />
                      )}
                      {detail && (
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const tpl = toBackupTemplate({ ...detail.snapshot, id: templateId }, row.version);
                              downloadJSON(buildBackup([tpl]), backupFileName([tpl]));
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {t('pages.reportTemplates.versions.download')}
                          </Button>
                          {!isCurrent && (
                            <Can permission="report_template.update">
                              {editing ? (
                                <Tooltip content={t('pages.reportTemplates.versions.restoreBlocked')}>
                                  <span tabIndex={0}>
                                    <Button size="sm" disabled>
                                      <RotateCcw className="mr-2 h-4 w-4" />
                                      {t('pages.reportTemplates.versions.restore')}
                                    </Button>
                                  </span>
                                </Tooltip>
                              ) : (
                                <Button size="sm" onClick={() => setConfirmVersion(row.version)}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  {t('pages.reportTemplates.versions.restore')}
                                </Button>
                              )}
                            </Can>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmVersion !== null}
        onOpenChange={(o) => { if (!o) setConfirmVersion(null); }}
        title={t('pages.reportTemplates.versions.restoreTitle', { version: confirmVersion ?? '' })}
        description={t('pages.reportTemplates.versions.restoreDescription', { version: confirmVersion ?? '', next: nextVersion })}
        confirmText={t('pages.reportTemplates.versions.restore')}
        onConfirm={restore}
      />
    </>
  );
};

const VersionDetail: React.FC<{
  snapshot: ReportTemplateSnapshot;
  current: ReportTemplate;
  xmlTab: 'dialog' | 'content';
  onXmlTab: (tab: 'dialog' | 'content') => void;
}> = ({ snapshot, current, xmlTab, onXmlTab }) => {
  const { t } = useI18n();
  const changes = useMemo(
    () =>
      SCALAR_FIELDS.map((f) => ({ key: f.key, from: f.read(snapshot), to: f.read(current) }))
        .filter((c) => fmt(c.from) !== fmt(c.to)),
    [snapshot, current],
  );
  const dialogChanged = (snapshot.dialog ?? '') !== (current.dialog ?? '');
  const contentChanged = (snapshot.content ?? '') !== (current.content ?? '');
  const lineDelta = (a: string, b: string) => Math.abs(countLines(a) - countLines(b));

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{t('pages.reportTemplates.versions.changedFields')}</div>
        {changes.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t('pages.reportTemplates.versions.noFieldChanges')}</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {changes.map((c) => (
              <li key={c.key} className="break-all">
                <span className="font-mono">{c.key}</span>: {fmt(c.from)} → {fmt(c.to)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <TabStrip
        tabs={[
          { id: 'dialog', label: t('pages.reportTemplates.dialogXmlTab'), count: dialogChanged ? lineDelta(snapshot.dialog ?? '', current.dialog ?? '') : undefined },
          { id: 'content', label: t('pages.reportTemplates.contentXmlTab'), count: contentChanged ? lineDelta(snapshot.content ?? '', current.content ?? '') : undefined },
        ]}
        value={xmlTab}
        onChange={onXmlTab}
      />
      {xmlTab === 'dialog' ? (
        <XmlDiffView original={snapshot.dialog ?? ''} current={current.dialog ?? ''} />
      ) : (
        <XmlDiffView original={snapshot.content ?? ''} current={current.content ?? ''} />
      )}
    </div>
  );
};
```

Before writing: check whether `lucide-react` has `GitCompare` (else `History`). The `count` prop is the *line-count difference*, which can be `0` for an edit that changes lines without adding any — acceptable; spec only asks it to signal change.

- [ ] **Step 4: Wire into Edit page**

In `PageHeader` add:

```tsx
afterTitle={!isNew && !loading && docVersion != null ? <Badge variant="secondary">v{docVersion}</Badge> : undefined}
```

In `actions`, right after the `ActivityTrailSheet` `<Can>` block (before the backup button from F3):

```tsx
<Can permission="report_template.read">
  {templateRecord && id && (
    <ReportTemplateVersionsSheet
      templateId={id}
      current={templateRecord as ReportTemplate}
      docVersion={docVersion}
      editing={editing}
      onRestored={fetchTemplate}
    />
  )}
</Can>
```

- [ ] **Step 5: Checks + commit**

```bash
bun run typecheck && bun run lint && bun run test -- src/pages/ReportTemplate
git add src/pages/reportTemplates src/pages/ReportTemplateEdit.tsx src/i18n
git commit -m "feat(report-templates): แผ่นประวัติเวอร์ชัน diff XML และกู้คืนเวอร์ชัน + ป้าย vN บนหัว"
```

### Task F7: Full gates, browser verification, PR

- [ ] **Step 1: Gates**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

- [ ] **Step 2: Restart the dev server** (`bun run dev:localhost`, port 3304) — the Vite checker overlay can show stale TS errors after catalog edits.

- [ ] **Step 3: Browser checklist** (local backend on the B-branch, logged in as a platform admin) — spec §5 items 1–9 plus §7.3:
  1. Edit → fill Name TH + Description TH → save → toggle language → header and list switch; CSV has `name_th`/`description_th`.
  2. Description TH only → saves; Name TH only (EN empty) → blocked by the required check.
  3. Save twice → Versions sheet shows two new rows; header badge `vN` equals the "Current" row.
  4. Expand an old version → field list + side-by-side diff; re-expand → 0 new requests (Network tab).
  5. Restore → toast, new row "Restored from vX", `is_default` unchanged; enter edit mode → restore button disabled with tooltip; two tabs, restore in the stale one → conflict toast + refetch.
  6. Edit page "Download backup" while dirty → file contains the saved values. Row menu, 3 selected rows, "Backup all" with a filter → open files, all 20 fields present including the six from B1.
  7. Import the batch file → all rows "Name exists / Skip"; edit one name in the file → "New"; overwrite one → version `change_type=import`, six fields match the file. Broken files: non-JSON, wrong `format`, `format_version: 2`, one entry with bad XML → messages correct, bad entry locked.
  8. A user with only `report_template.read` → sees versions/export, not restore/import.
  9. 390px via iframe probe (`reference_iframe_viewport_probe`) → diff is unified, sheet and import table do not overflow the page.

- [ ] **Step 4: PR** (after backend PR B5 merged and deployed to DEV)

```bash
git push -u origin feature/report-template-versions-backup
gh pr create --base main --title "feat(report-templates): versions, backup/import, EN/TH name & description" --body "…spec + plan links, deploy order (BE first), dialog/content-empty deviation from spec §3.1…"
gh pr merge --auto --merge
```

**Do not** `git push origin main:vercel` until the backend is live on the backend production target — an old backend silently drops the six fields on import (spec §4).
