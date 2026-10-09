# Application Status Modes — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `tb_application` a `status` (`running` | `maintenance` | `read_only` | `disabled`) with a per-app bypass-user list, enforced by the gateway's `AppIdGuard`, settable through two new admin endpoints, and readable by clients through `GET /api/app-status`.

**Architecture:** An expand-only migration adds the status columns and a `tb_application_bypass_user` table. micro-cluster keeps the old `allowlistSnapshot` RPC untouched and adds `allowlistSnapshotV2`, which carries status and bypass ids for every non-deleted app. The gateway store loads V2 (falling back to V1 until V2 has ever answered), and `AppIdGuard` gates each request on status, method, `auth.*` and the bypass set. `is_active` is kept physically in sync with `status` for one release.

**Tech Stack:** NestJS 11 (gateway + micro-cluster), Prisma (platform schema), `@repo/rpc-contract` (generated), `@repo/error-catalog`, zod v4 / nestjs-zod, passport `keycloak` strategy, Bun, Jest.

**Spec:** `carmen-platform/docs/superpowers/specs/2026-10-09-application-status-modes-design.md` (Part 1, Deploy order, Risks, Verification)

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2` — every path below is relative to it.

## Global Constraints

- Branch: `feature/application-status-modes`, created from an up-to-date `main` (`git fetch origin && git switch -c feature/application-status-modes origin/main`). Never commit to `main`.
- **No new test files.** Do not create `*.spec.ts`. Existing specs must still pass; where an existing assertion breaks only because a mock lacks a new method or a fixture lacks a new field, update that mock/fixture — nothing else.
- Static checks per task: `bun run check-types` inside the touched app/package, and `bunx eslint <changed files>`. **Never run `bun run lint`** — it carries `--fix` and rewrites the whole repo.
- Jest: run per file with `bunx jest <path> --runInBand --forceExit` (LokiTransport keeps Jest alive otherwise).
- Status values, exactly: `running`, `maintenance`, `read_only`, `disabled`.
- Error codes, exactly: `APP_MAINTENANCE` (503), `APP_READ_ONLY` (503), `APP_DISABLED` (403), `APP_SELF_LOCK` (409).
- Read-only passes `GET`, `HEAD`, `OPTIONS`; every api_name starting with `auth.` passes in `maintenance` and `read_only`; `disabled` blocks everything including bypass users and login.
- `status_until` is display-only — nothing ever switches status automatically.
- Migration is **expand-only** (no DROP, no NOT-NULL on existing columns without default). Pushing a branch that contains a migration applies it to DEV within ~2 minutes even unmerged.
- Old RPC `Applications.allowlistSnapshot` must keep returning exactly what it returns today (active apps only, same shape).
- Every new `/api-system` route carries `@RequirePlatformPermission(...)` with an existing key (`application.update`). `audit:api-system-permission` only requires that each route declares a key present in `PLATFORM_PERMISSION_SEED`; `application.update` already guards `PUT /api-system/applications/:id` and passes it, so **no new permission key and no seed change**.
- New admin routes reuse the existing app-id key `application.update` — a new key that is not in an app's allowlist fails as 401 and logs users out (see the comment on `@Get('summary')` in `applications.controller.ts:171-190`).
- Bilingual JSDoc (English line + Thai line) on every new exported symbol and method, matching the surrounding files.

## Review Focus

1. **Gateway deployed before micro-cluster** — `allowlistSnapshotV2` has no handler yet. Expected: the gateway falls back to V1, treats every loaded app as `running`, and never boots fail-closed. Owned by Task 5 (Step 3 verifies by pointing at a V1-only micro-cluster).
2. **Transient V2 failure after V2 has worked once** — expected: keep the stale V2 snapshot (maintenance stays maintenance), do *not* fall back to V1 (which would silently re-open maintenance apps). Owned by Task 5.
3. **Bypass user hitting a route with no `KeycloakGuard`** (`auth.register`, `auth.signup-*`) during maintenance — expected: those are `auth.*`, so they pass anyway; any other KeycloakGuard-less route treats the caller as non-bypass. Owned by Task 6 (curl matrix row in Task 9).
4. **Old platform build sending `is_active: true` while the app is in `maintenance`** — expected: status stays `maintenance`. Owned by Task 3 (curl in Task 9).
5. **`status_until` in the past** — expected: 503 still sent, `until` still present, **no** `Retry-After` header (never a negative or zero value). Owned by Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/prisma-shared-schema-platform/prisma/schema.prisma` | new columns, new model, back-relations |
| `packages/prisma-shared-schema-platform/prisma/migrations/20261009100000_application_status_modes/migration.sql` | expand migration + backfill + CHECK |
| `packages/error-catalog/src/catalog.ts` | 4 new catalog entries (status + message source for the exception filter) |
| `apps/micro-cluster/src/cluster/application/application.status.ts` (new) | status constants, type, `isApplicationStatus`, `isActiveFor` |
| `apps/micro-cluster/src/cluster/application/application.service.ts` | read model, legacy mapping, `updateStatus`, `setBypassUsers`, `allowlistSnapshotV2`, summary |
| `apps/micro-cluster/src/cluster/application/application.controller.ts` | 3 new message handlers |
| `apps/micro-cluster/src/common/helpers/summary.helper.ts` | `ApplicationSummary.statuses` |
| `apps/micro-cluster/src/common/activity/platform-activity-registry.ts` | activity entries for the two new writes |
| `packages/rpc-contract/src/contracts/applications.ts` | regenerated (never hand-edited) |
| `apps/backend-gateway/src/common/guard/app-allowlist.store.ts` | V2 state per app, `getAppState`, `isBypassUser` |
| `apps/backend-gateway/src/common/guard/app-allowlist.refresher.ts` | V2 load with V1 fallback |
| `apps/backend-gateway/src/common/guard/app-id.guard.ts` | status gate, `statusProbe` option |
| `apps/backend-gateway/src/common/guard/app-id.guard.spec.ts` | mock gains `getAppState` / `isBypassUser` only |
| `apps/backend-gateway/src/platform/applications/applications.controller.ts` | `PATCH :id/status`, `PUT :id/bypass-users`, self-lock |
| `apps/backend-gateway/src/platform/applications/applications.service.ts` | two RPC wrappers |
| `apps/backend-gateway/src/platform/applications/swagger/request.ts` / `response.ts` | DTOs |
| `apps/backend-gateway/src/auth/guards/optional-keycloak.guard.ts` (new) | bearer token → `request.user` or nothing, never 401 |
| `apps/backend-gateway/src/application/app-status/app-status.controller.ts` + `app-status.module.ts` (new) | `GET /api/app-status` |
| `apps/backend-gateway/src/app.module.ts` | register `AppStatusModule` |
| `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts` | regenerated (`app.status`) |

---

### Task 1: Schema + expand migration

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/schema.prisma:65-88` (`tb_application`), `:477-501` (`tb_user` back-relations)
- Create: `packages/prisma-shared-schema-platform/prisma/migrations/20261009100000_application_status_modes/migration.sql`

**Interfaces:**
- Produces: Prisma fields `tb_application.status: string`, `status_message: string | null`, `status_until: Date | null`, `status_changed_at: Date | null`, `status_changed_by_id: string | null`; relation `tb_application.tb_application_bypass_user`; model `tb_application_bypass_user { id, application_id, user_id, created_at, created_by_id, tb_application, tb_user }`; relation on `tb_application` named `tb_user_tb_application_status_changed_by_idTotb_user`.

- [ ] **Step 1: Branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git fetch origin && git switch -c feature/application-status-modes origin/main
```

- [ ] **Step 2: Edit `tb_application`** — insert after `device String @default("web") @db.VarChar` (line 71):

```prisma
  /// running | maintenance | read_only | disabled — CHECK lives in the migration (Prisma cannot declare it)
  status               String    @default("running") @db.VarChar
  status_message       String?
  status_until         DateTime? @db.Timestamptz(6)
  status_changed_at    DateTime? @db.Timestamptz(6)
  status_changed_by_id String?   @db.Uuid
```

and after the line `tb_application_api tb_application_api[]` (line 81):

```prisma
  tb_application_bypass_user tb_application_bypass_user[]
```

and after the `tb_user_tb_application_updated_by_idTotb_user` relation (line 84):

```prisma
  tb_user_tb_application_status_changed_by_idTotb_user tb_user? @relation("tb_application_status_changed_by_idTotb_user", fields: [status_changed_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
```

- [ ] **Step 3: Add the new model** directly after `model tb_application { … }`:

```prisma
/// Users who keep full access while their application is in maintenance or read_only (never in disabled)
model tb_application_bypass_user {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  application_id String    @db.Uuid
  user_id        String    @db.Uuid
  created_at     DateTime? @default(now()) @db.Timestamptz(6)
  created_by_id  String?   @db.Uuid

  tb_application tb_application @relation(fields: [application_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  tb_user        tb_user        @relation("tb_application_bypass_user_user_idTotb_user", fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([application_id, user_id], map: "application_bypass_user_app_user_u")
  @@index([user_id], map: "application_bypass_user_user_idx")
}
```

- [ ] **Step 4: Back-relations on `tb_user`** — after `tb_application_api_tb_application_api_updated_by_idTotb_user …` (line 501):

```prisma
  tb_application_tb_application_status_changed_by_idTotb_user                               tb_application[]                    @relation("tb_application_status_changed_by_idTotb_user")
  tb_application_bypass_user_tb_application_bypass_user_user_idTotb_user                     tb_application_bypass_user[]        @relation("tb_application_bypass_user_user_idTotb_user")
```

- [ ] **Step 5: Write the migration**

`packages/prisma-shared-schema-platform/prisma/migrations/20261009100000_application_status_modes/migration.sql`:

