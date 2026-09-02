# Cronjob Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/cronjobs` page in carmen-platform that performs full CRUD over the scheduled jobs in `"CRONJOBS"."Cronjob"`, plus start / stop / run-now, reaching the Go service only through an authenticated gateway module.

**Architecture:** Three repos, one feature, four deploy steps in a fixed order. `micro-cronjobs` (Go) gains a `docVersion` column, optimistic locking, and audit-user stamping. `backend-gateway` gains a `platform_cronjobs` module that authenticates the caller, paginates the Go service's unpaginated list in memory, and refuses edits to jobs owned by another service. `carmen-platform` gains a list page and an edit page following the Database Pools pages.

**Tech Stack:** Go 1.24 + Gin + GORM + golang-migrate · NestJS (backend-gateway) · React 19 + TypeScript + Vite + shadcn/ui + Tailwind · Bun

**Spec:** `docs/superpowers/specs/2026-09-02-cronjob-management-design.md`

## Global Constraints

- **Deploy order is fixed and must not be reordered:** (1) micro-cronjobs → (2) permission catalog seed → (3) backend-gateway → (4) carmen-platform. Step 2 before step 3 or `PlatformPermissionGuard` denies everyone; step 4 before step 3 gives a page that 404s.
- **Pushing a branch carrying a migration applies it on DEV within ~2 minutes without a merge.** Do not push Task 1's branch until its SQL is final.
- **`docVersion` counts human edits, never machine bookkeeping.** `UpdateLastRun` must never bump it.
- **`doc_version` is optional on the wire.** `micro-report` calls the same Go API and knows nothing about versions; requiring it breaks every BU's report scheduling.
- **Two distinct 409s.** `error_code: "VERSION_CONFLICT"` and `error_code: "FOREIGN_OWNED_JOB"`. They must never be told apart by HTTP status alone.
- **Wire query keys are always lowercase** (`searchfields`, not `searchFields`). A camelCase read silently drops the search term.
- **No test files are written during execution of this plan** (standing user preference). Type-check, lint and build still run on every task. Manual verification replaces automated tests.
- **carmen-platform rules that apply throughout:** never `alert()` / `window.confirm()` (use `toast.*` and `<ConfirmDialog>`); never add a `#` index column to `DataTable`; never raw green Tailwind for status (use `<Badge variant="success">`); wrap column defs in `useMemo`; page title only via `<PageHeader>`; Save/Cancel in `.unsaved-bar`, not `PageHeader actions`; new type fields optional (`?`).
- **Branch:** `feature/cronjob-management` in each repo. Never commit to `main`, `DEV` or `UAT`.

---

# Phase 1 — `micro-cronjobs` (deploy step 1)

Repo: `/Users/samutpra/GitHub/carmensoftware-organize/micro-cronjobs`

### Task 1: Add the `docVersion` column and model field

**Files:**
- Create: `migrations/<YYYYMMDDhhmmss>_add_doc_version.up.sql`
- Create: `migrations/<YYYYMMDDhhmmss>_add_doc_version.down.sql`
- Modify: `internal/model/cronjob.go` (after the `TimeoutSeconds` field, around line 24)

**Interfaces:**
- Consumes: nothing
- Produces: `model.CronJob.DocVersion int`, serialised as `doc_version` in every JSON response

- [ ] **Step 1: Create the branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/micro-cronjobs
git checkout -b feature/cronjob-management
```

- [ ] **Step 2: Generate the migration file pair**

`make migrate-create` prompts for a name and stamps a UTC timestamp itself — do not hand-name these files, the timestamp orders the migration.

```bash
make migrate-create
# at the prompt, type: add_doc_version
```

- [ ] **Step 3: Write the up migration**

Write into the generated `migrations/<timestamp>_add_doc_version.up.sql`:

```sql
SET statement_timeout = 0;

-- docVersion powers optimistic locking for human edits made from the platform
-- admin UI. Additive with a default so every existing row — including the
-- report schedules micro-report owns — keeps working untouched.
ALTER TABLE "CRONJOBS"."Cronjob"
  ADD COLUMN IF NOT EXISTS "docVersion" INT NOT NULL DEFAULT 1;
```

- [ ] **Step 4: Write the down migration**

Write into `migrations/<timestamp>_add_doc_version.down.sql`:

```sql
SET statement_timeout = 0;

ALTER TABLE "CRONJOBS"."Cronjob" DROP COLUMN IF EXISTS "docVersion";
```

- [ ] **Step 5: Add the model field**

In `internal/model/cronjob.go`, immediately after the `TimeoutSeconds` line:

```go
	TimeoutSeconds int `gorm:"column:timeoutSeconds;default:300" json:"timeout_seconds"`

	// DocVersion is bumped by every human edit through Update, and deliberately
	// NOT by UpdateLastRun. The scheduler writes lastRunAt/runCount/lastError on
	// every tick; if those bumped the version, anyone holding the edit form open
	// would be rejected roughly once a minute.
	DocVersion int `gorm:"column:docVersion;default:1" json:"doc_version"`
```

- [ ] **Step 6: Apply the migration locally and confirm the column exists**

```bash
make migrate-up
psql "$CRONJOB_DATABASE_URL" -c '\d "CRONJOBS"."Cronjob"' | grep docVersion
```

Expected: a row showing `docVersion | integer | not null | 1`

- [ ] **Step 7: Build and confirm the field serialises**

```bash
go build ./... && make run &
sleep 3
curl -s http://localhost:6016/api/cronjobs | head -c 400
```

Expected: each job object now carries `"doc_version":1`

- [ ] **Step 8: Commit (do NOT push yet — see Global Constraints)**

```bash
git add migrations internal/model/cronjob.go
git commit -m "feat(cronjob): เพิ่มคอลัมน์ docVersion สำหรับ optimistic locking

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 2: Make `Update` version-aware

**Files:**
- Modify: `internal/repository/cronjob_repo.go:75-81` (the `Update` method) and the imports
- Modify: `internal/handler/cronjob_handler.go` — the four `h.repo.Update(...)` call sites at roughly lines 152, 178, 194 and 279

**Interfaces:**
- Consumes: `model.CronJob.DocVersion` from Task 1
- Produces:
  - `repository.ErrVersionConflict` — a package-level sentinel error
  - `func (r *CronJobRepo) Update(ctx context.Context, job *model.CronJob, expectedVersion *int) error` — the third parameter is new; `nil` skips the version check

