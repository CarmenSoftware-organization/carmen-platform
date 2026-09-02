# Cronjob Management — Design

**Date:** 2026-09-02
**Repos touched:** `micro-cronjobs` (Go) · `carmen-turborepo-backend-v2` (gateway + seed) · `carmen-platform` (frontend)

---

## Deploy order — five steps, must not be reordered

```
1. micro-cronjobs      — migration "docVersion" + API accepts created_by_id / updated_by_id / doc_version
2. seed permission     — cronjob.read / cronjob.manage into the platform permission catalog
3. backend-gateway     — platform_cronjobs module
4. grant api names     — the nine cronjob.* entries to the carmen-platform application
5. carmen-platform     — the new pages
```

Step 2 cannot precede step 1's deploy but **must** precede step 3: `PlatformPermissionGuard` denies
everyone when the permission row is missing, so a gateway that ships first is a gateway nobody can
call. Step 5 before step 3 gives a page that 404s end to end.

**Step 4 was missing from the first version of this document, and it fails closed and silently.**
Every route carries an `AppIdGuard` naming one of nine api names (`cronjob.findAll`,
`cronjob.status`, `cronjob.findOne`, `cronjob.create`, `cronjob.update`, `cronjob.delete`,
`cronjob.start`, `cronjob.stop`, `cronjob.execute`). Regenerating `app-api-catalog.generated.ts`
makes those names *selectable* — it does not *grant* them. `AppIdGuard` consults the application's
own allowlist, so on any environment where the `carmen-platform` application row does not carry
`allow_all = true`, every request returns 401 "This application id (x-app-id) is not found or not
allowed to access this api" and the whole page is dead. DEV has `allow_all = true`; **UAT uses a
different application id and does not**, so this step is the one that decides whether the feature
works there.

**Warning:** pushing a branch that carries a migration applies it on DEV within ~2 minutes without a
merge. This has caught the team twice. Do not push step 1's branch until its content is final.

---

## Goal

A platform page at `/cronjobs` for full CRUD over the scheduled jobs in `"CRONJOBS"."Cronjob"`,
plus the operational controls (start / stop / run now) the service already exposes.

`micro-cronjobs` (Go + Gin, port 6016) owns the table and already exposes a complete REST API. It has
**no authentication of any kind**, so the browser must never reach it directly. Everything goes through
`backend-gateway`, which already holds `CRONJOB_SERVICE_URL` for the report-schedule flow.

## Non-goals

- The `by-source/*` endpoints. They are a service-to-service channel, not something a screen drives.
- The full `advance` filter grammar used by News / Cluster. The filter Sheet gets three fixed selects.
- Changing `GET /api/cronjobs`'s contract in Go. `micro-report` reads the same endpoint.

---

## Decisions taken, with the reasoning

| Decision | Why |
|---|---|
| Full CRUD, not read-only | The user's call. Drives everything below. |
| Reach the service through a new gateway module | `micro-cronjobs` has no auth. A direct call from the browser would need CORS opened and the service exposed to the internet, and any visitor could delete a job. |
| Jobs owned by another service are visible and controllable but not editable | `micro-report` writes each BU's report schedules into this same table. Editing or deleting one from here would break a BU's reports with the BU never learning why. Start / stop / run-now stay available — those are ops actions, reversible and visible. |
| Real typed forms for all six `job_type`s | The user's call, over a raw-JSON fallback for the two complex ones. |
| Gate with a new RBAC resource `cronjob.read` / `cronjob.manage` | Separates who may look from who may act. Costs a catalog seed and the four-step deploy above. |
| Pagination performed in the gateway | The user asked for pagination; the Go endpoint has none and its contract is shared with `micro-report`. |
| Add `docVersion` and audit columns to the Go service | The user's call. Brings this page in line with rule 17 and gives `<AuditMeta>` something to render. |

---

## 1. `micro-cronjobs` — Go changes

### Migration

Created with `make migrate-create` (it stamps the timestamp), giving
`migrations/<YYYYMMDDhhmmss>_add_doc_version.{up,down}.sql`:

```sql
ALTER TABLE "CRONJOBS"."Cronjob" ADD COLUMN "docVersion" INT NOT NULL DEFAULT 1;
```

Additive, so existing rows — including every `micro-report` schedule — get `1` and keep working.

### Model

`internal/model/cronjob.go` gains:

