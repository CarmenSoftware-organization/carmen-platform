# Tenant seed fleet page — design

**Date:** 2026-09-28 · **Status:** approved by owner (brainstorm) · **Repos:** `carmen-platform` (FE only)

## Goal

One page that shows, for every business unit, whether its tenant DB already holds the default
seed data — and lets a super admin seed whatever is missing, one BU at a time or the whole fleet.

Success: after **Check all**, the table says per BU "fully seeded", "missing N rows (which sets)",
"no DB", or "error", and the numbers match what `TenantSeedCard` shows on that BU's Edit page.

## Starting point (2026-09-28)

- Seeding is per-BU only. `TenantSeedCard` (`src/components/TenantSeedCard.tsx`) on BU Edit calls
  `tenantSeedService.getStatus(buId)` → `TenantSeedStatus { sets: SeedSetStatus[], all_seeded }`
  and `tenantSeedService.deployStream(buId, onEvent, keys?)` (NDJSON). Earlier specs for that card:
  `2026-07-14-tenant-seed-data-card-design.md`, `2026-07-27-tenant-seed-sets-ui-and-url-encode-design.md`.
- Backend exposes only `GET /api-system/tenant/seeds/:bu_id/status` and
  `POST /api-system/tenant/seeds/:bu_id/deploy/stream` — no fleet endpoint.
- `/tenant-migrations` (`TenantMigrationManagement.tsx`) is the closest existing page: loads all BUs
  (`businessUnitService.getAll({ perpage: 1000, sort: 'code:asc' })`), fans status out with
  `mapWithConcurrency(bus, 4, …)`, per-row Apply, abort-on-unmount via an `AbortController` ref.
  This page mirrors that shape.

## Decisions made with the owner

1. **Scope:** check **and** seed — per-row Seed plus "Seed all missing".
2. **Placement:** a new page `/tenant-seeds`, not a tab or column on `/tenant-migrations`.
3. **Approach A — FE-only fan-out** over the two existing per-BU endpoints. A backend fleet
   endpoint (approach B) is deferred until BU count makes client fan-out too slow; the UI does not
   need to change if it is added later.

## Backend facts this design relies on (verified in `carmen-turborepo-backend-v2`)

- `TenantSeedsController` is guarded by `TenantMigrationGuard`: **both** endpoints need a
  super-admin bearer (or deploy token) and `TENANT_MIGRATION_API_ENABLED`; otherwise 403.
  So **every action on this page is super-admin-only**, including Check.
- Pre-stream errors map to HTTP status: 404 BU not found, 422 no/unsupported DB connection,
  400 bad `bu_id`, else 500.
- On client disconnect the gateway unsubscribes the RPC stream (`res.on('close')`). Whether
  micro-business finishes the in-flight set is **not verified** — acceptable because seeding is
  idempotent (summary reports `created` + `skipped`; re-running only fills gaps).
- Feature-flag keys are free-form on the backend (`FeatureFlagsConfigSchema` in micro-cluster is
  `z.record(/^[a-z][a-z0-9_]*$/, enum)`), so a new FE key needs no backend change.

## Page

**Route / nav / flag**
- `App.tsx`: lazy `TenantSeedManagement`, `path="/tenant-seeds"`, wrapped in
  `<PrivateRoute requiredPermission="cluster.read" feature="tenant_seeds">` (same as migrations).
- `platformNav.ts`: new item directly under `/tenant-migrations` in `navGroup.organization`,
  `labelKey: 'nav.tenantSeeds'`, icon from `lucide-react` (already a dependency, e.g. `Sprout`).
- `featureFlags.ts`: `{ key: 'tenant_seeds', labelKey: 'nav.tenantSeeds', groupKey: 'navGroup.organization', defaultState: 'active' }`
  placed right after `tenant_migrations`.

**Layout** — client-filtered Management page (Rule 13: one fetch, in-memory filter, no debounce)
- `<PageHeader>` title/subtitle.
- Summary band: counts of **Seeded · Missing · No DB · Error · Not checked**, plus buttons
  **Check all** and **Seed all missing** (the latter behind `<ConfirmDialog>` stating how many BUs
  and rows will be seeded).
- While Seed all runs: progress line "BU i/n — `<bu_code>` — `<set key>` (done/total)".
- Search input (`Ctrl/⌘+K` via `useGlobalShortcuts`) filtering by BU code/name in memory.
- `DataTable` columns (defs in `useMemo`, no `#` column):
  - **Business unit** — code + name, links to BU Edit.
  - **Status** — `<Badge>`: *Not checked* (secondary) · *Seeded* (success) · *Missing N* (warning)
    · *No DB* (secondary) · *Error* (destructive, tooltip = `errorMsg`) · spinner while checking/seeding.
  - **Sets** — compact `key present/defined` for sets with `missing.length > 0`; "—" when seeded
    or unchecked.
  - **Last checked** — `HH:MM:SS`.
  - **Actions** — icon buttons Check, Seed (Seed enabled only when checked and missing > 0).