```sql
-- 20261009100000_application_status_modes
-- expand เท่านั้น: เพิ่มสถานะการให้บริการของแอป + รายชื่อผู้ใช้ที่ได้รับยกเว้น
-- is_active ยังอยู่และถูก sync จาก status โดย micro-cluster — DROP ในรอบ contract ภายหลัง
ALTER TABLE "tb_application"
  ADD COLUMN IF NOT EXISTS "status"               VARCHAR        NOT NULL DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS "status_message"       TEXT,
  ADD COLUMN IF NOT EXISTS "status_until"         TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "status_changed_at"    TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "status_changed_by_id" UUID;

-- backfill จากสวิตช์เดิม — NULL นับเป็น active ตาม default ของคอลัมน์ (true)
UPDATE "tb_application"
   SET "status" = 'disabled'
 WHERE "is_active" = false AND "status" = 'running';

-- CHECK ที่ Prisma ประกาศให้ไม่ได้ — ตาข่ายสุดท้าย service ตรวจก่อนเสมอ
ALTER TABLE "tb_application" DROP CONSTRAINT IF EXISTS "application_status_chk";
ALTER TABLE "tb_application"
  ADD CONSTRAINT "application_status_chk"
  CHECK ("status" IN ('running', 'maintenance', 'read_only', 'disabled'));

ALTER TABLE "tb_application" DROP CONSTRAINT IF EXISTS "tb_application_status_changed_by_id_fkey";
ALTER TABLE "tb_application"
  ADD CONSTRAINT "tb_application_status_changed_by_id_fkey"
  FOREIGN KEY ("status_changed_by_id") REFERENCES "tb_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE IF NOT EXISTS "tb_application_bypass_user" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID           NOT NULL,
  "user_id"        UUID           NOT NULL,
  "created_at"     TIMESTAMPTZ(6) DEFAULT now(),
  "created_by_id"  UUID,
  CONSTRAINT "tb_application_bypass_user_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tb_application_bypass_user_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "tb_application"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "tb_application_bypass_user_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "tb_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "application_bypass_user_app_user_u"
  ON "tb_application_bypass_user" ("application_id", "user_id");
CREATE INDEX IF NOT EXISTS "application_bypass_user_user_idx"
  ON "tb_application_bypass_user" ("user_id");
```

- [ ] **Step 6: Generate client, build the package, type-check**

```bash
cd packages/prisma-shared-schema-platform
bun run db:generate && bun run build && bun run check-types
```

Expected: all three succeed. (`build` matters: consumers read `dist/*.d.ts`, and a stale `dist` produces fake type errors in Task 3.)

- [ ] **Step 7: Commit** — do **not** push yet (a push applies the migration to DEV).

```bash
git add packages/prisma-shared-schema-platform/prisma/schema.prisma \
        packages/prisma-shared-schema-platform/prisma/migrations/20261009100000_application_status_modes
git commit -m "feat(platform-schema): application status columns and bypass-user table (expand only)"
```

---

### Task 2: Error catalog entries

**Files:**
- Modify: `packages/error-catalog/src/catalog.ts` — insert after `APPLICATION_NOT_FOUND` (lines 2971-2977)

**Interfaces:**
- Produces: `ERROR_CATALOG.APP_MAINTENANCE` / `APP_READ_ONLY` / `APP_DISABLED` / `APP_SELF_LOCK`. The gateway `ExceptionFilter` (`apps/backend-gateway/src/exception/exception.fillter.ts:226-238`) looks thrown bodies' `code` up in this catalog; **a code missing from the catalog is stripped from the response**, and the entry's `http_status` overrides the thrown status. So these entries are mandatory, not cosmetic.

- [ ] **Step 1: Add entries**

```ts
  APP_MAINTENANCE: {
    code: 'APP_MAINTENANCE',
    id: makeId(MODULE.APPLICATION, 2),
    http_status: 503,
    message_en: 'This application is under maintenance',
    message_th: 'ระบบปิดปรับปรุงชั่วคราว',
  },
  APP_READ_ONLY: {
    code: 'APP_READ_ONLY',
    id: makeId(MODULE.APPLICATION, 3),
    http_status: 503,
    message_en: 'This application is read-only right now — changes cannot be saved',
    message_th: 'ระบบอยู่ในโหมดอ่านอย่างเดียว ยังบันทึกการเปลี่ยนแปลงไม่ได้',
  },
  APP_DISABLED: {
    code: 'APP_DISABLED',
    id: makeId(MODULE.APPLICATION, 4),
    http_status: 403,
    message_en: 'This application has been disabled',
    message_th: 'แอปพลิเคชันนี้ถูกปิดใช้งาน',
  },
  APP_SELF_LOCK: {
    code: 'APP_SELF_LOCK',
    id: makeId(MODULE.APPLICATION, 5),
    http_status: 409,
    message_en: 'You cannot take the application you are using offline — you would lose access to undo it',
    message_th: 'ปิดแอปที่กำลังใช้งานอยู่ไม่ได้ เพราะจะกลับมาแก้คืนไม่ได้',
  },
```

- [ ] **Step 2: Verify ids are unique, build, type-check, run its own spec**

```bash
cd packages/error-catalog
grep -n "makeId(MODULE.APPLICATION," src/catalog.ts   # expect running numbers 1..5, no duplicates
bun run build:package && bun run check-types
bunx jest src/catalog.spec.ts --runInBand --forceExit
```

Expected: PASS (the catalog spec checks uniqueness of code/id).

- [ ] **Step 3: Commit**

```bash
git add packages/error-catalog/src/catalog.ts
git commit -m "feat(error-catalog): APP_MAINTENANCE/READ_ONLY/DISABLED/SELF_LOCK"
```

---

### Task 3: micro-cluster read model, legacy `is_active` mapping, status filter, summary by status

**Files:**
- Create: `apps/micro-cluster/src/cluster/application/application.status.ts`
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts:21-35` (columns), `:151-195` (findAll select/map), `:284-306` (findOne), `:318-334` (create), `:349-379` (update), `:446-491` (summary)
- Modify: `apps/micro-cluster/src/common/helpers/summary.helper.ts:262-274`
- Modify: `apps/backend-gateway/src/platform/applications/swagger/response.ts` (`ApplicationResponseDto`, `ApplicationRegistrySummaryDto`)

**Interfaces:**
- Produces (used by Tasks 4, 7):

```ts
export const APPLICATION_STATUSES = ['running', 'maintenance', 'read_only', 'disabled'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export function isApplicationStatus(v: unknown): v is ApplicationStatus;
export function isActiveFor(status: ApplicationStatus): boolean; // status !== 'disabled'
```

- Read model adds to every row: `status`, `status_message`, `status_until`; `findOne` also `status_changed_at`, `status_changed_by_id`, `status_changed_by_name`, `bypass_users: { user_id: string; name: string; email: string }[]`.
- `ApplicationSummary.statuses: { running: number; maintenance: number; read_only: number; disabled: number }` — an object keyed by status, all four keys always present (zero-filled). Returned by both `GET /api-system/applications/summary` and the `summary` block of the list. The platform reads it as optional `summary.statuses`.
- **List filter wire shape (for the platform plan):** the gateway `PaginateQuery()` (`apps/backend-gateway/src/shared-dto/paginate.dto.ts:226-246`) `JSON.parse`s the `advance` query param, and micro-cluster's `QueryParams` puts `advance.where` straight into the Prisma `AND`. So a multi-value status filter is `GET /api-system/applications?advance=<urlencoded {"where":{"status":{"in":["maintenance","read_only"]}}}>` — combine with device in the same object: `{"where":{"status":{"in":[…]},"device":"web"}}`. Malformed JSON → 400 `INVALID_ADVANCE_FILTER`. The `access`-sort path re-renders the same `where` through `applicationWhereToSql`, which supports `{ in: [...] }` (`where-to-sql.ts:127`) once `status` is in `APPLICATION_COLUMNS` (Step 2).

- [ ] **Step 1: Create `application.status.ts`**

```ts
/**
 * Service status values of an application (x-app-id)
 * ค่าสถานะการให้บริการของแอปพลิเคชัน (x-app-id)
 */
export const APPLICATION_STATUSES = ['running', 'maintenance', 'read_only', 'disabled'] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Narrow an unknown value to an ApplicationStatus
 * ตรวจว่าค่าที่ได้รับเป็นสถานะที่รู้จัก
 * @param v - Any value / ค่าใดก็ได้
 * @returns True when v is one of APPLICATION_STATUSES / true เมื่อเป็นค่าที่อยู่ใน APPLICATION_STATUSES
 */
export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

/**
 * The legacy is_active value that mirrors a status (kept in sync until is_active is dropped)
 * ค่า is_active แบบเดิมที่สอดคล้องกับสถานะ (sync ไว้จนกว่าจะ DROP is_active)
 * @param status - Application status / สถานะแอป
 * @returns False only for disabled / false เฉพาะ disabled
 */
export function isActiveFor(status: ApplicationStatus): boolean {
  return status !== 'disabled';
}
```

- [ ] **Step 2: Sortable/filterable columns** — add to `APPLICATION_COLUMNS` (line 21 set) after `'device',`:

```ts
  'status',
  'status_message',
  'status_until',
  'status_changed_at',
  'status_changed_by_id',
```

(`advance.where` from the platform list — `{ status: { in: [...] } }` — goes straight to Prisma on the normal path and through `applicationWhereToSql` on the `access`-sort path; `where-to-sql.ts:127` already supports `in`.)

- [ ] **Step 3: `findAll`** — in the `select` (line 153-169) add after `device: true,`:

```ts
        status: true,
        status_message: true,
        status_until: true,
```

and in the `data` map (line 181-194) add after `device: app.device,`:

```ts
      status: app.status,
      status_message: app.status_message,
      status_until: app.status_until,
```

- [ ] **Step 4: `findOne`** — replace the `findFirst` + `Result.ok` body (lines 286-305) with:

```ts
    const app = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      include: {
        tb_application_api: { where: { deleted_at: null }, select: { api_name: true } },
        tb_user_tb_application_status_changed_by_idTotb_user: {
          select: { username: true, alias_name: true },
        },
        tb_application_bypass_user: {
          where: { tb_user: { deleted_at: null } },
          orderBy: { created_at: 'asc' },
          select: {
            user_id: true,
            tb_user: { select: { username: true, alias_name: true, email: true } },
          },
        },
      },
    });
    if (!app) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    const changedBy = app.tb_user_tb_application_status_changed_by_idTotb_user;
    return Result.ok({
      id: app.id,
      doc_version: app.doc_version,
      name: app.name,
      description: app.description,
      is_active: app.is_active,
      allow_all: app.allow_all,
      device: app.device,
      status: app.status,
      status_message: app.status_message,
      status_until: app.status_until,
      status_changed_at: app.status_changed_at,
      status_changed_by_id: app.status_changed_by_id,
      status_changed_by_name: changedBy ? changedBy.alias_name || changedBy.username : null,
      bypass_users: app.tb_application_bypass_user.map((row) => ({
        user_id: row.user_id,
        name: row.tb_user.alias_name || row.tb_user.username,
        email: row.tb_user.email,
      })),
      api_names: app.tb_application_api.map((row) => row.api_name),
      created_at: app.created_at,
      created_by_id: app.created_by_id,
      updated_at: app.updated_at,
      updated_by_id: app.updated_by_id,
    });