- [ ] **Step 1: Confirm nothing outside the handler calls `Update`**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/micro-cronjobs
grep -rn "repo.Update(\|Repo.Update(" --include=*.go . | grep -v UpdateLastRun
```

Expected: only `internal/handler/cronjob_handler.go`, four times. If the scheduler appears in this list, stop and report it — the design assumes the scheduler writes only through `UpdateLastRun`.

- [ ] **Step 2: Add the sentinel error**

At the top of `internal/repository/cronjob_repo.go`, after the imports:

```go
// ErrVersionConflict means the caller passed a docVersion that no longer matches
// the stored row — someone else saved in between. The handler maps it to HTTP 409.
var ErrVersionConflict = errors.New("cronjob version conflict")
```

Add `"errors"` to the import block.

- [ ] **Step 3: Rewrite `Update` as an optimistic update**

Replace the whole existing `Update` method:

```go
// Update writes a full row. When expectedVersion is non-nil the write is
// conditional on the stored docVersion still matching, and docVersion is
// incremented; a mismatch returns ErrVersionConflict and writes nothing.
//
// expectedVersion is nil for callers that predate optimistic locking —
// micro-report drives the by-source endpoints and knows nothing about versions.
// Locking is deliberately opt-in so those callers keep working.
func (r *CronJobRepo) Update(ctx context.Context, job *model.CronJob, expectedVersion *int) error {
	job.UpdatedAt = time.Now()

	q := r.db.WithContext(ctx).Model(&model.CronJob{}).Where(`"id" = ?`, job.ID)
	if expectedVersion != nil {
		q = q.Where(`"docVersion" = ?`, *expectedVersion)
	}

	updates := map[string]any{
		`"name"`:           job.Name,
		`"description"`:    job.Description,
		`"jobType"`:        job.JobType,
		`"cronExpression"`: job.CronExpression,
		`"jobData"`:        job.JobConfig,
		`"isActive"`:       job.IsActive,
		`"maxRetries"`:     job.MaxRetries,
		`"timeoutSeconds"`: job.TimeoutSeconds,
		`"updatedAt"`:      job.UpdatedAt,
		`"updatedByID"`:    job.UpdatedByID,
		`"docVersion"`:     gorm.Expr(`"docVersion" + 1`),
	}

	res := q.Updates(updates)
	if res.Error != nil {
		return fmt.Errorf("update cronjob %s: %w", job.ID, res.Error)
	}
	if res.RowsAffected == 0 {
		if expectedVersion != nil {
			return ErrVersionConflict
		}
		return gorm.ErrRecordNotFound
	}

	job.DocVersion = job.DocVersion + 1
	return nil
}
```

Note this replaces the old `Save(job)` call. `Save` wrote every column including `lastRunAt`, `runCount` and `lastError` from the in-memory struct, which would clobber scheduler bookkeeping written between the read and the write. The explicit column map is not incidental — it is the fix.

- [ ] **Step 4: Add a guard comment above `UpdateLastRun`**

Directly above the existing `func (r *CronJobRepo) UpdateLastRun(`:

```go
// UpdateLastRun records what the scheduler did. It must NEVER touch "docVersion":
// this runs on every tick, and bumping the version here would reject the Save of
// anyone holding the edit form open, roughly once a minute, in a way that reads
// as a random bug rather than a lock. Do not merge this into Update.
```

- [ ] **Step 5: Update the four call sites**

In `internal/handler/cronjob_handler.go` pass `nil` at every site for now; Task 3 threads the real version through `update`.

```go
// in update(), start(), stop() and updateBySource()
if err := h.repo.Update(c.Request.Context(), existing, nil); err != nil {
```

`start` and `stop` keep `nil` permanently — they load the row and flip one boolean, so there is no stale-read window worth guarding, and a version check there would make an ops action fail for a reason the operator cannot act on.

- [ ] **Step 6: Build and lint**

```bash
go build ./... && make lint
```

Expected: both clean.

- [ ] **Step 7: Verify the conflict path by hand**

```bash
make run &
sleep 3
ID=$(curl -s http://localhost:6016/api/cronjobs | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"][0]["id"])')
curl -s -X PUT http://localhost:6016/api/cronjobs/$ID -H 'Content-Type: application/json' -d '{"name":"probe-1"}' | python3 -m json.tool | grep doc_version
curl -s -X PUT http://localhost:6016/api/cronjobs/$ID -H 'Content-Type: application/json' -d '{"name":"probe-2"}' | python3 -m json.tool | grep doc_version
```

Expected: `doc_version` reads 2 then 3 — the counter advances on each human edit even though no version was sent.

- [ ] **Step 8: Commit**

```bash
git add internal/repository/cronjob_repo.go internal/handler/cronjob_handler.go
git commit -m "feat(cronjob): Update ตรวจ docVersion แบบ optimistic

เลิกใช้ Save() ที่เขียนทับ lastRunAt/runCount ที่ scheduler เพิ่งเขียน
UpdateLastRun ห้ามแตะ docVersion — เขียนกำกับไว้ในโค้ดแล้ว

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 3: Accept audit user, `doc_version`, retries and timeout in the handler

**Files:**
- Modify: `internal/handler/cronjob_handler.go` — the `create` input struct and body (~lines 71-111), the `update` input struct and body (~lines 114-158)

**Interfaces:**
- Consumes: `repository.ErrVersionConflict` and the three-argument `Update` from Task 2
- Produces: the Go API contract the gateway codes against in Task 5 —
  - `POST /api/cronjobs` additionally accepts `created_by_id`, `max_retries`, `timeout_seconds`
  - `PUT /api/cronjobs/:id` additionally accepts `updated_by_id`, `doc_version`, `max_retries`, `timeout_seconds`
  - a stale `doc_version` returns `409 {"error": "...", "error_code": "VERSION_CONFLICT"}`

- [ ] **Step 1: Extend the `create` input struct and mapping**

Replace the input struct and the `job := &model.CronJob{...}` literal inside `create`:

```go
	var input struct {
		Name           string  `json:"name"`
		Description    string  `json:"description,omitempty"`
		JobType        string  `json:"job_type"`
		CronExpression string  `json:"cron_expression"`
		JobConfig      any     `json:"job_config"`
		IsActive       bool    `json:"is_active"`
		SourceService  *string `json:"source_service,omitempty"`
		SourceID       *string `json:"source_id,omitempty"`
		MaxRetries     *int    `json:"max_retries,omitempty"`
		TimeoutSeconds *int    `json:"timeout_seconds,omitempty"`
		CreatedByID    *string `json:"created_by_id,omitempty"`
	}
```

```go
	job := &model.CronJob{
		Name:           input.Name,
		JobType:        input.JobType,
		CronExpression: input.CronExpression,
		JobConfig:      input.JobConfig,
		IsActive:       input.IsActive,
		SourceService:  input.SourceService,
		SourceID:       input.SourceID,
		CreatedByID:    input.CreatedByID,
		UpdatedByID:    input.CreatedByID,
		DocVersion:     1,
	}
	if input.Description != "" {
		job.Description = &input.Description
	}
	if input.MaxRetries != nil {
		job.MaxRetries = *input.MaxRetries
	}
	if input.TimeoutSeconds != nil {
		job.TimeoutSeconds = *input.TimeoutSeconds
	}
```

- [ ] **Step 2: Extend the `update` input struct**

```go
	var input struct {
		Name           *string `json:"name,omitempty"`
		Description    *string `json:"description,omitempty"`
		JobType        *string `json:"job_type,omitempty"`
		CronExpression *string `json:"cron_expression,omitempty"`
		JobConfig      any     `json:"job_config,omitempty"`
		IsActive       *bool   `json:"is_active,omitempty"`
		MaxRetries     *int    `json:"max_retries,omitempty"`
		TimeoutSeconds *int    `json:"timeout_seconds,omitempty"`
		UpdatedByID    *string `json:"updated_by_id,omitempty"`
		DocVersion     *int    `json:"doc_version,omitempty"`
	}
```

- [ ] **Step 3: Apply the new fields and thread the version through**

After the existing `if input.IsActive != nil { ... }` block, and replacing the `h.repo.Update(...)` call:

```go
	if input.MaxRetries != nil {
		existing.MaxRetries = *input.MaxRetries
	}
	if input.TimeoutSeconds != nil {
		existing.TimeoutSeconds = *input.TimeoutSeconds
	}
	if input.UpdatedByID != nil {
		existing.UpdatedByID = input.UpdatedByID
	}

	// nil skips the check — micro-report and other pre-locking callers omit it
	if err := h.repo.Update(c.Request.Context(), existing, input.DocVersion); err != nil {
		if errors.Is(err, repository.ErrVersionConflict) {
			c.JSON(http.StatusConflict, gin.H{
				"error":      "cronjob was modified by someone else",
				"error_code": "VERSION_CONFLICT",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
```

- [ ] **Step 4: Build and lint**

```bash
go build ./... && make lint
```

Expected: both clean. If `repository` is reported unused, it is already imported for `repository.CronJobRepo` — check the error text before adding an import.

- [ ] **Step 5: Verify the 409 by hand**

```bash
make run &
sleep 3
ID=$(curl -s http://localhost:6016/api/cronjobs | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"][0]["id"])')
V=$(curl -s http://localhost:6016/api/cronjobs/$ID | python3 -c 'import sys,json; print(json.load(sys.stdin)["doc_version"])')
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:6016/api/cronjobs/$ID \
  -H 'Content-Type: application/json' -d "{\"name\":\"v-ok\",\"doc_version\":$V}"
curl -s -X PUT http://localhost:6016/api/cronjobs/$ID \
  -H 'Content-Type: application/json' -d "{\"name\":\"v-stale\",\"doc_version\":$V}"
```

Expected: `200` first, then a 409 body containing `"error_code": "VERSION_CONFLICT"` — the second call reuses a version that the first call already consumed.

- [ ] **Step 6: Verify the by-source path still works without a version**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X PUT \
  "http://localhost:6016/api/cronjobs/$ID" -H 'Content-Type: application/json' -d '{"name":"no-version"}'
```

Expected: `200`. A 409 here means the check is not opt-in and would break micro-report on deploy — stop and fix before continuing.

- [ ] **Step 7: Commit and push**

The migration is now final, so pushing is safe. Pushing applies it on DEV within ~2 minutes.

```bash
git add internal/handler/cronjob_handler.go
git commit -m "feat(cronjob): รับ audit user, doc_version, max_retries, timeout_seconds

doc_version ไม่ส่งมา = ข้ามการตรวจ เพื่อไม่ให้ micro-report พัง
version ไม่ตรง → 409 error_code VERSION_CONFLICT

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
git push -u origin feature/cronjob-management
```

- [ ] **Step 8: Open the PR**

```bash
gh pr create --base main --title "feat(cronjob): docVersion + audit user สำหรับหน้าจัดการ cronjob" \
  --body-file /dev/stdin <<'EOF'
เพิ่ม `docVersion` เข้าตาราง `"CRONJOBS"."Cronjob"` พร้อม optimistic locking
และให้ create/update รับ `created_by_id` / `updated_by_id` / `max_retries` /
`timeout_seconds` เพื่อรองรับหน้า `/cronjobs` ใน carmen-platform

การล็อกเป็นแบบสมัครใจ — ไม่ส่ง `doc_version` มาก็ข้ามการตรวจ เพื่อให้
micro-report ที่เรียก API เดียวกันนี้ทำงานต่อได้โดยไม่ต้องแก้

`UpdateLastRun` ไม่แตะ `docVersion` โดยเจตนา มีคอมเมนต์กำกับไว้

ขั้นที่ 1 จาก 4 ของลำดับ deploy — ดู
`docs/superpowers/specs/2026-09-02-cronjob-management-design.md` ใน carmen-platform

https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa
EOF
gh pr merge --auto --squash
```

---

# Phase 2 — `carmen-turborepo-backend-v2` (deploy steps 2 and 3)

Repo: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2`

### Task 4: Seed the permission catalog

**Files:**
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts` (after the `database_pool` entries, ~line 89)
- Modify: `packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts`

**Interfaces:**
- Consumes: nothing
- Produces: the permission strings `cronjob.read` and `cronjob.manage` that Task 5's guards and the frontend's route gates depend on

- [ ] **Step 1: Create the branch**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-turborepo-backend-v2
git checkout -b feature/cronjob-management
```

- [ ] **Step 2: Add the two catalog rows**

In `seed.platform-permission.data.ts`, directly after the last `database_pool` entry:

```ts
  { resource: "cronjob", action: "read", description: "View scheduled jobs, their schedules, and run history" },
  { resource: "cronjob", action: "manage", description: "Create, edit and delete scheduled jobs, and start, stop or run them on demand" },
```

- [ ] **Step 3: Grant both to the same roles that hold `sql_workbench`**

```bash
grep -n "sql_workbench" packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
```

Mirror that shape for `cronjob.read` / `cronjob.manage`. If `sql_workbench` appears under more than one role, mirror every one — a permission seeded into the catalog but attached to no role leaves the endpoint reachable by nobody, which looks identical to a broken guard.

- [ ] **Step 4: Type-check**

```bash
bun run check-types
```

Expected: clean. Do **not** run `bun run lint` — it carries `--fix` and rewrites the whole repo; use `bunx eslint <path>` if you need to lint.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts \
        packages/prisma-shared-schema-platform/prisma/seed.platform-role-permission.data.ts
git commit -m "feat(platform): seed สิทธิ์ cronjob.read / cronjob.manage

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 5: Build the `platform_cronjobs` gateway module

**Files:**
- Create: `apps/backend-gateway/src/platform/platform_cronjobs/platform_cronjobs.service.ts`
- Create: `apps/backend-gateway/src/platform/platform_cronjobs/platform_cronjobs.controller.ts`
- Create: `apps/backend-gateway/src/platform/platform_cronjobs/platform_cronjobs.module.ts`
- Create: `apps/backend-gateway/src/platform/platform_cronjobs/swagger/request.ts`
- Create: `apps/backend-gateway/src/platform/platform_cronjobs/swagger/response.ts`
- Modify: `apps/backend-gateway/src/app.module.ts` (register `PlatformCronjobsModule`)
- Modify (generated): `apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts`

**Interfaces:**
- Consumes: the Go contract from Task 3; `envConfig.CRONJOB_SERVICE_URL` (already declared in `src/libs/config.env.ts:165`)
- Produces: the REST surface the frontend service in Task 6 calls —
  - `GET /api-system/platform/cronjobs` → `{ data: CronJob[], paginate: { total, page, perpage, pages } }`
  - `GET /api-system/platform/cronjobs/status` → `{ active_jobs: number }`
  - `GET|POST|PATCH|DELETE /api-system/platform/cronjobs[/:id]`
  - `POST /api-system/platform/cronjobs/:id/{start,stop,execute}`

- [ ] **Step 1: Read the two reference implementations before writing anything**

The controller shape (guards, decorators, `BaseHttpController.respond`, `PaginateQuery`) comes from Database Pools; the HTTP-to-Go-service shape comes from Reports. This module is a hybrid — Database Pools talks RPC, which this one must not.

```bash
sed -n '1,120p' apps/backend-gateway/src/platform/platform_database-pools/platform_database-pools.controller.ts
sed -n '160,220p' apps/backend-gateway/src/application/reports/reports.service.ts
```

- [ ] **Step 2: Write the service**

Create `platform_cronjobs.service.ts`:

```ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BackendLogger } from 'src/common/helpers/backend.logger';
import { Result } from '@/common';
import { IPaginate } from 'src/shared-dto/paginate.dto';
import { envConfig } from 'src/libs/config.env';

/** One row of "CRONJOBS"."Cronjob" as micro-cronjob serialises it. */
export interface CronJobRow {
  id: string;
  name: string;
  description?: string;
  job_type: string;
  cron_expression: string;
  job_config: unknown;
  source_service?: string;
  source_id?: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_error?: string;
  run_count: number;
  max_retries: number;
  retry_count: number;
  timeout_seconds: number;
  created_at: string;
  created_by_id?: string;
  updated_at: string;
  updated_by_id?: string;
  doc_version: number;
}

const SEARCHABLE: (keyof CronJobRow)[] = [
  'name', 'description', 'job_type', 'cron_expression', 'source_service',
];

const SORTABLE = new Set([
  'name', 'job_type', 'is_active', 'last_run_at', 'next_run_at', 'run_count', 'created_at',
]);

/**
 * Proxies platform cronjob administration to micro-cronjob over HTTP
 * ส่งต่อการจัดการ cronjob ระดับแพลตฟอร์มไปยัง micro-cronjob ผ่าน HTTP
 *
 * micro-cronjob has no authentication of its own, so this module is the only
 * thing standing between the browser and a service that will happily delete any
 * job for anyone. Never expose CRONJOB_SERVICE_URL to the frontend.
 */
@Injectable()
export class PlatformCronjobsService {
  private readonly logger: BackendLogger = new BackendLogger(PlatformCronjobsService.name);
  private readonly baseUrl = envConfig.CRONJOB_SERVICE_URL?.replace(/\/$/, '') ?? '';

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new HttpException('CRONJOB_SERVICE_URL is not configured', 500);
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
      ...init,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string; message?: string; error_code?: string;
      };
      throw new HttpException(
        { message: body.error ?? body.message ?? 'Cronjob service request failed', error_code: body.error_code },
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  /** Fetch the whole table. micro-cronjob has no pagination and its contract is
   *  shared with micro-report, so filtering happens here instead.
   *
   *  This pulls every row on every list request. Acceptable at tens-to-hundreds
   *  of rows; this is the place to add a cache or push pagination into Go when
   *  the table grows. */
  private async fetchAll(): Promise<CronJobRow[]> {
    const wrapped = await this.request<{ data: CronJobRow[]; total: number }>('/api/cronjobs');
    return wrapped.data ?? [];
  }

  async findAll(paginate: IPaginate): Promise<Result<unknown>> {
    let rows = await this.fetchAll();

    const term = (paginate.search ?? '').trim().toLowerCase();
    if (term) {
      // wire keys are lowercase; reading a camelCase key here drops the term silently
      const fields = (paginate.searchfields?.length ? paginate.searchfields : SEARCHABLE) as (keyof CronJobRow)[];
      rows = rows.filter((r) =>
        fields.some((f) => String(r[f] ?? '').toLowerCase().includes(term)),
      );
    }

    const filter = (paginate.filter ?? {}) as Record<string, unknown>;
    if (filter.job_type) rows = rows.filter((r) => r.job_type === filter.job_type);
    if (filter.source_service !== undefined) {
      const want = String(filter.source_service);
      rows = want === ''
        ? rows.filter((r) => !r.source_service)
        : rows.filter((r) => r.source_service === want);
    }
    if (filter.is_active !== undefined) {
      const want = String(filter.is_active) === 'true';
      rows = rows.filter((r) => r.is_active === want);
    }

    const [sortField, sortDir] = String(paginate.sort ?? '').split(':');
    if (SORTABLE.has(sortField)) {
      const dir = sortDir === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = a[sortField as keyof CronJobRow] ?? '';
        const bv = b[sortField as keyof CronJobRow] ?? '';
        return av === bv ? 0 : (av < bv ? -1 : 1) * dir;
      });
    }

    const total = rows.length;
    const perpage = paginate.perpage && paginate.perpage > 0 ? paginate.perpage : 10;
    const page = paginate.page && paginate.page > 0 ? paginate.page : 1;
    const start = (page - 1) * perpage;

    return Result.ok({
      data: rows.slice(start, start + perpage),
      paginate: { total, page, perpage, pages: Math.max(1, Math.ceil(total / perpage)) },
    });
  }

  async status(): Promise<Result<unknown>> {
    return Result.ok(await this.request('/api/cronjobs/status'));
  }

  async findOne(id: string): Promise<Result<unknown>> {
    return Result.ok(await this.request(`/api/cronjobs/${encodeURIComponent(id)}`));
  }

  async create(data: Record<string, unknown>, user_id: string): Promise<Result<unknown>> {
    const created = await this.request('/api/cronjobs', {
      method: 'POST',
      body: JSON.stringify({ ...data, source_service: undefined, source_id: undefined, created_by_id: user_id }),
    });
    return Result.ok(created);
  }

  /** Guard: a job another service owns is read-only here. micro-report writes each
   *  BU's report schedules into this same table; editing one from the platform
   *  console would break that BU's reports with the BU never learning why.
   *  This lives in the gateway, not the UI — a disabled button is a hint, this is
   *  the rule. */
  private async assertPlatformOwned(id: string): Promise<void> {
    const row = await this.request<CronJobRow>(`/api/cronjobs/${encodeURIComponent(id)}`);
    if (row.source_service) {
      throw new HttpException(
        {
          message: `This job is owned by ${row.source_service} and cannot be edited here`,
          error_code: 'FOREIGN_OWNED_JOB',
          source_service: row.source_service,
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  async update(id: string, data: Record<string, unknown>, user_id: string): Promise<Result<unknown>> {
    await this.assertPlatformOwned(id);
    const updated = await this.request(`/api/cronjobs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...data, updated_by_id: user_id }),
    });
    return Result.ok(updated);
  }

  async remove(id: string): Promise<Result<unknown>> {
    await this.assertPlatformOwned(id);
    return Result.ok(await this.request(`/api/cronjobs/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  }

  /** start / stop / execute are ops actions: reversible, visible, and available on
   *  every job including ones another service owns. No ownership check here. */
  async control(id: string, action: 'start' | 'stop' | 'execute'): Promise<Result<unknown>> {
    return Result.ok(
      await this.request(`/api/cronjobs/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
    );
  }
}
```

Two things to confirm against the real types before you trust this code:

- **`IPaginate`'s field names.** The service reads `paginate.search`, `paginate.searchfields`, `paginate.filter`, `paginate.sort`, `paginate.page`, `paginate.perpage`. Open `src/shared-dto/paginate.dto.ts` and match whatever `PaginateQuery` actually produces — a field read under the wrong name silently filters nothing, which looks like a working page returning wrong rows.
- **The verb changes at this boundary on purpose.** The gateway exposes `PATCH` (partial update, matching this repo's other platform modules) and forwards it to the Go service's `PUT`, whose handler is already a partial update over pointer fields. Do not "fix" one to match the other.

- [ ] **Step 3: Write the swagger DTOs**

Create `swagger/request.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CronjobCreateDto {
  @ApiProperty({ example: 'Nightly activity rollup' }) name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: ['report', 'notification', 'cleanup', 'dashboard_refresh', 'activity_rollup', 'activity_retention'] })
  job_type: string;
  @ApiProperty({ example: '0 2 * * *' }) cron_expression: string;
  @ApiProperty({ type: Object }) job_config: Record<string, unknown>;
  @ApiPropertyOptional({ default: true }) is_active?: boolean;
  @ApiPropertyOptional({ default: 0 }) max_retries?: number;
  @ApiPropertyOptional({ default: 300 }) timeout_seconds?: number;
}