- CSV export (`generateCSV` + `downloadCSV`): code, name, status, missing count, per-set summary,
  last checked, error.
- Dev debug Sheet (`process.env.NODE_ENV === 'development'`): raw BU list response and the last
  status response per BU.
- Loading: `TableSkeleton` only when `loading && bus.length === 0`; `EmptyState` when no BUs.

**Row state** (page-local)

```ts
type SeedRowStatus = 'unknown' | 'seeded' | 'missing' | 'no_db' | 'error';
interface SeedRowState {
  status?: TenantSeedStatus;
  checking: boolean;
  seeding: boolean;
  progress?: { done: number; total: number; current: string | null };
  lastChecked?: string;
  errorMsg?: string;
}
```

`no_db` is derived from the BU record (`!(bu.database_pool_id && bu.db_schema)`) — the same test
`BusinessUnitEdit` passes to `TenantSeedCard` as `hasDbConnection`. No-DB BUs are **never** sent to
the API and are excluded from Check all and Seed all. If the list response lacks either field,
treat the BU as having a DB and let the backend's 422 land as an Error row (verify during
implementation which fields `getAll` returns).

## Behaviour

**Check one / Check all**
- Check all: `mapWithConcurrency(checkable, 4, tenantSeedService.getStatus, onSettled)`; each result
  lands on its own row. No per-row toast; one summary toast at the end — `toast.success` when all
  succeeded, `toast.warning` "Checked X · Y failed" otherwise.
- Check one uses `handleSeedError` (same wording as `TenantSeedCard`) plus stores
  `getErrorDetail(err, t)` on the row.

**Seed one**
- `deployStream(bu.id, onEvent, keysWithMissing, signal)`; `start`/`seeding` events update the row
  progress. On success re-run Check for that row — displayed counts always come from the server,
  never computed from `created/skipped`. Toast `success` (created > 0) or `info` (nothing created).

**Seed all missing**
- Targets = checked rows with status `missing`, in table order. Runs **sequentially**
  (concurrency 1) to keep load off shared DB pools.
- Each BU sends only its own sets with `missing.length > 0` as `keys`.
- A failure on one BU records the error on that row and **continues** to the next.
- End toast: `success` "Seeded X BUs", `warning` "Seeded X · Y failed", or `info` when targets
  were empty.

**Permissions** — `disabledReason = !isSuperAdmin ? t('pages.tenantSeed.superAdminRequired') : null`
disables Check, Check all, Seed, Seed all with a tooltip. `checkOne`, `checkAll`, `seedOne`,
`seedAll` also early-return when `!isSuperAdmin` (fail closed). Non-super-admins see the BU list only.

**Concurrency & teardown**
- `activeStreamControllersRef: Map<string, AbortController>` (bu.id → controller) plus a
  `cancelledRef` checked before each Seed-all step. Unmount aborts every controller and sets
  `cancelledRef`. An aborted stream exits silently (no toast, no state update).
- The map doubles as the re-entry guard: a second Seed for a BU already streaming is ignored.
- While Check all or Seed all runs, all row actions and both bulk buttons are disabled.

## Service change

`tenantSeedService.deployStream` gains an optional trailing `signal?: AbortSignal`, passed to
`fetch`. The existing caller (`TenantSeedCard`) is unchanged. Add a doc-comment note that aborting
only stops the browser listening; the gateway unsubscribes, and re-running is safe because seeding
is idempotent.

## i18n

New namespace `pages.tenantSeed.*` in `src/i18n/en.ts` and `src/i18n/th.ts`
(`Translations = typeof en` makes tsc catch a missing Thai key) plus `nav.tenantSeeds`. Covers
title, subtitle, summary labels, status badges, buttons, confirm dialog, toasts, tooltips, CSV headers.

## Files

| File | Change |
|---|---|
| `src/pages/TenantSeedManagement.tsx` | new page |
| `src/services/tenantSeedService.ts` | optional `signal` on `deployStream` |
| `src/App.tsx` | lazy route |
| `src/components/nav/platformNav.ts` | nav item |
| `src/constants/featureFlags.ts` | `tenant_seeds` flag |
| `src/i18n/en.ts`, `src/i18n/th.ts` | new keys |

No backend change. No new dependency. No change to `src/components/ui/`.

## Verification

Per the owner's standing preference, no new test files. Required:

- `bun run typecheck`, `bun run lint`, `bun run test` (existing suite) all clean.
- Manual browser check against DEV as super admin:
  1. Check all → a sample BU's numbers match its `TenantSeedCard`.
  2. No-DB BUs show *No DB* and fire no request (network tab).
  3. Seed one on a BU **the owner picks** → row flips to *Seeded*.
  4. Navigating away mid-seed → no console error, no stray state update.
  5. Non-super-admin → list visible, every action disabled with tooltip.
  6. 390px width → layout usable.
- **Seed all on DEV writes real rows into every missing tenant DB — ask the owner before running it.**

## Out of scope

- Backend fleet endpoints (approach B).
- Choosing individual sets per BU from this page (use BU Edit's `TenantSeedCard` for that).
- Cancel button for a running seed.