```

- [ ] **Step 5: `create`** — replace `is_active: data.is_active ?? true,` (line 327) with:

```ts
        // สร้างแอปที่ปิดไว้ตั้งแต่ต้นผ่าน is_active=false ของ build เก่า → disabled
        status: data.is_active === false ? 'disabled' : 'running',
        is_active: data.is_active === false ? false : true,
```

- [ ] **Step 6: `update` legacy mapping** — replace the line `...(data.is_active !== undefined && { is_active: data.is_active }),` (line 365) with a spread of `legacyStatus`, computed just before the `tb_application.update` call (after the doc_version check, line 359):

```ts
    // Legacy: platform builds before status modes still send is_active on the generic update.
    // false → disabled; true → running only when the app is currently disabled — never
    // overwrite maintenance/read_only, which old builds cannot even see.
    // build เก่ายังส่ง is_active มากับ update ปกติ: false → disabled; true → running เฉพาะเมื่อตอนนี้
    // disabled อยู่ — ห้ามทับ maintenance/read_only ที่ build เก่ามองไม่เห็นด้วยซ้ำ
    const legacyStatus =
      data.is_active === false
        ? { status: 'disabled', is_active: false, status_message: null, status_until: null }
        : data.is_active === true && existing.status === 'disabled'
          ? { status: 'running', is_active: true, status_message: null, status_until: null }
          : {};
    const statusTouched = 'status' in legacyStatus && legacyStatus.status !== existing.status;
```

and in the `data:` object:

```ts
        ...legacyStatus,
        ...(statusTouched && {
          status_changed_at: new Date().toISOString(),
          status_changed_by_id: user_id,
        }),
```

Any `status`, `status_message`, `status_until` keys in `data` are **ignored** here (status only changes through `updateStatus`, Task 4).

- [ ] **Step 7: Summary by status** — in `summary.helper.ts`, extend `ApplicationSummary` (line 262):

```ts
  /**
   * Live applications per service status, all four keys always present (zero-filled)
   * จำนวนแอปที่ยังอยู่แยกตามสถานะ มีครบทั้งสี่คีย์เสมอ (ไม่มีให้เป็น 0)
   */
  statuses: { running: number; maintenance: number; read_only: number; disabled: number };
```

In `buildApplicationSummary` (service line 446), add a fourth query to the `Promise.all`:

```ts
      this.prismaSystem.tb_application.groupBy({
        by: ['status'],
        where: liveWhere,
        _count: true,
      }),
```

destructure it as `statusGroups`, and add to the returned object:

```ts
      statuses: Object.fromEntries(
        APPLICATION_STATUSES.map((status) => [
          status,
          statusGroups.find((g) => g.status === status)?._count ?? 0,
        ]),
      ) as ApplicationSummary['statuses'],
```

with `import { APPLICATION_STATUSES } from './application.status';` at the top of the service.

- [ ] **Step 8: Gateway DTOs** — in `swagger/response.ts`, add to `ApplicationResponseDto` after `device`:

```ts
  @ApiProperty({
    description: 'Service status. is_active mirrors it (false only for disabled) until is_active is dropped',
    enum: ['running', 'maintenance', 'read_only', 'disabled'],
    example: 'running',
  })
  status: string;

  @ApiProperty({ description: 'Admin note shown to callers while not running', nullable: true, example: null })
  status_message: string | null;

  @ApiProperty({
    description: 'Expected return time — display only, nothing switches back automatically',
    nullable: true,
    example: null,
  })
  status_until: string | null;
```

and to `ApplicationRegistrySummaryDto` after `devices` (line 118):

```ts
  @ApiProperty({
    description: 'Live applications per service status; all four keys always present (zero-filled)',
    example: { running: 15, maintenance: 1, read_only: 0, disabled: 2 },
  })
  statuses: { running: number; maintenance: number; read_only: number; disabled: number };
```

- [ ] **Step 9: Type-check, lint, existing specs**

```bash
cd apps/micro-cluster && bun run check-types
bunx eslint src/cluster/application/application.service.ts src/cluster/application/application.status.ts src/common/helpers/summary.helper.ts
bunx jest src/cluster/application src/common/helpers --runInBand --forceExit
cd ../backend-gateway && bun run check-types && bunx eslint src/platform/applications/swagger/response.ts
```

Expected: PASS. If an existing `application.service.spec.ts` assertion fails only because `findOne`/`findAll` now return extra keys or the prisma mock lacks `groupBy` for `status`, update that fixture/mock — do not add new `it(...)` blocks.

- [ ] **Step 10: Commit**

```bash
git add apps/micro-cluster/src/cluster/application apps/micro-cluster/src/common/helpers/summary.helper.ts \
        apps/backend-gateway/src/platform/applications/swagger/response.ts