export class CronjobUpdateDto {
  @ApiPropertyOptional() name?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ example: '0 2 * * *' }) cron_expression?: string;
  @ApiPropertyOptional({ type: Object }) job_config?: Record<string, unknown>;
  @ApiPropertyOptional() is_active?: boolean;
  @ApiPropertyOptional() max_retries?: number;
  @ApiPropertyOptional() timeout_seconds?: number;
  @ApiPropertyOptional({ description: 'Optimistic lock version from the GET that produced this form' })
  doc_version?: number;
}
```

`job_type` is deliberately absent from the update DTO: changing it turns the stored `job_config` into garbage, so changing type means creating a new job.

Create `swagger/response.ts` with a `CronjobResponseDto` whose properties mirror `CronJobRow` in the service, each with `@ApiProperty` / `@ApiPropertyOptional`.

- [ ] **Step 4: Write the controller**

Create `platform_cronjobs.controller.ts` following the Database Pools controller exactly — same imports, same class decorators — with `@Controller('api-system/platform/cronjobs')` and `@ApiTags('Platform: Cronjobs')`. Nine routes, the first being:

```ts
  @Get()
  @UseGuards(new AppIdGuard('cronjob.findAll'), PlatformPermissionGuard)
  @RequirePlatformPermission('cronjob.read')
  @EnrichAuditUsers()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List scheduled jobs', operationId: 'platformCronjob_findAll' })
  @ApiStdResponse(CronjobResponseDto, { isArray: true, paginated: true, description: 'Jobs retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Missing cronjob.read permission' })
  @ApiUserFilterQueries()
  async findAll(@Res() res: Response, @Query() query?: IPaginateQuery): Promise<void> {
    this.respond(res, await this.service.findAll(PaginateQuery(query)));
  }