```go
DocVersion int `gorm:"column:docVersion;default:1" json:"doc_version"`
```

`CreatedByID` and `UpdatedByID` already exist on the struct; only the handler needs to start populating them.

### Repository

`Update` becomes an optimistic update:

```
WHERE "id" = ? AND "docVersion" = ?    SET ..., "docVersion" = "docVersion" + 1
```

`RowsAffected == 0` returns a new sentinel `ErrVersionConflict`.

**`UpdateLastRun` must not touch `docVersion`.** It is already a separate method; this design pins that
separation down as a rule with a comment in the source. The scheduler writes `lastRunAt`, `nextRunAt`,
`runCount`, `lastError` and `retryCount` on every tick — if those bumped the version, a user with the
edit form open would have their Save rejected roughly once a minute, and the page would fail in a way
that reads as a random bug rather than a lock. **`docVersion` counts human edits, never machine
bookkeeping.**

### Handler

`create` and `update` accept three more optional body fields: `created_by_id`, `updated_by_id`,
`doc_version`. `ErrVersionConflict` maps to **HTTP 409** with `error_code: "VERSION_CONFLICT"`.

**`doc_version` is optional on the wire.** `micro-report` creates and deletes schedules through this
same API and knows nothing about versions; requiring it would break every BU's report scheduling the
moment step 1 deploys. Absent means skip the check — matching this repo's own rule ("send it on update
only when the GET returned one"). Locking is therefore opt-in: the new page always sends it, existing
callers need no change.

---

## 2. `backend-gateway` — `platform_cronjobs` module

`apps/backend-gateway/src/platform/platform_cronjobs/` — controller, service, module, `swagger/`,
shaped after `platform_database-pools`.

### Endpoints

All under `/api-system/platform/cronjobs`, all behind `@UseGuards(PlatformPermissionGuard)`:

| Method | Path | Permission |
|---|---|---|
| GET | `/` | `cronjob.read` |
| GET | `/status` | `cronjob.read` |
| GET | `/:id` | `cronjob.read` |
| POST | `/` | `cronjob.manage` |
| PATCH | `/:id` | `cronjob.manage` |
| DELETE | `/:id` | `cronjob.manage` |
| POST | `/:id/start` | `cronjob.manage` |
| POST | `/:id/stop` | `cronjob.manage` |
| POST | `/:id/execute` | `cronjob.manage` |

### Pagination

The gateway fetches the whole list from `micro-cronjobs`, then filters, sorts and slices in memory,
returning this repo's standard envelope:

```json
{ "data": [ /* CronJob */ ], "paginate": { "total": 0, "page": 1, "perpage": 10, "pages": 0 } }
```

Query parameters, as emitted by the frontend's `buildQuery`:

- `page` / `perpage`
- `search` + `searchfields` over `name`, `description`, `job_type`, `cron_expression`, `source_service`
  — **wire keys are always lowercase**; reading a camelCase key silently drops the search term
- `sort` over `name`, `job_type`, `is_active`, `last_run_at`, `next_run_at`, `run_count`, `created_at`
- `filter` — exact match on `job_type`, `is_active`, `source_service`

**Known cost:** every list request pulls the entire table into the gateway once. The table is tens to
hundreds of rows today, so this is acceptable. A comment in the service marks this as the place to add
a cache or push pagination down into Go when it grows.

### Ownership enforcement

`PATCH` and `DELETE` read the row first. A non-empty `source_service` returns **409 with
`error_code: "FOREIGN_OWNED_JOB"`** — deliberately distinct from `VERSION_CONFLICT` — naming the
owning service in the message. `start`, `stop` and
`execute` pass through.

This lives in the gateway, not the UI. A disabled button is a hint; this is the rule.

### Audit stamping

The gateway reads the caller from the JWT and forwards it as `created_by_id` / `updated_by_id`.

---

## 3. Permission catalog seed

`packages/prisma-shared-schema-platform/prisma/seed.platform-permission.data.ts`:

```ts
{ resource: "cronjob", action: "read",   description: "View scheduled jobs, their schedules, and run history" },
{ resource: "cronjob", action: "manage", description: "Create, edit and delete scheduled jobs, and start, stop or run them on demand" },
```

Nothing on the frontend hardcodes the catalog — `PermissionCatalog` reads it from the backend, so the
two rows appear in role editing on their own once seeded.

---