git commit -m "feat(micro-cluster): application status in read model, legacy is_active mapping, summary by status"
```

---

### Task 4: micro-cluster `updateStatus`, `setBypassUsers`, `allowlistSnapshotV2` + RPC contract

**Files:**
- Modify: `apps/micro-cluster/src/cluster/application/application.service.ts` (3 new methods after `delete`, before `allowlistSnapshot`)
- Modify: `apps/micro-cluster/src/cluster/application/application.controller.ts` (3 handlers after `allowlistSnapshot`)
- Modify: `apps/micro-cluster/src/common/activity/platform-activity-registry.ts:73-75`
- Regenerate: `packages/rpc-contract/src/contracts/applications.ts`

**Interfaces:**
- Consumes: `APPLICATION_STATUSES`, `isApplicationStatus`, `isActiveFor` (Task 3).
- Produces RPC endpoints (names after generation): `Applications.updateStatus` (`applications.update-status`), `Applications.setBypassUsers` (`applications.set-bypass-users`), `Applications.allowlistSnapshotV2` (`applications.allowlist-snapshot-v2`).
- `updateStatus` payload `{ id, data: { status, status_message?, status_until?, doc_version? }, user_id, version }` → `Result<{ id: string; doc_version: number }>`.
- `setBypassUsers` payload `{ id, data: { user_ids: string[] }, user_id, version }` → `Result<{ id: string; user_ids: string[] }>`.
- `allowlistSnapshotV2` → `Result<AllowlistSnapshotV2Item[]>`:

```ts
interface AllowlistSnapshotV2Item {
  id: string;
  allow_all: boolean;
  device: string;
  apis: string[];
  status: 'running' | 'maintenance' | 'read_only' | 'disabled';
  status_message: string | null;
  status_until: string | null; // ISO
  bypass_user_ids: string[];
}
```

- [ ] **Step 1: Service methods** — add to `ApplicationService` (import `isApplicationStatus`, `isActiveFor` from `./application.status`):

```ts
  /**
   * Changes an application's service status; clears message/until when returning to running
   * เปลี่ยนสถานะการให้บริการของแอป และล้างข้อความ/เวลาเมื่อกลับเป็น running
   * @param id - Application UUID / UUID ของแอป
   * @param data - { status, status_message?, status_until?, doc_version? }
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns The id and the new doc_version / id และ doc_version ใหม่
   */
  @TryCatch
  async updateStatus(
    id: string,
    data: any,
    user_id: string,
    version: string,
  ): Promise<Result<{ id: string; doc_version: number }>> {
    this.logger.debug({ function: 'updateStatus', id, data, user_id, version }, ApplicationService.name);
    const existing = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!existing) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    if (!isApplicationStatus(data?.status)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: 'status must be one of running, maintenance, read_only, disabled',
      });
    }
    let until: string | null = null;
    if (data.status !== 'running' && data.status_until) {
      const parsed = new Date(data.status_until);
      if (Number.isNaN(parsed.getTime())) {
        return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
          errors: 'status_until must be an ISO date-time',
        });
      }
      until = parsed.toISOString();
    }
    const message =
      data.status !== 'running' && typeof data.status_message === 'string' && data.status_message.trim()
        ? data.status_message.trim()
        : null;
    const now = new Date().toISOString();
    const updated = await this.prismaSystem.tb_application.update({
      where: typeof data.doc_version === 'number' ? { id, doc_version: data.doc_version } : { id },
      data: {
        status: data.status,
        is_active: isActiveFor(data.status),
        status_message: message,
        status_until: until,
        status_changed_at: now,
        status_changed_by_id: user_id,
        updated_at: now,
        updated_by_id: user_id,
      },
      select: { id: true, doc_version: true },
    });
    return Result.ok({ id: updated.id, doc_version: updated.doc_version });
  }

  /**
   * Replaces an application's bypass-user list with the given set
   * แทนที่รายชื่อผู้ใช้ที่ได้รับยกเว้นของแอปด้วยชุดที่ส่งมาทั้งชุด
   * @param id - Application UUID / UUID ของแอป
   * @param data - { user_ids: string[] } — the full desired set / ชุดที่ต้องการทั้งหมด
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns The id and the stored user ids / id และ user id ที่บันทึกแล้ว
   */
  @TryCatch
  async setBypassUsers(
    id: string,
    data: any,
    user_id: string,
    version: string,
  ): Promise<Result<{ id: string; user_ids: string[] }>> {
    this.logger.debug({ function: 'setBypassUsers', id, data, user_id, version }, ApplicationService.name);
    const app = await this.prismaSystem.tb_application.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!app) {
      return Result.errorFromCatalog(ERROR_CATALOG.APPLICATION_NOT_FOUND);
    }
    if (!Array.isArray(data?.user_ids)) {
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: 'user_ids must be an array',
      });
    }
    const desired = Array.from(
      new Set(data.user_ids.filter((v: unknown): v is string => typeof v === 'string' && v !== '')),
    );
    const found = await this.prismaSystem.tb_user.findMany({
      where: { id: { in: desired }, deleted_at: null },
      select: { id: true },
    });
    if (found.length !== desired.length) {
      const known = new Set(found.map((u) => u.id));
      return Result.errorFromCatalog(ERROR_CATALOG.COMMON_VALIDATION_FAILED, {
        errors: `unknown user_ids: ${desired.filter((u) => !known.has(u)).join(', ')}`,
      });
    }
    await this.prismaSystem.$transaction(async (tx) => {
      await tx.tb_application_bypass_user.deleteMany({
        where: { application_id: id, user_id: { notIn: desired } },
      });
      if (desired.length > 0) {
        await tx.tb_application_bypass_user.createMany({
          data: desired.map((uid) => ({ application_id: id, user_id: uid, created_by_id: user_id })),
          skipDuplicates: true,
        });
      }
    });
    return Result.ok({ id, user_ids: desired });
  }

  /**
   * Snapshot of every non-deleted application with status and bypass ids for the gateway (V2).
   * The V1 allowlistSnapshot stays unchanged so an old gateway never sees disabled apps.
   * snapshot ของทุกแอปที่ยังไม่ถูกลบพร้อมสถานะและ bypass id สำหรับเกตเวย์ (V2)
   * V1 ยังคงเดิมเพื่อไม่ให้เกตเวย์รุ่นเก่าเห็นแอปที่ disabled แล้วปล่อยผ่าน
   * @returns Result with AllowlistSnapshotV2Item[] / ผลลัพธ์พร้อมอาร์เรย์ของรายการ V2
   */
  @TryCatch
  async allowlistSnapshotV2(): Promise<Result<unknown>> {
    this.logger.debug({ function: 'allowlistSnapshotV2' }, ApplicationService.name);
    const apps = await this.prismaSystem.tb_application.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        allow_all: true,
        device: true,
        status: true,
        status_message: true,
        status_until: true,
        tb_application_api: { where: { deleted_at: null }, select: { api_name: true } },
        tb_application_bypass_user: {
          where: { tb_user: { deleted_at: null } },
          select: { user_id: true },
        },
      },
    });
    const data = apps.map((app) => ({
      id: app.id,
      allow_all: app.allow_all ?? false,
      device: app.device ?? 'web',
      apis: app.tb_application_api.map((row) => row.api_name),
      status: isApplicationStatus(app.status) ? app.status : 'running',
      status_message: app.status_message,
      status_until: app.status_until ? app.status_until.toISOString() : null,
      bypass_user_ids: app.tb_application_bypass_user.map((row) => row.user_id),
    }));
    return Result.ok(data);
  }