```

The remaining eight follow the same shape with these api_name / permission pairs:

| Route | `AppIdGuard` api_name | Permission |
|---|---|---|
| `GET /status` | `cronjob.status` | `cronjob.read` |
| `GET /:cronjob_id` | `cronjob.findOne` | `cronjob.read` |
| `POST /` | `cronjob.create` | `cronjob.manage` |
| `PATCH /:cronjob_id` | `cronjob.update` | `cronjob.manage` |
| `DELETE /:cronjob_id` | `cronjob.delete` | `cronjob.manage` |
| `POST /:cronjob_id/start` | `cronjob.start` | `cronjob.manage` |
| `POST /:cronjob_id/stop` | `cronjob.stop` | `cronjob.manage` |
| `POST /:cronjob_id/execute` | `cronjob.execute` | `cronjob.manage` |

`create` and `update` read the caller as `req.user?.user_id` and pass it through; the three control routes call `this.service.control(id, '<action>')`. Every write route documents `@ApiResponse({ status: 409, description: 'Version conflict (VERSION_CONFLICT) or job owned by another service (FOREIGN_OWNED_JOB)' })`.

- [ ] **Step 5: Write the module and register it**

Create `platform_cronjobs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlatformCronjobsController } from './platform_cronjobs.controller';
import { PlatformCronjobsService } from './platform_cronjobs.service';

@Module({
  controllers: [PlatformCronjobsController],
  providers: [PlatformCronjobsService],
})
export class PlatformCronjobsModule {}
```

Then add `PlatformCronjobsModule` to the `imports` array in `apps/backend-gateway/src/app.module.ts`, beside the other `Platform*Module` entries.

- [ ] **Step 6: Regenerate the app-api catalog**

The nine `AppIdGuard` names must exist in the generated catalog or the drift audit fails and the PR cannot merge. This is the gate most often forgotten.

```bash
bun run scripts/generate-app-api-catalog/run.ts
git diff --stat apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
```

Expected: nine added lines, `cronjob.create` through `cronjob.update`.

- [ ] **Step 7: Type-check and run the audit gates**

```bash
bun run check-types
bun run audit:app-api-catalog-drift
bunx eslint apps/backend-gateway/src/platform/platform_cronjobs
```

Expected: all clean. Remember `bun run lint` rewrites the repo — use `bunx eslint` on the path.

- [ ] **Step 8: Verify against a running micro-cronjob**

Start micro-cronjob on 6016 and the gateway, then, with a super-admin bearer token in `$TOKEN` and the app id in `$APPID`:

```bash
curl -s "http://localhost:4000/api-system/platform/cronjobs?page=1&perpage=2" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APPID" | python3 -m json.tool | head -30
```

Expected: a `paginate` block reading `perpage: 2` with `total` larger than 2 — proving the gateway paginated a list the Go service returned whole.

- [ ] **Step 9: Verify the ownership refusal at the API, not the UI**

Pick a row that has a `source_service` (micro-report writes these), then:

```bash
curl -s -X PATCH "http://localhost:4000/api-system/platform/cronjobs/$FOREIGN_ID" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APPID" \
  -H 'Content-Type: application/json' -d '{"name":"should not work"}' | python3 -m json.tool
```

Expected: HTTP 409 with `"error_code": "FOREIGN_OWNED_JOB"`. If this returns 200, the whole ownership guarantee is UI-only and the feature is not safe to ship.

- [ ] **Step 10: Commit, push, PR**

```bash
git add apps/backend-gateway/src/platform/platform_cronjobs apps/backend-gateway/src/app.module.ts \
        apps/backend-gateway/src/platform/applications/app-api-catalog.generated.ts
git commit -m "feat(gateway): module platform_cronjobs

paginate ในหน่วยความจำเพราะ micro-cronjob คืนทั้งก้อนและ contract
ใช้ร่วมกับ micro-report; กันแก้ job ของ service อื่นที่ชั้นนี้ ไม่ใช่ที่ UI

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
git push -u origin feature/cronjob-management
gh pr create --base main --title "feat(gateway): หน้าจัดการ cronjob ระดับ platform" --body-file /dev/stdin <<'EOF'
เพิ่ม `/api-system/platform/cronjobs` ให้ carmen-platform เรียกได้ พร้อมสิทธิ์
`cronjob.read` / `cronjob.manage` (seed มาในคอมมิตเดียวกัน)

micro-cronjob ไม่มี auth ของตัวเอง module นี้จึงเป็นด่านเดียวระหว่างเบราว์เซอร์
กับ service ที่ลบ job ให้ใครก็ได้ — `CRONJOB_SERVICE_URL` ต้องไม่หลุดไปฝั่ง frontend

- pagination ทำในหน่วยความจำ: micro-cronjob ไม่มี และ contract ใช้ร่วมกับ micro-report
- PATCH/DELETE บน job ที่มี `source_service` → 409 `FOREIGN_OWNED_JOB`
- start/stop/execute ปล่อยผ่านทุก job — เป็นงาน ops ที่ย้อนกลับได้

ขั้นที่ 2-3 จาก 4 ของลำดับ deploy · ต้องขึ้นหลัง micro-cronjobs และก่อน carmen-platform

https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa
EOF
gh pr merge --auto --squash
```

---

# Phase 3 — `carmen-platform` (deploy step 4)

Repo: `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`, branch `feature/cronjob-management` (already created, holds the spec and this plan)

### Task 6: Types, service, dependencies and the cron helper

**Files:**
- Modify: `src/types/index.ts` (append a new section at the end)
- Create: `src/services/cronjobService.ts`
- Create: `src/utils/cronExpression.ts`
- Modify: `package.json` (two dependencies)

**Interfaces:**
- Consumes: the gateway REST surface from Task 5
- Produces:
  - `CronJob`, `CronJobType`, `CronJobConfig` (union), `CronJobsResponse`, `CronJobWriteInput` in `src/types/index.ts`
  - `cronjobService` with `getAll`, `getById`, `create`, `update`, `remove`, `start`, `stop`, `execute`, `getStatus`
  - `describeCron(expr: string, locale: 'th' | 'en'): string | null` and `nextRuns(expr: string, count?: number): Date[]` from `src/utils/cronExpression.ts`

- [ ] **Step 1: Install the two approved dependencies**

```bash
cd /Users/samutpra/GitHub/carmensoftware-organize/carmen-platform
bun add cronstrue cron-parser
```

These are the only new dependencies this feature adds, approved during design. `cronstrue` renders an expression as a sentence and ships Thai; `cron-parser` computes upcoming runs.

- [ ] **Step 2: Add the types**

Append to `src/types/index.ts`:

```ts
// ==================== Cronjobs ("CRONJOBS"."Cronjob") ====================