## 4. `carmen-platform` — frontend

### Types (`src/types/index.ts`)

- `CronJob` mirroring the Go JSON (snake_case: `job_type`, `cron_expression`, `job_config`,
  `source_service`, `last_run_at`, `run_count`, `doc_version`, …)
- `CronJobType = 'report' | 'notification' | 'cleanup' | 'dashboard_refresh' | 'activity_rollup' | 'activity_retention'`
- Six config interfaces as a union discriminated by the row's `job_type`
- `CronJobsResponse = { data: CronJob[]; paginate?: PaginateInfo }`

New fields are optional (`?`) per rule 11.

### Service (`src/services/cronjobService.ts`)

Shaped after `databasePoolService`. `getAll(paginate)` uses `buildQuery` with
`defaultSearchFields = ['name','description','job_type','source_service']`. Plus `getById`, `create`,
`update`, `remove`, `start`, `stop`, `execute`, `getStatus`. All go through `api` (inheriting token
refresh and `x-app-id`) and unwrap `res.data.data ?? res.data`.

### Routing, nav, feature flag

Three routes in `src/App.tsx`, all gated `requiredPermission="cronjob.read"` `feature="cronjobs"`:

```
/cronjobs             → CronJobManagement
/cronjobs/new         → CronJobEdit
/cronjobs/:id/edit    → CronJobEdit
```

`src/components/nav/platformNav.ts` gets a **new group `navGroup.scheduling`**, placed after the
Analytics group and before Platform. Cronjobs are time-driven work, not system configuration. The
Database group must remain last, and the file's contiguity rule applies: the new group is one
uninterrupted run of rows or the sidebar draws its heading twice.

`src/constants/featureFlags.ts`:
`{ key: 'cronjobs', labelKey: 'nav.cronjobs', groupKey: 'navGroup.scheduling', defaultState: 'active' }`

### i18n

`src/i18n/en.ts` and `th.ts` gain `nav.cronjobs`, `navGroup.scheduling`, and a `cronjob.*` namespace:
headings, column labels, status badges, the six job-type names, validation messages, the delete
confirmation, and **both** 409 messages — version conflict and foreign ownership.

### New dependencies

`cronstrue` and `cron-parser` (~15KB gzipped combined, no transitive dependencies). `cronstrue`
renders a cron expression as a sentence and ships Thai; `cron-parser` computes upcoming run times.
Hand-rolling this is easy to get subtly wrong (`*/n`, ranges, lists, DST) and hard to debug later.
Approved by the user.

---

## 5. Screens

### 5.1 `CronJobManagement` — the list

A **server-side list** per rule 13, since the gateway paginates: `DataTable serverSide`, debounced
search, filter Sheet, CSV export, summary band, dev debug Sheet, `Ctrl/⌘+K`, `perpage_cronjob` persisted
in localStorage.

| Column | Content |
|---|---|
| Name | `name`, with `description` beneath |
| Type | Badge for the `job_type` |
| Schedule | `cron_expression` in mono, human sentence beneath |
| Status | `<Badge variant="success">` running / `<Badge variant="secondary">` stopped |
| Owner | empty = Platform; otherwise a chip naming the service |
| Last run | relative time, plus a warning icon carrying `last_error` on hover |
| Next run | `next_run_at` |
| Runs | `run_count` |

Summary band: total · running · stopped · with a last error · owned by another service.

Filter Sheet: `job_type`, status, owner.

Row actions, all behind `cronjob.manage`:

- **Start / Stop** — mirrors `is_active`; available on every row including foreign ones
- **Run now** — `POST /execute` returns immediately and the job runs in the background, so this reports
  `toast.info` ("dispatched"), never `toast.success`. We do not know the outcome yet.
- **Edit / Delete** — disabled with an explanatory tooltip when `source_service` is set; delete uses
  `<ConfirmDialog>`

Below `lg`, one card per row via `meta.card` hints.

### 5.2 `CronJobEdit` — create and edit

Rule 14 in full: `PageHeader backTo`, `useUnsavedChanges`, `Ctrl/⌘+S`, `Escape`, `validateField` on
blur, dev debug Sheet. Rule 17 in full: `docVersion` in its own state, sent only when present, 409 →
`notifyVersionConflict()` + refetch. Save and Cancel live in the bottom `.unsaved-bar`, not in
`PageHeader actions`.