```

Do **not** touch `allowlistSnapshot()` (lines 414-434).

- [ ] **Step 2: Controller handlers with temporary literals** (the contract entries do not exist yet) — append after `allowlistSnapshot` in `application.controller.ts`:

```ts
  /**
   * Changes an application's service status
   * เปลี่ยนสถานะการให้บริการของแอปพลิเคชัน
   * @param payload - { id, data, user_id, version } / ข้อมูลไมโครเซอร์วิส
   * @returns Microservice response with id and doc_version / การตอบสนองพร้อม id และ doc_version
   */
  @MessagePattern({ cmd: 'applications.update-status', service: 'micro-cluster' })
  async updateStatus(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.applicationService.updateStatus(payload.id, payload.data, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Replaces an application's bypass-user list
   * แทนที่รายชื่อผู้ใช้ที่ได้รับยกเว้นของแอปพลิเคชัน
   * @param payload - { id, data: { user_ids }, user_id, version } / ข้อมูลไมโครเซอร์วิส
   * @returns Microservice response with id and user_ids / การตอบสนองพร้อม id และ user_ids
   */
  @MessagePattern({ cmd: 'applications.set-bypass-users', service: 'micro-cluster' })
  async setBypassUsers(@Payload() payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const auditContext = this.createAuditContext(payload);
    const result = await runWithAuditContext(auditContext, () =>
      this.applicationService.setBypassUsers(payload.id, payload.data, payload.user_id, payload.version),
    );
    return this.handleResult(result, HttpStatus.OK);
  }

  /**
   * Returns the V2 allowlist snapshot (all non-deleted apps with status and bypass ids)
   * ส่งคืน snapshot V2 (ทุกแอปที่ยังไม่ถูกลบพร้อมสถานะและ bypass id)
   * @param _payload - Unused / ไม่ได้ใช้งาน
   * @returns Microservice response with the V2 snapshot / การตอบสนองพร้อม snapshot V2
   */
  @MessagePattern({ cmd: 'applications.allowlist-snapshot-v2', service: 'micro-cluster' })
  async allowlistSnapshotV2(@Payload() _payload: MicroservicePayload): Promise<MicroserviceResponse> {
    const result = await this.applicationService.allowlistSnapshotV2();
    return this.handleResult(result, HttpStatus.OK);
  }
```

- [ ] **Step 3: Generate the contract, then swap literals for references**

```bash
bun run gen:rpc-contract
grep -n "updateStatus\|setBypassUsers\|allowlistSnapshotV2" packages/rpc-contract/src/contracts/applications.ts
```

Expected: three new entries (likely `.restTodo()`). Then replace the three literals with `Applications.updateStatus.pattern`, `Applications.setBypassUsers.pattern`, `Applications.allowlistSnapshotV2.pattern`, and build the package so the gateway sees it:

```bash
cd packages/rpc-contract && bun run build:package && cd -
bun run audit:message-pattern-literal && bun run audit:rest-contract
```

- [ ] **Step 4: Activity registry** — in `platform-activity-registry.ts` after line 75:

```ts
  [
    'applications.update-status',
    { action: 'update', entityName: 'tb_application', idSource: EDITED_ID },
  ],
  [
    'applications.set-bypass-users',
    { action: 'update', entityName: 'tb_application', idSource: EDITED_ID },
  ],
```

- [ ] **Step 5: Type-check, lint, existing specs**

```bash
cd apps/micro-cluster && bun run check-types
bunx eslint src/cluster/application/*.ts src/common/activity/platform-activity-registry.ts
bunx jest src/cluster/application src/common/activity --runInBand --forceExit
```

Expected: PASS (if a registry spec enumerates every cmd, add the two cmds to its expected list — fixture only).

- [ ] **Step 6: Commit**

```bash
git add apps/micro-cluster packages/rpc-contract/src/contracts/applications.ts
git commit -m "feat(micro-cluster): application updateStatus, setBypassUsers, allowlistSnapshotV2"
```

---

### Task 5: Gateway allowlist store (V2) and refresher with V1 fallback

**Files:**
- Modify: `apps/backend-gateway/src/common/guard/app-allowlist.store.ts` (whole file)
- Modify: `apps/backend-gateway/src/common/guard/app-allowlist.refresher.ts:67-90` (`refresh`)

**Interfaces:**
- Consumes: `Applications.allowlistSnapshotV2`, `Applications.allowlistSnapshot` (Task 4).
- Produces (used by Tasks 6 and 8):

```ts
export type AppStatus = 'running' | 'maintenance' | 'read_only' | 'disabled';
export interface AppState {
  allow_all: boolean;
  apis: Set<string>;
  device: string;
  status: AppStatus;
  status_message: string | null;
  status_until: string | null;
  bypass: Set<string>;
}
appAllowlistStore.replaceV2(items: AppAllowlistSnapshotV2Item[]): void
appAllowlistStore.replace(items: AppAllowlistSnapshotItem[]): void // V1 → status 'running', empty bypass
appAllowlistStore.getAppState(appId: string): AppState | undefined // undefined when not loaded or unknown
appAllowlistStore.isAllowed(appId, apiName): boolean              // unchanged semantics
appAllowlistStore.isBypassUser(appId, userId: string | undefined): boolean
appAllowlistStore.getDevice(appId): string | undefined             // unchanged
```

- [ ] **Step 1: Rewrite the store**

```ts
/**
 * One application entry in the V1 allowlist snapshot (active apps only)
 * รายการแอปหนึ่งรายการใน snapshot V1 (เฉพาะแอปที่ active)
 */
export interface AppAllowlistSnapshotItem {
  id: string;
  allow_all: boolean;
  apis: string[];
  device: string;
}

export type AppStatus = 'running' | 'maintenance' | 'read_only' | 'disabled';

/**
 * One application entry in the V2 snapshot (every non-deleted app, with status and bypass ids)
 * รายการแอปหนึ่งรายการใน snapshot V2 (ทุกแอปที่ยังไม่ถูกลบ พร้อมสถานะและ bypass id)
 */
export interface AppAllowlistSnapshotV2Item extends AppAllowlistSnapshotItem {
  status: AppStatus;
  status_message: string | null;
  status_until: string | null;
  bypass_user_ids: string[];
}

/**
 * In-memory state of one application as seen by AppIdGuard
 * สถานะในหน่วยความจำของแอปหนึ่งตัวตามที่ AppIdGuard เห็น
 */
export interface AppState {
  allow_all: boolean;
  apis: Set<string>;
  device: string;
  status: AppStatus;
  status_message: string | null;
  status_until: string | null;
  bypass: Set<string>;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(['running', 'maintenance', 'read_only', 'disabled']);

/**
 * Holds the in-memory x-app-id allowlist snapshot consumed synchronously by AppIdGuard on every request
 * เก็บ snapshot รายการที่อนุญาต x-app-id ในหน่วยความจำ ใช้โดย AppIdGuard แบบ synchronous ในทุกคำขอ
 */
class AppAllowlistStore {
  private snapshot: Map<string, AppState> = new Map();
  private loaded = false;

  /**
   * Replaces the snapshot from a V1 payload — every app is treated as running with no bypass users
   * แทนที่ snapshot จาก payload V1 — ทุกแอปถือว่า running และไม่มีผู้ใช้ยกเว้น
   * @param items - V1 items (active apps only) / รายการ V1 (เฉพาะแอปที่ active)
   * @returns Nothing / ไม่มีค่าส่งกลับ
   */
  replace(items: AppAllowlistSnapshotItem[]): void {
    this.replaceV2(
      items.map((item) => ({
        ...item,
        status: 'running' as const,
        status_message: null,
        status_until: null,
        bypass_user_ids: [],
      })),
    );
  }

  /**
   * Replaces the snapshot from a V2 payload; an unknown status string is treated as running
   * แทนที่ snapshot จาก payload V2; สถานะที่ไม่รู้จักถือว่า running
   * @param items - V2 items / รายการ V2
   * @returns Nothing / ไม่มีค่าส่งกลับ
   */
  replaceV2(items: AppAllowlistSnapshotV2Item[]): void {
    const next = new Map<string, AppState>();
    for (const item of items) {
      next.set(item.id, {
        allow_all: item.allow_all,
        apis: new Set(item.apis),
        device: item.device ?? 'web',
        status: KNOWN_STATUSES.has(item.status) ? item.status : 'running',
        status_message: item.status_message ?? null,
        status_until: item.status_until ?? null,
        bypass: new Set(item.bypass_user_ids ?? []),
      });
    }
    this.snapshot = next;
    this.loaded = true;
  }

  /**
   * Reports whether at least one snapshot has been loaded (false means fail-closed)
   * รายงานว่ามีการโหลด snapshot อย่างน้อยหนึ่งครั้งแล้วหรือไม่ (false หมายถึง fail-closed)
   * @returns True once a snapshot has been loaded / True เมื่อโหลด snapshot แล้ว
   */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Returns the state of an application, or undefined when not loaded or unknown
   * คืนสถานะของแอป หรือ undefined เมื่อยังไม่โหลดหรือไม่รู้จักแอปนี้
   * @param appId - The x-app-id header value / ค่า header x-app-id
   * @returns The app state or undefined / สถานะแอปหรือ undefined
   */
  getAppState(appId: string): AppState | undefined {
    if (!this.loaded) return undefined;
    return this.snapshot.get(appId);
  }

  /**
   * Checks whether an application id is allowed to call the given api_name (status is not considered)
   * ตรวจสอบว่า application id เรียก api_name ที่ระบุได้หรือไม่ (ไม่พิจารณาสถานะ)
   * @param appId - The x-app-id header value / ค่า header x-app-id
   * @param apiName - The guarded API name / ชื่อ API ที่ถูกป้องกัน
   * @returns True if loaded, the app exists, and it has wildcard or explicit access / True ถ้าโหลดแล้ว แอปมีอยู่ และมีสิทธิ์
   */
  isAllowed(appId: string, apiName: string): boolean {
    const entry = this.getAppState(appId);
    if (!entry) return false;
    if (entry.allow_all) return true;
    return entry.apis.has(apiName);
  }

  /**
   * Checks whether a user is on the application's bypass list
   * ตรวจว่าผู้ใช้อยู่ในรายชื่อยกเว้นของแอปหรือไม่
   * @param appId - The x-app-id header value / ค่า header x-app-id
   * @param userId - Authenticated user id, if any / user id ที่ยืนยันตัวตนแล้ว ถ้ามี
   * @returns True only for a known app and a listed user / true เฉพาะแอปที่รู้จักและผู้ใช้ที่อยู่ในรายชื่อ
   */
  isBypassUser(appId: string, userId: string | undefined): boolean {
    if (!userId) return false;
    return this.getAppState(appId)?.bypass.has(userId) ?? false;
  }

  /**
   * Returns the device configured for an application id, or undefined if unknown
   * คืนค่า device ที่กำหนดให้กับ application id หรือ undefined หากไม่พบ
   * @param appId - The x-app-id header value / ค่า header x-app-id
   * @returns The device string or undefined / สตริง device หรือ undefined
   */
  getDevice(appId: string): string | undefined {
    return this.snapshot.get(appId)?.device;
  }
}

/**
 * Process-wide singleton store instance shared by AppIdGuard (read) and AppAllowlistRefresher (write)
 * อินสแตนซ์ store แบบ singleton ระดับโปรเซส ใช้ร่วมกันโดย AppIdGuard (อ่าน) และ AppAllowlistRefresher (เขียน)
 */
export const appAllowlistStore = new AppAllowlistStore();
```

- [ ] **Step 2: Refresher** — add a field `private v2Seen = false;` and replace `refresh()` (lines 67-90) with:

```ts
  /**
   * Loads the V2 snapshot; until V2 has answered once in this process, falls back to V1 so a
   * gateway deployed ahead of micro-cluster still boots open (every app running). After V2 has
   * answered once, a failure keeps the stale V2 snapshot — falling back then would silently
   * re-open apps that are in maintenance.
   * โหลด snapshot V2; ก่อน V2 เคยตอบสำเร็จในโปรเซสนี้ ให้ถอยไปใช้ V1 เพื่อให้เกตเวย์ที่ขึ้นก่อน
   * micro-cluster ยังบูตได้ (ทุกแอป running) หลัง V2 เคยตอบแล้ว ถ้าล้มให้คง snapshot V2 เดิม —
   * ถอยไป V1 ตอนนั้นจะเปิดแอปที่ปิดปรับปรุงอยู่ให้ใช้ได้แบบเงียบ ๆ
   * @returns True if a snapshot was stored / True ถ้าบันทึก snapshot ได้
   */
  private async refresh(): Promise<boolean> {
    try {
      const res = (await this.rpc.send(Applications.allowlistSnapshotV2, {})) as MicroserviceResponse;
      if (res.response.status === 200) {
        appAllowlistStore.replaceV2((res.data ?? []) as AppAllowlistSnapshotV2Item[]);
        this.v2Seen = true;
        return true;
      }
      this.logger.error({ status: res.response.status }, 'Allowlist snapshot V2 returned non-200');
    } catch (error) {
      this.logger.error({ error }, 'Allowlist snapshot V2 failed');
    }
    if (this.v2Seen) {
      this.logger.error({}, 'Keeping stale V2 allowlist snapshot');
      return false;
    }
    try {
      const res = (await this.rpc.send(Applications.allowlistSnapshot, {})) as MicroserviceResponse;
      if (res.response.status !== 200) {
        this.logger.error(
          { status: res.response.status },
          'Allowlist snapshot V1 fallback returned non-200; keeping stale snapshot',
        );
        return false;
      }
      appAllowlistStore.replace((res.data ?? []) as AppAllowlistSnapshotItem[]);
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Allowlist snapshot V1 fallback failed; keeping stale snapshot');
      return false;
    }
  }
```

Update the import: `import { appAllowlistStore, AppAllowlistSnapshotItem, AppAllowlistSnapshotV2Item } from './app-allowlist.store';`

- [ ] **Step 3: Type-check, lint, existing specs**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/common/guard/app-allowlist.store.ts src/common/guard/app-allowlist.refresher.ts
bunx jest src/common/guard src/common/helpers/mobile- --runInBand --forceExit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-gateway/src/common/guard/app-allowlist.store.ts apps/backend-gateway/src/common/guard/app-allowlist.refresher.ts
git commit -m "feat(gateway): allowlist store carries app status and bypass ids; V2 snapshot with V1 fallback"
```

---

### Task 6: `AppIdGuard` status gate

**Files:**
- Modify: `apps/backend-gateway/src/common/guard/app-id.guard.ts:39-102`
- Modify (mock only): `apps/backend-gateway/src/common/guard/app-id.guard.spec.ts:9-14`

**Interfaces:**
- Consumes: `appAllowlistStore.getAppState`, `isAllowed`, `isBypassUser` (Task 5).
- Produces: `new AppIdGuard(apiName: string = '', options: { statusProbe?: boolean } = {})`. Throws:
  - 401 `UnauthorizedException` (unchanged message) — unknown app / api not allowed
  - `HttpException({ code: 'APP_DISABLED', error: <message> }, 403)`
  - `HttpException({ code: 'APP_MAINTENANCE' | 'APP_READ_ONLY', error: <message>, until?: <iso> }, 503)` + `Retry-After` header when `until` is in the future

**Wire shape this produces** (through `ExceptionFilter`, which pulls `code` into `error.code`, the thrown `error` string into `error.message`, and leaves every other key at the top level):

```json
{
  "success": false,
  "status": 503,
  "message": "ระบบปิดปรับปรุงชั่วคราว",
  "timestamp": "…",
  "path": "/api/…",
  "error": { "code": "APP_MAINTENANCE", "id": 8080002, "message": "<status_message or default English>" },
  "until": "2026-10-09T07:00:00.000Z"
}
```

Note `until` is **top-level**, not inside `error` — the filter does not put extra keys there. The top-level `message` is the catalog text localized by `Accept-Language`.

- [ ] **Step 1: Rewrite `AppIdGuard`** (keep the two helper functions and the 400 branches as they are):

```ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { BackendLogger } from '../helpers/backend.logger';
import { appAllowlistStore, AppState } from './app-allowlist.store';

const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

const DEFAULT_STATUS_MESSAGE: Record<'maintenance' | 'read_only' | 'disabled', string> = {
  maintenance: 'This application is under maintenance',
  read_only: 'This application is read-only right now',
  disabled: 'This application has been disabled',
};

/**
 * Options for AppIdGuard
 * ตัวเลือกของ AppIdGuard
 */
export interface AppIdGuardOptions {
  /**
   * Skip the status gate and the per-api allowlist check — only for GET /api/app-status, which
   * must answer for disabled apps and for apps whose list lacks its api_name
   * ข้ามการตรวจสถานะและการตรวจ api ราย app — ใช้กับ GET /api/app-status เท่านั้น
   */
  statusProbe?: boolean;
}

// … CheckIsNotEmpty and CheckAppIdIsUUID unchanged …

/**
 * Guard that validates x-app-id against the in-memory allowlist and enforces the app's service status
 * การ์ดที่ตรวจ x-app-id กับรายการที่อนุญาตในหน่วยความจำ และบังคับใช้สถานะการให้บริการของแอป
 */
@Injectable()
export class AppIdGuard implements CanActivate {
  private api_name: string;
  private options: AppIdGuardOptions;

  constructor(api_name: string = '', options: AppIdGuardOptions = {}) {
    this.api_name = api_name;
    this.options = options;
  }

  /**
   * Order: 400 header → 401 unknown app → statusProbe pass → 403 disabled → 401 api not allowed →
   * running pass → auth.* pass → bypass user pass → read_only + read method pass → 503
   * ลำดับ: 400 header → 401 ไม่รู้จักแอป → statusProbe ผ่าน → 403 disabled → 401 ไม่มีสิทธิ์ api →
   * running ผ่าน → auth.* ผ่าน → ผู้ใช้ยกเว้นผ่าน → read_only + method อ่านผ่าน → 503
   * @param context - Execution context / บริบทการประมวลผล
   * @returns True when the request may proceed / True เมื่อคำขอไปต่อได้
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const appId = request.headers['x-app-id'];

    const logger = new BackendLogger(AppIdGuard.name);

    // (keep the existing two BadRequestException branches here, unchanged)

    const notAllowed = (): never => {
      logger.error(
        {
          function: 'AppIdGuard',
          appId,
          api_name: this.api_name,
          loaded: appAllowlistStore.isLoaded,
          error: 'This application id (x-app-id) is not found or not allowed to access this api',
        },
        undefined,
        'AppIdGuard',
      );
      throw new UnauthorizedException(
        'This application id (x-app-id) is not found or not allowed to access this api',
      );
    };

    const state = appAllowlistStore.getAppState(appId);
    if (!state) notAllowed();
    if (this.options.statusProbe) return true;

    if (state.status === 'disabled') {
      throw new HttpException(
        { code: 'APP_DISABLED', error: state.status_message || DEFAULT_STATUS_MESSAGE.disabled },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!appAllowlistStore.isAllowed(appId, this.api_name)) notAllowed();

    if (state.status === 'running') return true;
    if (this.api_name.startsWith('auth.')) return true;
    if (appAllowlistStore.isBypassUser(appId, request.user?.user_id)) return true;
    if (state.status === 'read_only' && READ_METHODS.has(String(request.method).toUpperCase())) {
      return true;
    }

    this.setRetryAfter(http.getResponse(), state);
    throw new HttpException(
      {
        code: state.status === 'read_only' ? 'APP_READ_ONLY' : 'APP_MAINTENANCE',
        error: state.status_message || DEFAULT_STATUS_MESSAGE[state.status],
        ...(state.status_until && { until: state.status_until }),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * Sets Retry-After (seconds, minimum 60) only when status_until is in the future
   * ตั้ง Retry-After (วินาที อย่างน้อย 60) เฉพาะเมื่อ status_until ยังไม่ถึง
   * @param response - Express response, absent in narrow unit tests / response ของ express
   * @param state - App state / สถานะแอป
   * @returns Nothing / ไม่มีค่าส่งกลับ
   */
  private setRetryAfter(
    response: { setHeader?: (name: string, value: string) => void } | undefined,
    state: AppState,
  ): void {
    if (!state.status_until || typeof response?.setHeader !== 'function') return;
    const ms = new Date(state.status_until).getTime() - Date.now();
    if (!(ms > 0)) return;
    response.setHeader('Retry-After', String(Math.max(60, Math.ceil(ms / 1000))));
  }
}
```

Note: `notAllowed()` returns `never`, so TypeScript narrows `state` to `AppState` after `if (!state) notAllowed();`. If the narrowing does not happen in this TS config, write `if (!state) return notAllowed();`.

- [ ] **Step 2: Update the existing spec's mock only** (`app-id.guard.spec.ts:9-14`):

```ts
jest.mock('./app-allowlist.store', () => ({
  appAllowlistStore: {
    isAllowed: (...args: unknown[]) => isAllowedMock(...args),
    getAppState: () => ({ status: 'running', status_message: null, status_until: null }),
    isBypassUser: () => false,
    isLoaded: true,
  },
}));
```

- [ ] **Step 3: Type-check, lint, existing specs**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/common/guard/app-id.guard.ts src/common/guard/app-id.guard.spec.ts
bunx jest src/common/guard --runInBand --forceExit
```

Expected: PASS (all existing cases unchanged in outcome).

- [ ] **Step 4: Commit**

```bash
git add apps/backend-gateway/src/common/guard/app-id.guard.ts apps/backend-gateway/src/common/guard/app-id.guard.spec.ts
git commit -m "feat(gateway): AppIdGuard enforces application status (maintenance/read_only/disabled)"
```

---

### Task 7: Admin endpoints — `PATCH :id/status`, `PUT :id/bypass-users`, self-lock

**Files:**
- Modify: `apps/backend-gateway/src/platform/applications/swagger/request.ts` (append)
- Modify: `apps/backend-gateway/src/platform/applications/applications.service.ts` (2 methods)
- Modify: `apps/backend-gateway/src/platform/applications/applications.controller.ts` (2 routes, after `updateApplication`, before `deleteApplication`; add `Patch`, `HttpException` imports)

**Interfaces:**
- Consumes: `Applications.updateStatus`, `Applications.setBypassUsers` (Task 4), `APP_SELF_LOCK` catalog entry (Task 2).
- Produces HTTP:
  - `PATCH /api-system/applications/:application_id/status` body `{ status, status_message?: string | null, status_until?: string | null, doc_version? }` — `null` (or omitting the key) clears the field; both are always cleared when `status` is `running` (zod `.nullish()` here; `updateStatus` in Task 4 stores `null` for null/empty/omitted) → 200 `{ data: { id, doc_version } }`; 409 `error.code = 'APP_SELF_LOCK'` when `:application_id` equals the request's own `x-app-id` and `status !== 'running'`; 409 (`ALREADY_EXISTS`) on stale `doc_version`.
  - `PUT /api-system/applications/:application_id/bypass-users` body `{ user_ids: string[] }` → 200 `{ data: { id, user_ids } }`.
  - Both: `AppIdGuard('application.update')`, `PlatformPermissionGuard`, `@RequirePlatformPermission('application.update')`.

- [ ] **Step 1: Request DTOs** — append to `swagger/request.ts`:

```ts
export const APPLICATION_STATUS_VALUES = ['running', 'maintenance', 'read_only', 'disabled'] as const;

export const ApplicationStatusUpdateRequestSchema = z.object({
  status: z.enum(APPLICATION_STATUS_VALUES),
  status_message: z.string().max(1000).nullish(),
  status_until: z.iso.datetime({ offset: true }).nullish(),
  doc_version: z.number().int().nonnegative().optional(),
});

/**
 * Body of PATCH /api-system/applications/:id/status
 * body ของ PATCH /api-system/applications/:id/status
 */
export class ApplicationStatusUpdateRequestDto extends createZodDto(ApplicationStatusUpdateRequestSchema) {
  @ApiProperty({ description: 'New service status', enum: APPLICATION_STATUS_VALUES, example: 'maintenance' })
  status: (typeof APPLICATION_STATUS_VALUES)[number];

  @ApiPropertyOptional({ description: 'Note shown to callers; ignored when status is running', example: 'Upgrading the database' })
  status_message?: string | null;

  @ApiPropertyOptional({ description: 'Expected return time (ISO 8601) — display only', example: '2026-10-09T14:00:00+07:00' })
  status_until?: string | null;

  @ApiPropertyOptional({ description: 'Optimistic-lock token from the last GET', example: 3 })
  doc_version?: number;
}

export const ApplicationBypassUsersRequestSchema = z.object({
  user_ids: z.array(z.uuid()).max(500),
});

/**
 * Body of PUT /api-system/applications/:id/bypass-users (replace semantics)
 * body ของ PUT /api-system/applications/:id/bypass-users (แทนที่ทั้งชุด)
 */
export class ApplicationBypassUsersRequestDto extends createZodDto(ApplicationBypassUsersRequestSchema) {
  @ApiProperty({
    description: 'Full desired set of user ids that keep access during maintenance and read_only',
    type: [String],
    example: ['019638a6-2a00-7c4f-8e46-9b7a52c80c4d'],
  })
  user_ids: string[];
}
```

- [ ] **Step 2: Service wrappers** — add to `ApplicationsService`:

```ts
  /**
   * Change an application's service status
   * เปลี่ยนสถานะการให้บริการของแอปพลิเคชัน
   * @param id - Application id / รหัสแอป
   * @param data - Status payload / ข้อมูลสถานะ
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns Result with { id, doc_version } / ผลลัพธ์พร้อม { id, doc_version }
   */
  async updateStatus(id: string, data: unknown, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'updateStatus', id, data, user_id, version }, ApplicationsService.name);
    return this.toResult(
      await this.rpc.send(Applications.updateStatus, { id, data, user_id, version }),
      HttpStatus.OK,
    );
  }

  /**
   * Replace an application's bypass-user list
   * แทนที่รายชื่อผู้ใช้ที่ได้รับยกเว้นของแอปพลิเคชัน
   * @param id - Application id / รหัสแอป
   * @param data - { user_ids } / รายชื่อ user id
   * @param user_id - Acting user / ผู้ดำเนินการ
   * @param version - API version / เวอร์ชัน API
   * @returns Result with { id, user_ids } / ผลลัพธ์พร้อม { id, user_ids }
   */
  async setBypassUsers(id: string, data: unknown, user_id: string, version: string): Promise<Result<unknown>> {
    this.logger.debug({ function: 'setBypassUsers', id, data, user_id, version }, ApplicationsService.name);
    return this.toResult(
      await this.rpc.send(Applications.setBypassUsers, { id, data, user_id, version }),
      HttpStatus.OK,
    );
  }
```

- [ ] **Step 3: Controller routes** — add `Patch` and `HttpException` to the `@nestjs/common` import and the two DTOs to the `./swagger/request` import, then insert before the `deleteApplication` JSDoc:

```ts
  /**
   * Change an application's service status. Refuses to take the caller's own app offline.
   * เปลี่ยนสถานะการให้บริการของแอป และไม่ยอมให้ปิดแอปที่ผู้เรียกใช้อยู่เอง
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param id - Application ID / รหัสแอปพลิเคชัน
   * @param body - Status payload / ข้อมูลสถานะ
   * @param version - API version / เวอร์ชัน API
   * @returns { id, doc_version } / id และ doc_version ใหม่
   */
  @Patch(':application_id/status')
  @UseGuards(new AppIdGuard('application.update'), PlatformPermissionGuard)
  @RequirePlatformPermission('application.update')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiParam({ name: 'application_id', description: 'Unique identifier (UUID v4)', example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d' })
  @ApiBody({ type: ApplicationStatusUpdateRequestDto })
  @ApiOperation({
    summary: 'Change an application service status',
    description:
      'Sets running / maintenance / read_only / disabled. Takes effect at each gateway within one allowlist refresh (APP_ALLOWLIST_TTL_MS, default 60 s). Returns 409 APP_SELF_LOCK when the target is the calling app and the status is not running.\n\nเปลี่ยนสถานะการให้บริการของแอป มีผลภายในหนึ่งรอบรีเฟรช (ค่าเริ่มต้น 60 วินาที)',
    operationId: 'application_updateStatus',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiResponse({ status: 200, description: 'Status changed' })
  @ApiResponse({ status: 400, description: 'Invalid status or status_until' })
  @ApiResponse({ status: 403, description: 'Missing application.update permission' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  @ApiResponse({ status: 409, description: 'APP_SELF_LOCK, or stale doc_version' })
  async updateApplicationStatus(
    @Req() req: Request,
    @Res() res: Response,
    @Param('application_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ApplicationStatusUpdateRequestDto,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug({ function: 'updateApplicationStatus', id, body, version }, ApplicationsController.name);
    const callerAppId = String((req.headers as unknown as Record<string, unknown>)['x-app-id'] ?? '').toLowerCase();
    if (callerAppId === id.toLowerCase() && body.status !== 'running') {
      throw new HttpException({ code: 'APP_SELF_LOCK' }, HttpStatus.CONFLICT);
    }
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.applicationsService.updateStatus(id, body, user_id, version);
    this.respond(res, result);
  }

  /**
   * Replace the list of users who keep access during maintenance and read_only
   * แทนที่รายชื่อผู้ใช้ที่ยังใช้งานได้ระหว่าง maintenance และ read_only
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @param id - Application ID / รหัสแอปพลิเคชัน
   * @param body - { user_ids } / รายชื่อ user id
   * @param version - API version / เวอร์ชัน API
   * @returns { id, user_ids } / id และรายชื่อที่บันทึก
   */
  @Put(':application_id/bypass-users')
  @UseGuards(new AppIdGuard('application.update'), PlatformPermissionGuard)
  @RequirePlatformPermission('application.update')
  @HttpCode(HttpStatus.OK)
  @ApiVersionMinRequest()
  @ApiParam({ name: 'application_id', description: 'Unique identifier (UUID v4)', example: '019638a6-2a00-7c4f-8e46-9b7a52c80c4d' })
  @ApiBody({ type: ApplicationBypassUsersRequestDto })
  @ApiOperation({
    summary: 'Replace an application bypass-user list',
    description:
      'Replace semantics — send the full desired set. Bypass users keep full access while the app is in maintenance or read_only; they are blocked like everyone else when it is disabled.\n\nแทนที่ทั้งชุด ผู้ใช้ในรายชื่อใช้งานได้เต็มที่ระหว่าง maintenance/read_only แต่ถูกบล็อกเมื่อ disabled',
    operationId: 'application_setBypassUsers',
  })
  @ApiQuery({ name: 'version', description: 'API contract version', required: false, example: 'latest' })
  @ApiResponse({ status: 200, description: 'List replaced' })
  @ApiResponse({ status: 400, description: 'Invalid or unknown user_ids' })
  @ApiResponse({ status: 403, description: 'Missing application.update permission' })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  async setApplicationBypassUsers(
    @Req() req: Request,
    @Res() res: Response,
    @Param('application_id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ApplicationBypassUsersRequestDto,
    @Query('version') version: string = 'latest',
  ): Promise<void> {
    this.logger.debug({ function: 'setApplicationBypassUsers', id, body, version }, ApplicationsController.name);
    const { user_id } = ExtractRequestHeader(req);
    const result = await this.applicationsService.setBypassUsers(id, body, user_id, version);
    this.respond(res, result);
  }
```

- [ ] **Step 4: Type-check, lint, existing specs, permission audit**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/platform/applications/applications.controller.ts src/platform/applications/applications.service.ts src/platform/applications/swagger/request.ts
bunx jest src/platform/applications --runInBand --forceExit
cd ../.. && bun run audit:api-system-permission && bun run audit:guard-providers
```

Expected: PASS. `audit:api-system-permission` must list the two new routes as covered by `application.update`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-gateway/src/platform/applications
git commit -m "feat(gateway): PATCH application status and PUT bypass-users with self-lock guard"
```

---

### Task 8: `GET /api/app-status` + optional bearer guard + catalog regeneration

**Files:**
- Create: `apps/backend-gateway/src/auth/guards/optional-keycloak.guard.ts`
- Create: `apps/backend-gateway/src/application/app-status/app-status.controller.ts`
- Create: `apps/backend-gateway/src/application/app-status/app-status.module.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (import + add to `imports` next to `ApplicationsModule`, line 179)
- Regenerate: `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: `AppIdGuard(…, { statusProbe: true })` (Task 6), `appAllowlistStore.getAppState`, `isBypassUser` (Task 5).
- Produces HTTP `GET /api/app-status` (header `x-app-id` required, bearer optional) → 200 standard envelope `{ data: { status, message, until, bypass } }`:
  - `status`: `'running' | 'maintenance' | 'read_only' | 'disabled'`
  - `message`: `string | null` (admin's `status_message`)
  - `until`: ISO `string | null`
  - `bypass`: `boolean` — true only with a valid token whose user is on the list **and** status is `maintenance` / `read_only`
  - Unknown/unloaded app id → 401 (same as every guarded route). Never 401 for a missing or bad token.

- [ ] **Step 1: Optional guard** — `optional-keycloak.guard.ts`:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Runs the same passport `keycloak` strategy as KeycloakGuard but never rejects: a valid bearer
 * token sets request.user, a missing/invalid token (or Keycloak being down) leaves it unset.
 * Deliberately skips KeycloakGuard's BU and license checks — callers only need the user id.
 * ใช้ strategy `keycloak` เดียวกับ KeycloakGuard แต่ไม่ปฏิเสธคำขอ: token ถูกต้อง → ตั้ง request.user
 * ไม่มี/ไม่ถูกต้อง (หรือ Keycloak ล่ม) → ไม่ตั้ง จงใจข้ามการตรวจ BU และ license ของ KeycloakGuard
 */
@Injectable()
export class OptionalKeycloakGuard extends AuthGuard('keycloak') {
  /**
   * Attempt authentication and always allow the request through
   * พยายามยืนยันตัวตนและปล่อยคำขอผ่านเสมอ
   * @param context - Execution context / บริบทการประมวลผล
   * @returns Always true / true เสมอ
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // ไม่มี token / token ใช้ไม่ได้ / Keycloak ล่ม — ปล่อยผ่านแบบไม่ระบุตัวตน
    }
    return true;
  }

  /**
   * Return the user when present instead of throwing on absence
   * คืนผู้ใช้เมื่อมี แทนการโยน error เมื่อไม่มี
   * @param _err - Strategy error / error จาก strategy
   * @param user - Validated user or false / ผู้ใช้ที่ตรวจแล้วหรือ false
   * @returns The user or undefined / ผู้ใช้หรือ undefined
   */
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
```

- [ ] **Step 2: Controller** — `app-status.controller.ts`:

```ts
import { Controller, Get, HttpCode, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppIdGuard } from 'src/common/guard/app-id.guard';
import { appAllowlistStore } from 'src/common/guard/app-allowlist.store';
import { ApiHeaderRequiredXAppId } from 'src/common/decorators/x-app-id.decorator';
import { OptionalKeycloakGuard } from 'src/auth/guards/optional-keycloak.guard';
import { BaseHttpController, Result } from '@/common';

/**
 * Lets a client learn its own application's service status before it hits a 503
 * ให้ client รู้สถานะการให้บริการของแอปตัวเองก่อนจะเจอ 503
 */
@Controller('api')
@ApiTags('Application: Status')
@ApiHeaderRequiredXAppId()
@ApiBearerAuth()
export class AppStatusController extends BaseHttpController {
  /**
   * Current status of the calling app (x-app-id); answers even when the app is disabled
   * สถานะปัจจุบันของแอปที่เรียก (x-app-id) ตอบได้แม้แอปจะ disabled
   * @param req - Request object / ออบเจกต์คำขอ
   * @param res - Response object / ออบเจกต์การตอบกลับ
   * @returns { status, message, until, bypass } / สถานะ ข้อความ เวลา และสิทธิ์ยกเว้น
   */
  @Get('app-status')
  @UseGuards(OptionalKeycloakGuard, new AppIdGuard('app.status', { statusProbe: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the calling application service status',
    description:
      'Returns running / maintenance / read_only / disabled for the x-app-id, the admin note, the expected return time and whether the bearer user is on the bypass list. Never blocked by the status itself; a missing or invalid token gives bypass=false, never 401.\n\nคืนสถานะของแอปตาม x-app-id ไม่ถูกบล็อกด้วยสถานะ และไม่ตอบ 401 เพราะ token',
    operationId: 'app_status',
  })
  @ApiResponse({ status: 200, description: '{ status, message, until, bypass }' })
  @ApiResponse({ status: 401, description: 'Unknown x-app-id' })
  async getAppStatus(@Req() req: Request, @Res() res: Response): Promise<void> {
    const appId = String((req.headers as unknown as Record<string, unknown>)['x-app-id']);
    const state = appAllowlistStore.getAppState(appId);
    const userId = (req as unknown as { user?: { user_id?: string } }).user?.user_id;
    const status = state?.status ?? 'running';
    const bypass =
      (status === 'maintenance' || status === 'read_only') &&
      appAllowlistStore.isBypassUser(appId, userId);
    this.respond(
      res,
      Result.ok({
        status,
        message: state?.status_message ?? null,
        until: state?.status_until ?? null,
        bypass,
      }),
    );
  }
}
```

(`Result` must come from the same `@/common` barrel the other controllers use; if `Result` is not re-exported there, import it from where `applications.service.ts` imports it.)

- [ ] **Step 3: Module** — `app-status.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppStatusController } from './app-status.controller';
import { OptionalKeycloakGuard } from 'src/auth/guards/optional-keycloak.guard';

/**
 * Registers GET /api/app-status
 * ลงทะเบียน GET /api/app-status
 */
@Module({
  controllers: [AppStatusController],
  providers: [OptionalKeycloakGuard],
})
export class AppStatusModule {}
```

and in `app.module.ts`: `import { AppStatusModule } from './application/app-status/app-status.module';` plus `AppStatusModule,` in `imports` right after `ApplicationsModule,` (line 179).

- [ ] **Step 4: Regenerate the app-api catalog** (`app.status` is a new `AppIdGuard` name)

```bash
bun run scripts/generate-app-api-catalog/run.ts
grep -n "'app.status'" apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
bun run audit:app-api-catalog-drift
```

Expected: `app.status` present; audit passes. (Because of `statusProbe`, apps do **not** need `app.status` in their allowlist to call it.)

- [ ] **Step 5: Type-check, lint, boot check**

```bash
cd apps/backend-gateway && bun run check-types
bunx eslint src/auth/guards/optional-keycloak.guard.ts src/application/app-status/*.ts src/app.module.ts
cd ../.. && bun run audit:guard-providers
```

Then start the gateway locally against a local micro-cluster and confirm it boots (a missing provider crashes boot):

```bash
cd apps/backend-gateway && bun run start:dev   # expect "Nest application successfully started"; Ctrl-C after
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend-gateway/src/auth/guards/optional-keycloak.guard.ts apps/backend-gateway/src/application/app-status \
        apps/backend-gateway/src/app.module.ts apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
git commit -m "feat(gateway): GET /api/app-status for clients to read their app status"
```

---

### Task 9: Gates, push, DEV verification matrix

**Files:** none (verification only)

- [ ] **Step 1: Local gates**

```bash
SKIP_TESTS=1 bun run gates
```

Expected: `✓ ผ่านครบ`. Then run only the suites this branch touched (full test gate is slow):

```bash
(cd apps/micro-cluster && bunx jest src/cluster/application src/common --runInBand --forceExit)
(cd apps/backend-gateway && bunx jest src/common/guard src/platform/applications --runInBand --forceExit)
(cd packages/error-catalog && bunx jest --runInBand --forceExit)
```

If `audit:fe-license-fixture` or `audit:env-drift` is red, check whether it is also red on `origin/main` before blaming this branch (both have been red on `main` before).

- [ ] **Step 2: Push and open the PR** — the push applies the expand migration to DEV within ~2 minutes; that is safe because it only adds columns/table and backfills `disabled` from `is_active=false`.

```bash
git push -u origin feature/application-status-modes
gh pr create --base main --title "feat: application status modes (running/maintenance/read_only/disabled)" \
  --body "Implements Part 1 of carmen-platform docs/superpowers/specs/2026-10-09-application-status-modes-design.md"
```

- [ ] **Step 3: DEV verification (manual, after merge + DEV deploy)** — **use only a dedicated test application.** DEV serves carmen-platform production; never change the status of the platform's or inventory's app id.

Setup (with a platform-admin token `$ADMIN` and the platform app id `$PLATFORM_APP` as `x-app-id`):

```bash
BASE=https://dev.blueledgers.com:4001
# 1. create the test app (allow_all so api lists do not interfere)
curl -sk -X POST "$BASE/api-system/applications" -H "Authorization: Bearer $ADMIN" -H "x-app-id: $PLATFORM_APP" \
  -H 'content-type: application/json' -d '{"name":"zz-status-mode-test","allow_all":true}'
# → note data.id as $TEST_APP; GET it to read doc_version as $V
# 2. put user B on the bypass list
curl -sk -X PUT "$BASE/api-system/applications/$TEST_APP/bypass-users" -H "Authorization: Bearer $ADMIN" \
  -H "x-app-id: $PLATFORM_APP" -H 'content-type: application/json' -d "{\"user_ids\":[\"$USER_B_ID\"]}"
# 3. set a status (repeat per row below), then wait 65 s for every gateway to refresh
curl -sk -X PATCH "$BASE/api-system/applications/$TEST_APP/status" -H "Authorization: Bearer $ADMIN" \
  -H "x-app-id: $PLATFORM_APP" -H 'content-type: application/json' \
  -d "{\"status\":\"maintenance\",\"status_message\":\"test\",\"status_until\":\"2099-01-01T00:00:00Z\",\"doc_version\":$V}"
```

Probe requests with `-H "x-app-id: $TEST_APP"` — a read: `GET /api/news` (or any `GET` your users can call); a write: any `POST` they can call; login: `POST /api/auth/login`; status: `GET /api/app-status`. Record HTTP code, `error.code`, top-level `until`, and the `Retry-After` header (`curl -sk -D -`).

| Status | User A GET | User A POST | User B (bypass) POST | login | `/api/app-status` (A / B) |
|---|---|---|---|---|---|
| running | 200 | 2xx | 2xx | 200 | `running`, bypass false / false |
| maintenance | 503 `APP_MAINTENANCE`, `until`, `Retry-After` | 503 same | 2xx | 200 | `maintenance` / bypass false / true |
| read_only | 200 | 503 `APP_READ_ONLY` | 2xx | 200 | `read_only` / false / true |
| disabled | 403 `APP_DISABLED`, no `until` | 403 | 403 | 403 | 200 `disabled` (both) |

Extra checks:
- `status_until` in the past on maintenance → 503 with `until`, **no** `Retry-After`.
- `GET /api/app-status` with no `Authorization` header → 200, `bypass: false` (not 401).
- Self-lock: `PATCH /api-system/applications/$PLATFORM_APP/status` with `x-app-id: $PLATFORM_APP` and `{"status":"maintenance"}` → 409, `error.code = APP_SELF_LOCK`, status unchanged (GET it).
- Stale `doc_version` on PATCH status → 409.
- Legacy: `PUT /api-system/applications/$TEST_APP` with `{"is_active":true,"doc_version":…}` while in maintenance → status still `maintenance`; with `{"is_active":false,…}` → `disabled`.
- `GET /api-system/applications?advance=` + urlencoded `{"where":{"status":{"in":["maintenance","read_only"]}}}` returns the test app (and not running apps); `GET /api-system/applications/summary` shows `statuses` as an object with all four keys.
- PATCH status with `"status_message": null, "status_until": null` on a maintenance app → both null on GET.
- Cleanup: PATCH back to `running`, `PUT bypass-users` with `[]`, delete the test app.

- [ ] **Step 4: Record results** in the PR description (table above filled in). No commit.