export type CronJobType =
  | 'report'
  | 'notification'
  | 'cleanup'
  | 'dashboard_refresh'
  | 'activity_rollup'
  | 'activity_retention';

export interface ReportJobConfig {
  template_id?: string;
  bu_codes?: string[];
  format?: string;
  filters?: Record<string, string>;
  recipients?: string[];
  delivery?: { type?: string; viewer_endpoint?: string };
  notifications?: { web?: boolean; email?: boolean; mail_source?: string };
}
export interface NotificationJobConfig {
  title?: string;
  message?: string;
  type?: string;
  category?: string;
  user_ids?: string[];
}
export interface CleanupJobConfig { action?: string; type?: string; older_than?: string }
export interface DashboardRefreshJobConfig { bu_codes?: string[]; tier?: string }
export interface ActivityRollupJobConfig { days_back?: number }
export interface ActivityRetentionJobConfig { retention_days?: number; batch_size?: number }

export type CronJobConfig =
  | ReportJobConfig
  | NotificationJobConfig
  | CleanupJobConfig
  | DashboardRefreshJobConfig
  | ActivityRollupJobConfig
  | ActivityRetentionJobConfig;

/** หนึ่งแถวใน "CRONJOBS"."Cronjob" — ตารางนี้ใช้ร่วมกับ micro-report
 *  แถวที่มี source_service เป็นของ service อื่น แก้/ลบจากหน้านี้ไม่ได้ (gateway ตอบ 409) */
export interface CronJob {
  id: string;
  name: string;
  description?: string;
  job_type: CronJobType;
  cron_expression: string;
  job_config?: CronJobConfig;
  source_service?: string;
  source_id?: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_error?: string;
  run_count?: number;
  max_retries?: number;
  retry_count?: number;
  timeout_seconds?: number;
  created_at?: string;
  created_by_id?: string;
  updated_at?: string;
  updated_by_id?: string;
  doc_version?: number;
}

export interface CronJobsResponse {
  data: CronJob[];
  paginate?: PaginateInfo;
}

export interface CronJobWriteInput {
  name: string;
  description?: string;
  job_type?: CronJobType;   // create only — locked when editing
  cron_expression: string;
  job_config: CronJobConfig;
  is_active: boolean;
  max_retries?: number;
  timeout_seconds?: number;
}
```

- [ ] **Step 3: Write the service**

Create `src/services/cronjobService.ts`:

```ts
import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { CronJob, CronJobsResponse, CronJobWriteInput, PaginateParams } from '../types';

// ตรงกับ SEARCHABLE ฝั่ง gateway (platform_cronjobs.service.ts)
// คีย์บนสาย wire เป็นตัวเล็กล้วนเสมอ — เขียน camelCase แล้วคำค้นหายเงียบ
const defaultSearchFields = ['name', 'description', 'job_type', 'source_service'];

const BASE = '/api-system/platform/cronjobs';

/**
 * งานตามเวลาใน "CRONJOBS"."Cronjob"
 *
 * micro-cronjob ไม่มี auth ของตัวเอง ทุกอย่างจึงผ่าน gateway เท่านั้น
 * pagination ทำที่ gateway เพราะ Go คืนทั้งตารางมาในครั้งเดียว
 */
const cronjobService = {
  getAll: async (paginate: PaginateParams = {}): Promise<CronJobsResponse> => {
    const res = await api.get(`${BASE}?${buildQuery(paginate, defaultSearchFields)}`);
    return res.data.data ?? res.data;
  },

  getById: async (id: string): Promise<CronJob> => {
    const res = await api.get(`${BASE}/${id}`);
    return res.data.data ?? res.data;
  },

  create: async (data: CronJobWriteInput): Promise<CronJob> => {
    const res = await api.post(BASE, data);
    return res.data.data ?? res.data;
  },

  // doc_version ส่งเฉพาะเมื่อ GET คืนมา — ไม่ส่ง = gateway ข้ามการตรวจ
  update: async (
    id: string,
    data: Omit<CronJobWriteInput, 'job_type'> & { doc_version?: number },
  ): Promise<CronJob> => {
    const res = await api.patch(`${BASE}/${id}`, data);
    return res.data.data ?? res.data;
  },

  remove:  async (id: string) => (await api.delete(`${BASE}/${id}`)).data,
  start:   async (id: string) => (await api.post(`${BASE}/${id}/start`)).data,
  stop:    async (id: string) => (await api.post(`${BASE}/${id}/stop`)).data,
  execute: async (id: string) => (await api.post(`${BASE}/${id}/execute`)).data,

  getStatus: async (): Promise<{ active_jobs: number }> => {
    const res = await api.get(`${BASE}/status`);
    return res.data.data ?? res.data;
  },
};

export default cronjobService;
```

- [ ] **Step 4: Write the cron helper**

Create `src/utils/cronExpression.ts`:

```ts
import cronstrue from 'cronstrue';
import 'cronstrue/locales/th';
import { CronExpressionParser } from 'cron-parser';

/**
 * แปลง cron expression เป็นประโยคที่คนอ่านได้ คืน null เมื่อ expression ไม่ถูกต้อง
 * ผู้เรียกใช้ null เป็นสัญญาณ validate — ไม่ต้อง parse ซ้ำเอง
 */
export const describeCron = (expr: string, locale: 'th' | 'en' = 'en'): string | null => {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  try {
    return cronstrue.toString(trimmed, { locale, throwExceptionOnParseError: true });
  } catch {
    return null;
  }
};

/** เวลารันถัดไป n รอบ คืน [] เมื่อ expression ไม่ถูกต้อง */
export const nextRuns = (expr: string, count = 3): Date[] => {
  const trimmed = expr.trim();
  if (!trimmed) return [];
  try {
    const it = CronExpressionParser.parse(trimmed);
    return Array.from({ length: count }, () => it.next().toDate());
  } catch {
    return [];
  }
};
```

If `cron-parser`'s export shape differs in the installed version, check `node_modules/cron-parser/dist/index.d.ts` and adapt the import — do not fall back to a hand-rolled parser.

- [ ] **Step 5: Type-check**

```bash
bun run typecheck
```

Expected: clean. If a stale Vite checker overlay shows errors that the CLI does not, restart the dev server before believing it.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/cronjobService.ts src/utils/cronExpression.ts package.json bun.lock
git commit -m "feat(cronjob): types, service และตัวช่วยอ่าน cron expression

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 7: The six job-config field groups

**Files:**
- Create: `src/pages/cronjobs/jobConfig/ReportConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/NotificationConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/CleanupConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/DashboardRefreshConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/ActivityRollupConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/ActivityRetentionConfigFields.tsx`
- Create: `src/pages/cronjobs/jobConfig/index.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: the six config interfaces from Task 6
- Produces: `<JobConfigFields job_type value onChange readOnly fieldErrors />` from `src/pages/cronjobs/jobConfig/index.tsx` — the single component `CronJobEdit` renders for section 4

Six small files rather than one switch statement: each has a different data source (report needs templates and BUs, notification needs users, the rest need nothing), and a file you can hold in context edits more reliably than one that does all six.

- [ ] **Step 1: Define the shared props contract**

Create `src/pages/cronjobs/jobConfig/index.tsx`:

```tsx
import type { CronJobConfig, CronJobType } from '../../../types';
import ReportConfigFields from './ReportConfigFields';
import NotificationConfigFields from './NotificationConfigFields';
import CleanupConfigFields from './CleanupConfigFields';
import DashboardRefreshConfigFields from './DashboardRefreshConfigFields';
import ActivityRollupConfigFields from './ActivityRollupConfigFields';
import ActivityRetentionConfigFields from './ActivityRetentionConfigFields';

export interface JobConfigFieldsProps<T = CronJobConfig> {
  value: T;
  onChange: (next: T) => void;
  readOnly?: boolean;
  fieldErrors?: Record<string, string>;
}

interface Props extends JobConfigFieldsProps {
  job_type: CronJobType;
}

/** เลือกชุดฟิลด์ตามชนิดงาน — แต่ละชนิดมีแหล่งข้อมูลของตัวเอง จึงแยกไฟล์ */
export default function JobConfigFields({ job_type, ...rest }: Props) {
  switch (job_type) {
    case 'report':             return <ReportConfigFields {...rest} />;
    case 'notification':       return <NotificationConfigFields {...rest} />;
    case 'cleanup':            return <CleanupConfigFields {...rest} />;
    case 'dashboard_refresh':  return <DashboardRefreshConfigFields {...rest} />;
    case 'activity_rollup':    return <ActivityRollupConfigFields {...rest} />;
    case 'activity_retention': return <ActivityRetentionConfigFields {...rest} />;
    default:                   return null;
  }
}
```

- [ ] **Step 2: Write the three simple field groups**

`ActivityRollupConfigFields.tsx`:

```tsx
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useTranslation } from '../../../i18n/translate';
import type { ActivityRollupJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

export default function ActivityRollupConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<ActivityRollupJobConfig>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Label htmlFor="days_back">{t('cronjob.config.daysBack')}</Label>
      <Input
        id="days_back"
        type="number"
        min={1}
        disabled={readOnly}
        value={value.days_back ?? 2}
        onChange={(e) => onChange({ ...value, days_back: Number(e.target.value) })}
      />
      <p className="text-xs text-muted-foreground">{t('cronjob.config.daysBackHint')}</p>
    </div>
  );
}
```

