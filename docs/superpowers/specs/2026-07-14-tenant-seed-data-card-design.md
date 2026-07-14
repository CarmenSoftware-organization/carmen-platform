# Design: Tenant Seed Data card (per-BU seeding on the BU Edit page)

**Date:** 2026-07-14
**Repos:** `carmen-platform` (frontend) + `carmen-turborepo-backend-v2` (backend)
**Status:** Approved (design)

## Goal

Let a super-admin seed a business unit's tenant database with default master
data from the BU Edit page (`/business-units/:id/edit`), the same way schema
migrations are already applied there via `TenantMigrationCard`. Two-step
**Check → Seed**, live streaming progress, per-BU, idempotent.

The first (and initially only) seed set is **running-code** — the 13 default
`tb_config_running_code` rows already defined by the CLI seeder
`packages/prisma-shared-schema-tenant/prisma/seed.running-code.data.ts`
(`running_code_seed`). The design is a registry so more seed sets (currency,
units, categories, …) can be added later without reshaping the UI or API.

## What already exists (mirror it)

- **`tenant_migration`** backend module in `micro-business` — resolves the BU's
  tenant connection via `TenantService.getConnectionString(db_connection)`,
  runs the work, streams NDJSON `ProgressEvent`s. Gateway exposes it under
  `/api-system/tenant/migrations/...` (super-admin only).
- **`tenantMigrationService.ts`** (frontend) — `getStatus`, `deployStream`
  (fetch + NDJSON line reader with bearer + `x-app-id`).
- **`TenantMigrationCard.tsx`** — Check status → pending badges/list → Apply
  (destructive confirm) → progress bar + log → toast → re-check. Disabled with a
  tooltip reason when not super-admin or the BU has no db_connection.
- **`seed.running-code.ts`** CLI — create-if-missing loop over `running_code_seed`
  against a single tenant, keyed on `type`, non-destructive, idempotent.

This feature reuses those exact patterns. It does **not** spawn the prisma CLI
(migrations do) — micro-business already instantiates `PrismaClient_TENANT`
per-BU (see `tenant.service.ts`), which is the cleaner path for row-level seeding
and structured progress.

## Decisions (confirmed)

1. **Interface** — a `TenantSeedCard` on the BU Edit page, placed right after
   `TenantMigrationCard`. No separate list page.
2. **Status model** — two-step, mirroring migrations: Check computes what's
   missing; Seed applies only the missing rows.
3. **Scope** — per-BU only. No cross-BU "Seed all" now (future; migrations have
   both a card and a list page — we mirror only the card).
4. **Seed sets** — registry-based. `running-code` is populated now; architecture
   supports adding more sets later.
5. **Execution model** — approach A: per-BU `PrismaClient_TENANT`, create-if-missing
   per row, each create streamed. Not a CLI spawn.
6. **Card label** — "Tenant Seed Data".
7. **Overwrite policy** — create-if-missing only, keyed per set (running-code keyed
   on `type`). Never updates/deletes existing rows (protects tenant edits).
8. **Auth** — super-admin only, enforced by the backend; UI gated too.

## Architecture

### Seed registry (single source of truth)

A registry describes each seed set independently of transport:

```ts
interface SeedSetDef<Row> {
  key: string;                 // 'running-code'
  label: string;               // 'Running codes'
  rows: readonly Row[];        // the defined default rows
  // per-BU tenant client → count already present + list of missing row keys
  inspect(tenant): Promise<{ present: number; missing: string[] }>;
  // create the missing rows, invoking onRow(index,total,key) per create
  apply(tenant, onRow): Promise<{ created: number; skipped: number }>;
}
```

`running-code`'s rows are the existing `running_code_seed` array. To keep one
source of truth, move that array to an exported module both the CLI seeder and
the backend service import (e.g. keep it in the tenant package and export it, or
lift it into a shared `@repo` module). The CLI seeder keeps working unchanged
against the same data.

`inspect` for running-code: `findMany(tb_config_running_code, { where: { deleted_at: null }, select: { type } })`,
diff the present `type`s against the defined ones → `missing` types, `present` count.
`apply`: for each defined row whose `type` is missing, `create({ data: { type, config, note: 'initialized by system default.' } })`.

### Backend — new `tenant_seed` module (`micro-business`) + gateway controller

Copy the `tenant_migration` module shape:

- `tenant_seed.service.ts`
  - `getStatus(buId)` — resolve BU + tenant connection (reuse `TenantService`),
    open a `PrismaClient_TENANT`, run every registry set's `inspect`, return
    `{ bu_id, bu_code, sets: SeedSetStatus[], all_seeded }` where
    `SeedSetStatus = { key, label, defined, present, missing: string[] }`.
    `all_seeded = every set has missing.length === 0`.
  - `deployStream(buId)` — `Observable<ProgressEvent>` (RxJS, like migrations):
    emit `start{ total }` (total = sum of missing across sets), then for each
    missing row `seeding{ index, total, key, type }`, then `done{ summary:{ created, skipped } }`;
    on failure `error{ message }`. Always `$disconnect()` the tenant client.
  - Reuses `TenantService.getConnectionString`; unsupported/absent connection →
    error event (never a partial seed).
- `tenant_seed.controller.ts` (micro-business message patterns) + gateway
  `tenant-seeds.controller.ts` mirroring `tenant-migrations.controller.ts`,
  super-admin guarded, NDJSON streaming for the deploy endpoint.
- `progress-event.ts` — the seed `ProgressEvent` union (start / seeding / done / error).