Opening a row owned by another service renders the whole form **read-only** behind a banner naming the
owner and pointing at where it can be changed. The page is not hidden: reading the config of a
misbehaving schedule is the main reason someone opens it.

**Sections**

1. **Basics** — name, description, job type, active toggle.
   `job_type` is **locked when editing an existing row**: changing it turns the stored `job_config`
   into garbage. Changing type means creating a new job.
2. **Schedule** — the five cron fields, the rendered sentence, and the next three run times.
3. **Execution** — `max_retries`, `timeout_seconds`.
4. **Type-specific configuration** — switched on `job_type`:

| Type | Fields |
|---|---|
| `report` | template (from `reportTemplateService`) · BUs (`<BusinessUnitMultiSelect>`) · format · filters (key/value pairs) · recipients (`<ChipInput>`) · delivery · notifications (web / email / mail_source) |
| `notification` | title · message · type · category · user_ids (from `userService`) |
| `cleanup` | action · type · older_than |
| `dashboard_refresh` | bu_codes (empty = every BU) · tier |
| `activity_rollup` | days_back |
| `activity_retention` | retention_days · batch_size |

`<AuditMeta>` sits at the foot — the consumer of the `createdByID` / `updatedByID` work in step 1.

---

## 6. Error handling

Per rule 12, and **order matters here**, because this page has two distinct meanings for 409:

```
isNotFoundError(err)                      → not-found state
isVersionConflict(err)                    → notifyVersionConflict() + refetch
409 that is NOT a version conflict        → toast.error, naming the owning service
everything else                           → parseApiError(err) → setFieldErrors(fields)
```

This is the easiest thing on the whole feature to get wrong. A version check that matches on status
code alone will swallow the ownership refusal and tell the user "someone else changed this" — untrue,
and it invites them to refetch and retry forever. The two must be told apart by `error_code`, which is
why the gateway sets distinct ones.

Loading states follow rule 16's table: `TableSkeleton` only while `loading && items.length === 0`,
overlay on page/filter changes, `<EmptyState>` when genuinely empty, `<FetchErrorState>` when the
request fails.

---

## 7. Verification

Per the user's standing working preference, **no test files are written during execution** of this
design. Static checks still run, and manual verification replaces them.

**Static:** `bun run typecheck` and `bun run lint` in `carmen-platform`; the nine backend-v2 audit
gates in the gateway (including `app-api-catalog`, the one most often forgotten); `make lint` and
`go build` in `micro-cronjobs`.

**Manual, in the browser:**

1. Create a job of each of the six types; confirm each round-trips through save and reload
2. Start, stop and run-now on a platform-owned job
3. Open a `micro-report`-owned row and confirm the form is read-only —
   **and confirm it with a direct `curl PATCH`, not only by observing the disabled button.**
   The rule lives in the gateway; a UI-only check proves nothing about it.
4. Force a version conflict with two tabs on the same job, and confirm the message says *version
   conflict*, not *foreign owner*
5. Leave a job running through at least two scheduler ticks with the edit form open, then save —
   this is the `UpdateLastRun` regression, and it only shows up over time
6. Check the list and edit pages at 390px using the iframe viewport probe

---

## Open decision — the `cleanup` job type

`micro-cronjobs/internal/executor/cleanup.go` is a stub: it logs a line, returns `nil`, and carries
a `// TODO: implement cleanup logic per type`. Nothing anywhere enumerates what its `action` and
`type` values may contain.

So the `cleanup` form is a typed form over an undefined vocabulary attached to a worker that does
nothing — and `cleanup` is the **default** `job_type` on the new-job form, which makes it the one a
distracted operator is most likely to save. Such a job reports success on every tick, forever.

Two ways out, and the choice is the reader's, not this document's:
- implement the Go executor, and define the `action` / `type` vocabulary, or
- drop `cleanup` from the job-type list until it exists, and change the form's default

Until one of those happens, the spec's claim of "real typed forms for all six `job_type`s" holds for
five.

## Known limitations

- The gateway loads the whole table on every list request. Fine at current scale; marked in the source.
- Optimistic locking is opt-in on the wire. A caller that omits `doc_version` still overwrites blindly —
  deliberate, so `micro-report` keeps working.
- No `advance` filter grammar. Three fixed selects instead.
- `run_count`, `last_run_at` and friends are eventually consistent with the scheduler; the list shows a
  snapshot, not a live feed.