`ActivityRetentionConfigFields.tsx` follows the same shape with two fields — `retention_days` (default 365) and `batch_size` (default 10000) — laid out `grid gap-4 lg:grid-cols-2`.

`CleanupConfigFields.tsx` follows the same shape with three text `Input`s: `action`, `type`, `older_than`.

- [ ] **Step 3: Write `DashboardRefreshConfigFields.tsx`**

```tsx
import BusinessUnitMultiSelect from '../../../components/BusinessUnitMultiSelect';
import { Label } from '../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { useTranslation } from '../../../i18n/translate';
import type { DashboardRefreshJobConfig } from '../../../types';
import type { JobConfigFieldsProps } from './index';

const TIERS = ['', 'operational', 'breakdown', 'matrix'];

export default function DashboardRefreshConfigFields({
  value, onChange, readOnly,
}: JobConfigFieldsProps<DashboardRefreshJobConfig>) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('cronjob.config.buCodes')}</Label>
        <BusinessUnitMultiSelect
          value={value.bu_codes ?? []}
          onChange={(bu_codes) => onChange({ ...value, bu_codes })}
          disabled={readOnly}
        />
        <p className="text-xs text-muted-foreground">{t('cronjob.config.buCodesEmptyMeansAll')}</p>
      </div>
      <div className="space-y-2">
        <Label>{t('cronjob.config.tier')}</Label>
        <Select value={value.tier ?? ''} onValueChange={(tier) => onChange({ ...value, tier })} disabled={readOnly}>
          <SelectTrigger><SelectValue placeholder={t('cronjob.config.tierAll')} /></SelectTrigger>
          <SelectContent>
            {TIERS.map((tier) => (
              <SelectItem key={tier || 'all'} value={tier}>
                {tier || t('cronjob.config.tierAll')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

Check `BusinessUnitMultiSelect`'s real props first (`sed -n '1,40p' src/components/BusinessUnitMultiSelect.tsx`) and match them — the names above are the intent, not a guarantee.

- [ ] **Step 4: Write `NotificationConfigFields.tsx`**

Fields: `title` (`Input`), `message` (`Textarea`), `type` and `category` (`Input`), `user_ids` (a multi-select fed by `userService.getAll({ perpage: 200 })`, loaded in a `useEffect` with a race guard — an ignore flag flipped in the cleanup — per `agent-os/standards/hooks/`). Empty `user_ids` means every user, so render that as explicit hint text rather than leaving it ambiguous.

- [ ] **Step 5: Write `ReportConfigFields.tsx`**

The largest of the six. Fields:

- `template_id` — a `Select` fed by `reportTemplateService.getAll({ perpage: 200 })`, loaded once with a race guard
- `bu_codes` — `<BusinessUnitMultiSelect>`
- `format` — `Select` over `pdf` / `excel` / `csv` / `json`
- `filters` — repeatable key/value rows over `Record<string, string>` with an add and a remove button
- `recipients` — `<ChipInput>` over the comma-joined string, converting to and from `string[]` at the boundary
- `delivery.type` — `Select` over `file` / `viewer_url`; show `delivery.viewer_endpoint` only when `viewer_url` is selected
- `notifications.web` / `.email` — `Switch`es; `notifications.mail_source` — `Select` over `internal` / `external`, shown only when `email` is on

Report jobs created here author `cron_expression` directly and leave `schedule_config` unset. `schedule_config` exists so micro-report can read its own frequency back out of a cron expression; a platform-authored job has no such need, and writing a half-filled one would mislead whoever reads it next.

- [ ] **Step 6: Add every i18n key used above**

Add a `cronjob.config.*` block to both `src/i18n/en.ts` and `src/i18n/th.ts`, with identical key sets. Keys are typed (`TKey`), so a key present in one file and missing from the other fails the type-check — which is how you verify this step.

- [ ] **Step 7: Type-check and lint**

```bash
bun run typecheck && bun run lint
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/pages/cronjobs src/i18n
git commit -m "feat(cronjob): ชุดฟิลด์ job_config ทั้ง 6 ชนิด

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 8: `CronJobEdit` — the create and edit page

**Files:**
- Create: `src/pages/cronjobs/CronJobEdit.tsx`
- Create: `src/pages/cronjobs/CronScheduleField.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `cronjobService`, `JobConfigFields`, `describeCron`, `nextRuns`
- Produces: the default-exported `CronJobEdit` component that Task 10 routes to

- [ ] **Step 1: Read the reference page first**

```bash
sed -n '1,120p' src/pages/DatabasePoolEdit.tsx
```

Match its structure: state shape, `savedFormData` comparison, `useUnsavedChanges`, `useGlobalShortcuts`, the debug Sheet, and the `.unsaved-bar`.

- [ ] **Step 2: Write `CronScheduleField.tsx`**

```tsx
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useTranslation } from '../../i18n/translate';
import { describeCron, nextRuns } from '../../utils/cronExpression';

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  error?: string;
}

/** ช่องกรอก cron expression พร้อมคำอ่านและเวลารัน 3 รอบถัดไป
 *  describeCron คืน null เมื่อ expression ผิด — ใช้เป็นสัญญาณ validate โดยตรง */