Endpoints (gateway):

| Method | Path | Returns |
|--------|------|---------|
| GET  | `/api-system/tenant/seeds/:buId/status` | `TenantSeedStatus` |
| POST | `/api-system/tenant/seeds/:buId/deploy/stream` | NDJSON `ProgressEvent`s |

### Frontend (`carmen-platform`)

- **`services/tenantSeedService.ts`** — copy `tenantMigrationService`'s structure:
  `getStatus(buId)` (GET, unwrap `res.data.data ?? res.data`) and
  `deployStream(buId, onEvent)` (the fetch + NDJSON line reader, bearer +
  `x-app-id`, resolves on terminal `done`, rejects on `error`/pre-stream HTTP).
- **`components/TenantSeedCard.tsx`** — copy `TenantMigrationCard`:
  - Props: `{ buId, buCode, buName, hasDbConnection, isSuperAdmin }`.
  - Check status → per-set badges (`success` when a set is fully seeded,
    `secondary` "N missing" otherwise) + a list of missing row keys.
  - Seed button (behind a `ConfirmDialog`) applies the missing rows, shows the
    progress bar + streamed log, toasts the summary, re-checks.
  - Same `disabledReason` logic (super-admin + hasDbConnection) with the
    tooltip-over-disabled-button wrapper.
  - Icon `Sprout` (fallback `Database`), title **"Tenant Seed Data"**.
- **BU Edit page** — render `<TenantSeedCard …>` immediately after
  `<TenantMigrationCard …>`, guarded by the same `!isNew` + super-admin
  conditions already used for the migration card.
- **`src/types/index.ts`** — `TenantSeedStatus`, `SeedSetStatus`, and the seed
  `ProgressEvent` variants (kept distinct from the migration ones).

## Data flow

1. **Check** → `GET .../seeds/:buId/status` → render per-set status (missing
   counts + list). "Last checked HH:MM:SS".
2. **Seed** → confirm → `POST .../seeds/:buId/deploy/stream` → consume NDJSON:
   `start` sets the total, each `seeding` advances the bar + appends a log line,
   `done` yields the summary → toast `Created N, skipped M` → auto re-check.
3. Idempotent: a second Seed creates nothing; already-seeded sets show as
   fully seeded and the Seed button reports "nothing to seed".

## Error handling

Fail-fast per BU, surfaced through the stream/toast — never a silent partial seed:

- No `db_connection` → Seed/Check disabled with tooltip reason (mirrors the
  migration card).
- BU not found / unsupported provider / tenant connection failure → `error`
  event → toast; card stays usable.
- A per-row `create` failure aborts the run and emits `error` (surfaces
  misconfiguration rather than seeding a partial set).
- Frontend catch uses the existing `handleMigrationError` (or an equivalent) +
  `sonner` toast.

## Idempotency & safety

- Create-if-missing keyed per set (running-code on `type`) — re-runnable, a
  second run is a no-op.
- Non-destructive: never updates or deletes existing rows.
- No hardcoded `id`s — targets keep their own UUIDs.

## Testing

- **Backend** (mirror `tenant_migration` specs): service spec — status counts
  (all present / some missing / none present), `apply` create-vs-skip, per-row
  error aborts the stream; controller spec; deploy-stream spec (event order
  `start → seeding* → done`, `error` on failure).
- **Frontend** (Vitest, co-located): `TenantSeedCard` RTL — Check shows missing
  → Seed streams progress → success toast → re-check clears missing; disabled
  states (non-super-admin, no db_connection). `tenantSeedService` NDJSON parsing
  test (mirror `tenantMigrationService.test.ts`).

## v2 increment — per-set selection (2026-07-14)

The card seeds a **user-selected subset** of seed sets, not always all. Forward
design for when more sets (currency, units, …) are added.

- **Granularity:** per seed-**set** (one checkbox per set). "Seed type" = a set.
- **UI:** after Check, each set with missing rows renders a checkbox (default all
  checked); the Seed button seeds only the checked sets' missing rows and is
  disabled when nothing is selected. Fully-seeded sets show "Seeded" (no checkbox).
- **Transport:** `deployStream` sends `POST { keys: string[] }` (Content-Type
  application/json). Backend `deployStream(bu_id, keys?)` filters `seedSets` to
  `keys` when provided and non-empty; omitted/empty = all sets (backward-compat).
  An unrecognized key simply matches no set (seeds nothing).
- **Summary semantics under selection:** `created` = rows created across the
  selected sets; `skipped` = already-present rows **within the selected sets**
  (`sum(selectedSets.definedKeys) - created`). Unselected sets are not part of
  the run.
- `getStatus` is unchanged — it always returns every set so the UI can render the
  full checkbox list.

### Fixes folded into this increment (from the final whole-branch reviews)
- **BE FIX-NOW:** `tenant_seed.service.disconnect()` wraps `$disconnect()` in
  try/catch so a disconnect failure never masks the real resolve/row error (which
  would break the error-string → HTTP-status contract, returning 500 instead of
  404/422).
- **Test closes:** add a per-row-abort test (BE service, spec-named case that was
  missing) and `seedError.test.ts` (FE, the one uncovered util path).

## Out of scope

- Per-**row** selection (individual running-code types). Selection is per-set.
- Cross-BU "Seed all" (list-page batch). Future.
- Seed sets beyond running-code (registry is ready; adding data is a follow-up).
- Overwrite/reset mode, live pull from a source DB, reconciling the in-app
  `RUNNING_CODE_PRESET` drift (already noted in the running-code seed spec).