export default function CronScheduleField({ value, onChange, readOnly, error }: Props) {
  const { t, locale } = useTranslation();
  const sentence = describeCron(value, locale === 'th' ? 'th' : 'en');
  const upcoming = nextRuns(value, 3);

  return (
    <div className="space-y-2">
      <Label htmlFor="cron_expression">{t('cronjob.field.cronExpression')}</Label>
      <Input
        id="cron_expression"
        className="font-mono"
        placeholder="0 2 * * *"
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!error && value.trim() !== '' && !sentence && (
        <p className="text-xs text-destructive">{t('cronjob.validation.invalidCron')}</p>
      )}
      {sentence && <p className="text-sm text-muted-foreground">{sentence}</p>}
      {upcoming.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {upcoming.map((d) => (
            <li key={d.toISOString()}>{d.toLocaleString()}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Confirm `useTranslation()` actually exposes `locale`; if it does not, read the current language from wherever `LanguageToggle` reads it and pass it in as a prop instead.

- [ ] **Step 3: Write the page skeleton with its state**

`CronJobEdit.tsx` holds:

```tsx
const { id } = useParams<{ id: string }>();
const isNew = !id;
const [formData, setFormData] = useState<CronJobWriteInput>({
  name: '', description: '', job_type: 'cleanup', cron_expression: '',
  job_config: {}, is_active: true, max_retries: 0, timeout_seconds: 300,
});
const [savedFormData, setSavedFormData] = useState<CronJobWriteInput | null>(null);
// doc_version อยู่ใน state ของตัวเอง ห้ามเก็บใน formData (กฎข้อ 17)
const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
const [sourceService, setSourceService] = useState<string | undefined>(undefined);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
const readOnly = Boolean(sourceService);
```

`hasChanges` compares `formData` against `savedFormData ?? initialFormData`, and `useUnsavedChanges(hasChanges)` guards navigation.

- [ ] **Step 4: Load the record**

In a `useEffect` keyed on `id`, with an ignore flag flipped in the cleanup so a slow response for an abandoned id cannot overwrite state:

```tsx
const job = await cronjobService.getById(id);
setFormData({ /* map every field, job_config defaulting to {} */ });
setSavedFormData(/* the same object */);
setDocVersion(job.doc_version);          // undefined stays undefined — never default it to 1
setSourceService(job.source_service);
```

- [ ] **Step 5: Render the four sections**

1. **Basics** — name, description, `job_type` `Select` (`disabled={!isNew || readOnly}`), `is_active` `Switch`. Changing `job_type` on a new job resets `job_config` to `{}` in the same setState — a config left over from a previous type is invalid for the new one.
2. **Schedule** — `<CronScheduleField>`.
3. **Execution** — `max_retries` and `timeout_seconds` numeric `Input`s in a `grid gap-4 lg:grid-cols-2`.
4. **Type-specific** — `<JobConfigFields job_type={formData.job_type!} value={formData.job_config} onChange={(job_config) => setFormData(p => ({ ...p, job_config }))} readOnly={readOnly} fieldErrors={fieldErrors} />`

Above section 1, when `readOnly`, render a banner naming `sourceService` and explaining where the job can be changed. The page is not hidden: reading the config of a misbehaving schedule is the main reason someone opens it.

Header is `<PageHeader title={...} backTo="/cronjobs" />`. Below section 4, `<AuditMeta>` fed from the loaded record. Save and Cancel live in the `.unsaved-bar`.

- [ ] **Step 6: Write the save handler with the correct catch order**

```tsx
const handleSave = async () => {
  if (!describeCron(formData.cron_expression)) {
    setFieldErrors((p) => ({ ...p, cron_expression: t('cronjob.validation.invalidCron') }));
    return;
  }
  setSaving(true);
  try {
    if (isNew) {
      const created = await cronjobService.create(formData);
      toast.success(t('cronjob.toast.created'));
      navigate(`/cronjobs/${created.id}/edit`, { replace: true });
    } else {
      // ส่ง doc_version เฉพาะเมื่อ GET คืนมา — ไม่ส่ง = gateway ข้ามการตรวจ
      const { job_type: _unused, ...rest } = formData;
      await cronjobService.update(id!, {
        ...rest,
        ...(docVersion !== undefined && { doc_version: docVersion }),
      });
      toast.success(t('cronjob.toast.saved'));
      await load();
    }
  } catch (err) {
    // ลำดับสำคัญ: 409 ที่นี่มีสองความหมาย แยกด้วย error_code ไม่ใช่ status
    if (isNotFoundError(err)) { setNotFound(true); return; }
    const detail = err as {
      response?: { status?: number; data?: { error_code?: string; source_service?: string } };
    };
    if (detail.response?.status === 409 && detail.response.data?.error_code === 'FOREIGN_OWNED_JOB') {
      toast.error(t('cronjob.error.foreignOwned', { service: detail.response.data.source_service ?? '' }));
      return;
    }
    if (isVersionConflict(err)) { notifyVersionConflict(); await load(); return; }
    const { message, fields } = parseApiError(err);
    if (fields) setFieldErrors(fields);
    toast.error(message);
  } finally {
    setSaving(false);
  }
};
```

The `FOREIGN_OWNED_JOB` branch sits **above** `isVersionConflict` on purpose. Open `src/utils/docVersion.ts` and check what `isVersionConflict` matches on: if it matches HTTP 409 alone it would otherwise swallow the ownership refusal and tell the user "someone else changed this" — untrue, and it invites them to refetch and retry forever. Keep a comment on that ordering so nobody tidies it away.

- [ ] **Step 7: Wire the keyboard shortcuts and the debug Sheet**

`useGlobalShortcuts({ onSave: handleSave, onCancel: () => navigate('/cronjobs') })`, and a debug Sheet wrapped in `process.env.NODE_ENV === 'development'` with tabs for `formData`, `savedFormData`, and `{ docVersion, sourceService, fieldErrors }`.

- [ ] **Step 8: Add the page's i18n keys to both locale files, then type-check and lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/cronjobs src/i18n
git commit -m "feat(cronjob): หน้าสร้าง/แก้ไข cronjob

job ของ service อื่นเปิดดูได้แบบ read-only พร้อมป้ายบอกเจ้าของ
409 แยกสองความหมายด้วย error_code ไม่ใช่ status code

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 9: `CronJobManagement` — the list page

**Files:**
- Create: `src/pages/cronjobs/CronJobManagement.tsx`
- Create: `src/pages/cronjobs/CronJobFilterSheet.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts`

**Interfaces:**
- Consumes: `cronjobService`, `describeCron`
- Produces: the default-exported `CronJobManagement` component that Task 10 routes to

- [ ] **Step 1: Read the reference page**

```bash
sed -n '1,140p' src/pages/DatabasePoolManagement.tsx
```

This is a server-side list (the gateway paginates), so search **is** debounced — unlike the client-filtered pages, where it must not be.

- [ ] **Step 2: Write the fetch effect**

```tsx
const [items, setItems] = useState<CronJob[]>([]);
const [total, setTotal] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [page, setPage] = useState(1);
const [perpage, setPerpage] = useState(() => Number(localStorage.getItem('perpage_cronjob')) || 10);
const [search, setSearch] = useState('');
const debouncedSearch = useDebouncedValue(search, 300);   // server-side list — debounce is required here
const [sort, setSort] = useState('name:asc');
const [filter, setFilter] = useState<Record<string, string>>({});
const [activeJobs, setActiveJobs] = useState<number | null>(null);

useEffect(() => {
  localStorage.setItem('perpage_cronjob', String(perpage));
}, [perpage]);

const load = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await cronjobService.getAll({ page, perpage, search: debouncedSearch, sort, filter });
    return res;
  } catch (err) {
    setError(getErrorDetail(err));
    return null;
  } finally {
    setLoading(false);
  }
}, [page, perpage, debouncedSearch, sort, filter]);

useEffect(() => {
  let ignore = false;   // a slow response for an abandoned query must not overwrite newer state
  void (async () => {
    const res = await load();
    if (ignore || !res) return;
    setItems(res.data ?? []);
    setTotal(res.paginate?.total ?? 0);
  })();
  return () => { ignore = true; };
}, [load]);

// scheduler's in-memory count — deliberately separate from the DB count, since a
// disagreement between the two is itself the signal that the scheduler is stuck
useEffect(() => {
  let ignore = false;
  void cronjobService.getStatus()
    .then((s) => { if (!ignore) setActiveJobs(s.active_jobs); })
    .catch(() => { if (!ignore) setActiveJobs(null); });
  return () => { ignore = true; };
}, []);
```

- [ ] **Step 3: Define the columns in a `useMemo`**

Deps: everything the cells close over — `t`, `locale`, `canManage`, and the row action callbacks. Do not add a `#` column; `DataTable` adds its own.

```tsx
const canManage = hasPermission('cronjob.manage');
const columns = useMemo<ColumnDef<CronJob>[]>(() => [
  {
    accessorKey: 'name',
    header: t('cronjob.column.name'),
    enableSorting: true,
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        {row.original.description && (
          <div className="text-xs text-muted-foreground">{row.original.description}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'job_type',
    header: t('cronjob.column.type'),
    enableSorting: true,
    cell: ({ row }) => <Badge variant="secondary">{t(`cronjob.type.${row.original.job_type}` as TKey)}</Badge>,
  },
  {
    accessorKey: 'cron_expression',
    header: t('cronjob.column.schedule'),
    cell: ({ row }) => (
      <div>
        <code className="text-[10px] sm:text-xs font-mono">{row.original.cron_expression}</code>
        <div className="text-xs text-muted-foreground">
          {describeCron(row.original.cron_expression, locale === 'th' ? 'th' : 'en') ?? '—'}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'is_active',
    header: t('cronjob.column.status'),
    enableSorting: true,
    cell: ({ row }) => row.original.is_active
      ? <Badge variant="success">{t('cronjob.status.running')}</Badge>
      : <Badge variant="secondary">{t('cronjob.status.stopped')}</Badge>,
  },
  {
    id: 'owner',
    accessorFn: (r) => r.source_service ?? '',
    header: t('cronjob.column.owner'),
    cell: ({ row }) => row.original.source_service
      ? <Badge variant="outline">{row.original.source_service}</Badge>
      : <span className="text-xs text-muted-foreground">{t('cronjob.owner.platform')}</span>,
  },
  // last_run_at, next_run_at, run_count and the actions column follow the same shape
], [t, locale, canManage, handleStart, handleStop, handleExecute, handleDelete]);
```

Any column with `enableSorting: true` needs a real `accessorKey` or an `accessorFn` — a sortable column with neither sorts nothing and fails silently.

`last_run_at` renders relative time plus a warning icon carrying `last_error` on hover when that field is set.

- [ ] **Step 4: Build the actions column and its handlers**

```tsx
const refresh = useCallback(async () => {
  const res = await load();
  if (!res) return;
  setItems(res.data ?? []);
  setTotal(res.paginate?.total ?? 0);
}, [load]);

const handleStart = useCallback(async (job: CronJob) => {
  try {
    await cronjobService.start(job.id);
    toast.success(t('cronjob.toast.started'));
    await refresh();
  } catch (err) { toast.error(getErrorDetail(err)); }
}, [refresh, t]);

// handleStop is the same shape with cronjobService.stop and 'cronjob.toast.stopped'

const handleExecute = useCallback(async (job: CronJob) => {
  try {
    await cronjobService.execute(job.id);
    // info, NOT success: POST /execute returns the moment the job is handed to a
    // goroutine. We do not know the outcome yet, and "succeeded" would be a claim
    // the operator acts on.
    toast.info(t('cronjob.toast.dispatched'));
  } catch (err) { toast.error(getErrorDetail(err)); }
}, [t]);

const handleDelete = useCallback(async (job: CronJob) => {
  await cronjobService.remove(job.id);   // ConfirmDialog awaits this and shows the spinner
  toast.success(t('cronjob.toast.deleted'));
  await refresh();
}, [refresh, t]);
```

The column itself:

```tsx
{
  id: 'actions',
  header: '',
  cell: ({ row }) => {
    const job = row.original;
    const foreign = Boolean(job.source_service);
    if (!canManage) return null;
    return (
      <div className="flex items-center gap-3">
        {job.is_active
          ? <Button variant="ghost" size="icon" onClick={() => handleStop(job)} title={t('cronjob.action.stop')}><Pause className="h-5 w-5" /></Button>
          : <Button variant="ghost" size="icon" onClick={() => handleStart(job)} title={t('cronjob.action.start')}><Play className="h-5 w-5" /></Button>}
        <Button variant="ghost" size="icon" onClick={() => handleExecute(job)} title={t('cronjob.action.runNow')}>
          <Zap className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" disabled={foreign}
                title={foreign ? t('cronjob.action.foreignOwnedTooltip', { service: job.source_service ?? '' }) : t('common.edit')}
                onClick={() => navigate(`/cronjobs/${job.id}/edit`)}>
          <Pencil className="h-5 w-5" />
        </Button>
        <ConfirmDialog
          title={t('cronjob.confirm.deleteTitle')}
          description={t('cronjob.confirm.deleteBody', { name: job.name })}
          onConfirm={() => handleDelete(job)}
          trigger={
            <Button variant="ghost" size="icon" disabled={foreign}
                    title={foreign ? t('cronjob.action.foreignOwnedTooltip', { service: job.source_service ?? '' }) : t('common.delete')}>
              <Trash2 className="h-5 w-5" />
            </Button>
          }
        />
      </div>
    );
  },
}
```

Check `<ConfirmDialog>`'s real prop names before writing this (`sed -n '1,40p' src/components/ui/confirm-dialog.tsx`); `trigger` above is the intent, not a guarantee. Start / Stop / Run now stay enabled on foreign-owned jobs — those are ops actions, reversible and visible.

- [ ] **Step 5: Add the summary band**

Six figures: total (from `paginate.total`, page-independent) · running · stopped · with a last error · owned by another service (these four computed from the rows currently loaded, so label them as covering this page — a count that silently means "this page only" while looking page-independent misreports) · and `activeJobs` from `getStatus()`, labelled as the scheduler's own count. Render `activeJobs === null` as an explicit "unavailable", never as `0`.

- [ ] **Step 6: Write `CronJobFilterSheet.tsx`**

Three `Select`s — `job_type`, status, owner — plus Apply and Clear, setting the `filter` object the service forwards. No `advance` grammar; that was ruled out in the design.

- [ ] **Step 7: Add search, CSV export, empty and error states**

- Debounced search box wired to `search`
- CSV export via `generateCSV` + `downloadCSV` over the currently loaded rows, columns matching the table
- `<TableSkeleton columns={8} rows={5} />` only while `loading && items.length === 0`
- `<EmptyState icon={Clock} title=… description=… />` with a create action when the list is genuinely empty
- `<FetchErrorState onRetry={load} />` when the request failed
- `useGlobalShortcuts({ onSearch: focusSearch })` for `Ctrl/⌘+K`
- `meta.card` hints so each row renders as one card below `lg`
- a dev debug Sheet wrapped in `process.env.NODE_ENV === 'development'`, with tabs for the raw `items`, the current `{ page, perpage, search, sort, filter }`, and `{ total, activeJobs }`

- [ ] **Step 8: Add i18n keys, type-check and lint**

```bash
bun run typecheck && bun run lint
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/cronjobs src/i18n
git commit -m "feat(cronjob): หน้ารายการ cronjob

run-now แจ้งเป็น toast.info ไม่ใช่ success — ยังไม่รู้ผลตอนตอบกลับ

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 10: Routes, navigation group and feature flag

**Files:**
- Modify: `src/App.tsx` (imports and three routes)
- Modify: `src/components/nav/platformNav.ts`
- Modify: `src/constants/featureFlags.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/th.ts` (`nav.cronjobs`, `navGroup.scheduling`)

**Interfaces:**
- Consumes: `CronJobManagement` and `CronJobEdit` from Tasks 8 and 9
- Produces: the reachable routes `/cronjobs`, `/cronjobs/new`, `/cronjobs/:id/edit`

- [ ] **Step 1: Add the three routes**

In `src/App.tsx`, beside the other platform routes, mirroring the database-pools block at `src/App.tsx:505-527`:

```tsx
<Route
  path="/cronjobs"
  element={
    <PrivateRoute requiredPermission="cronjob.read" feature="cronjobs">
      <CronJobManagement />
    </PrivateRoute>
  }
/>
<Route
  path="/cronjobs/new"
  element={
    <PrivateRoute requiredPermission="cronjob.read" feature="cronjobs">
      <CronJobEdit />
    </PrivateRoute>
  }
/>
<Route
  path="/cronjobs/:id/edit"
  element={
    <PrivateRoute requiredPermission="cronjob.read" feature="cronjobs">
      <CronJobEdit />
    </PrivateRoute>
  }
/>
```

All three gate on `.read`; `.manage` gates the buttons inside, matching how Database Pools does it.

- [ ] **Step 2: Add the nav entry as its own group**

In `src/components/nav/platformNav.ts`, add `Clock` to the lucide import, then insert **between the Analytics rows and the Platform rows**:

```ts
  // Scheduling — งานตามเวลา ไม่ใช่การตั้งค่าระบบ จึงเป็นกลุ่มของตัวเอง
  // Sidebar จัดกลุ่มจากแถวที่ groupKey ซ้ำกันติดกัน แถวนี้ต้องไม่ถูกคั่น
  { path: '/cronjobs', labelKey: 'nav.cronjobs', icon: Clock, permission: 'cronjob.read', groupKey: 'navGroup.scheduling', feature: 'cronjobs' },
```

The Database group must remain last in the array.

- [ ] **Step 3: Add the feature flag**

In `src/constants/featureFlags.ts`:

```ts
  { key: 'cronjobs', labelKey: 'nav.cronjobs', groupKey: 'navGroup.scheduling', defaultState: 'active' },
```

- [ ] **Step 4: Add `nav.cronjobs` and `navGroup.scheduling` to both locale files**

English: `Scheduled Jobs` / `Scheduling`. Thai: `งานตามเวลา` / `งานตามเวลา`.

- [ ] **Step 5: Type-check and lint**

```bash
bun run typecheck && bun run lint
```

Expected: clean. A key missing from one locale file surfaces here as a `TKey` error.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/nav/platformNav.ts src/constants/featureFlags.ts src/i18n
git commit -m "feat(cronjob): เส้นทาง เมนู และ feature flag

Claude-Session: https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa"
```

---

### Task 11: Verification and pull request

**Files:** none modified — this task produces evidence, not code

- [ ] **Step 1: Run every static check**

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

`bun run test` runs the existing Vitest suite; this plan adds no tests, but the suite must stay green.

- [ ] **Step 2: Start the dev server against DEV**

```bash
bun run dev:dev
```

Only one dev server can run at a time — every mode uses port 3304.

- [ ] **Step 3: Create one job of each of the six types**

For each of `report`, `notification`, `cleanup`, `dashboard_refresh`, `activity_rollup`, `activity_retention`: create it, save, reload the page, and confirm every field round-tripped. Record which types passed.

- [ ] **Step 4: Exercise start, stop and run-now**

On a platform-owned job: stop it and confirm the badge flips; start it again; hit Run now and confirm the toast reads *dispatched*, not *saved* or *success*.

- [ ] **Step 5: Prove the ownership rule holds at the API**

Open a `micro-report`-owned row and confirm the form is read-only and the banner names the owner. Then, separately, send a direct PATCH:

```bash
curl -s -X PATCH "$API/api-system/platform/cronjobs/$FOREIGN_ID" \
  -H "Authorization: Bearer $TOKEN" -H "x-app-id: $APPID" \
  -H 'Content-Type: application/json' -d '{"name":"bypass attempt"}' | python3 -m json.tool
```

Expected: 409 `FOREIGN_OWNED_JOB`. A disabled button proves nothing about the rule — the rule lives in the gateway.

- [ ] **Step 6: Force a version conflict and check which message appears**

Open the same platform-owned job in two tabs, save in tab A, then save in tab B. Expected: the *version conflict* message and an automatic refetch — **not** the foreign-owner message. Getting the other one means the catch order in Task 8 Step 6 is wrong.

- [ ] **Step 7: Prove the scheduler does not invalidate an open form**

Create a job on a `* * * * *` schedule, open its edit page, wait through at least two scheduler ticks (about two minutes — confirm `run_count` advanced in another tab), then change the name and save.

Expected: the save succeeds. A version conflict here means `UpdateLastRun` is bumping `docVersion` and Task 2 Step 4 was not honoured. This is the one regression that cannot be caught quickly, which is why it has its own step.

- [ ] **Step 8: Check both pages at 390px**

Use the iframe viewport probe rather than resizing the window, and confirm by reading `innerWidth`, not by eyeballing a screenshot. Confirm the list renders one card per row and no action button is clipped.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin feature/cronjob-management
gh pr create --base main --title "feat(cronjob): หน้าจัดการงานตามเวลา" --body-file /dev/stdin <<'EOF'
หน้า `/cronjobs` จัดการงานตามเวลาใน `"CRONJOBS"."Cronjob"` แบบ CRUD เต็ม
พร้อมปุ่ม start / stop / run-now

- job ที่ service อื่นเป็นเจ้าของ (เช่น schedule รายงานของ micro-report)
  เปิดดูและคุมได้ แต่แก้/ลบไม่ได้ — บังคับที่ gateway ไม่ใช่แค่ปุ่มที่ถูกปิด
- ฟอร์มจริงครบทั้ง 6 job_type
- 409 มีสองความหมาย แยกด้วย `error_code` (`VERSION_CONFLICT` / `FOREIGN_OWNED_JOB`)
  ไม่ใช่ด้วย status code
- dependency ใหม่ 2 ตัว: `cronstrue`, `cron-parser` (~15KB gzipped)

ขั้นที่ 4 จาก 4 — ต้อง deploy หลัง backend-gateway
Spec: `docs/superpowers/specs/2026-09-02-cronjob-management-design.md`

https://claude.ai/code/session_01LCjHfhSVUtss2iJD3uKoVa
EOF
gh pr merge --auto --squash
```

- [ ] **Step 10: Report what was verified and what was not**

State plainly which of the six job types were created successfully, whether the direct-PATCH refusal returned 409, and whether the two-tick save succeeded. If any step was skipped, say which and why — do not describe the feature as verified on the strength of the steps that did run.

---

## Notes for whoever executes this

**Do not reorder the phases.** Phase 3 against a gateway that has not shipped gives a page that 404s everywhere, and Phase 2 against a catalog that has not been seeded gives 403 for every user including super-admins — which looks exactly like a broken guard and burns an afternoon.

**The three things most likely to go wrong,** in order:

1. **The catch order in Task 8 Step 6.** Two 409s, one status code. Check what `isVersionConflict` matches on before you write the branch.
2. **`UpdateLastRun` bumping `docVersion`.** It will not show up in any quick test — only in Task 11 Step 7.
3. **The app-api catalog.** Nine new guard names; forget to regenerate and the PR is red for a reason the error message does not make obvious.
