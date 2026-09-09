# Sortable column headers on every table — design

**Date:** 2026-09-09 · **Status:** approved by owner (brainstorm) · **Repos:** `carmen-platform` (FE), `carmen-turborepo-backend-v2` (BE)

## Goal

Every data column on every table in the admin app sorts when its header is clicked. Columns that
carry no orderable value (actions, checkbox, row index, Deleted, Cron Jobs › Business Unit) stay
inert and look inert.

## Starting point (audit 2026-09-09)

`DataTable` (`src/components/ui/data-table.tsx`) already renders a sort button whenever TanStack's
`getCanSort()` is true, i.e. the column has an accessor **and** `enableSorting !== false`. Twenty
pages use it; most columns already sort. Four edit-page sections render a raw `<Table>` with no
sorting at all. The remaining gaps fall into three buckets:

- **A — FE-only.** Data is already on the page: the four raw tables, Tenant Migration's derived
  columns, server-side columns whose backend already sorts (`is_hq`, broadcast `created_at`)
  and one bug (Cron Jobs › BU is clickable despite a comment saying it must not be).
- **B — needs backend.** Values are aggregates, JSON fields, relation names or date-derived
  states that Prisma `orderBy` cannot reach.
- **C — never sortable.** Actions, select, `#`, Deleted.

Two backend bugs surfaced by the audit: `application.service.ts` and `news.service.ts` place a
hard-coded `orderBy` **after** `...qArgs`, so every `sort` on those endpoints is silently
discarded — the headers that are clickable there today do nothing.

## Decisions made with the owner

| Question | Decision |
|---|---|
| Scope | A + B, both repos |
| License purchase Status (deliberately closed in PR #290, ruling R21) | Move the date rule to the backend as the single definition and open sorting |
| Multi-valued columns | News › Target = Global first, then BU count; News › Tags = tag count; Cron Jobs › BU = not sortable (Go service has no sort/pagination; array with "empty = all") |
| Backend approach | **Hybrid**: Prisma-native where possible, in-memory derived sort only on structurally bounded sets, raw SQL id-page (the `cluster.service.ts` pattern) for unbounded tables. No generic helper in `paginate.query.ts` (three copies, and the where→SQL translator is deliberately per-service and throwing). |

## Part 1 — Frontend

### 1a. `DataTable` pages — column-def changes only

| Page | Column | Change | Sort key sent |
|---|---|---|---|
| Activity Events | User, BU, Element, App | drop `enableSorting:false` | `user_name`, `bu_code`, `element_id`, `app_name` |
| Applications | Access | drop + `accessorFn` | `access` |
| Broadcast | Severity, Created | drop | `severity`, `created_at` |
| News | Target, Tags, Updated | drop + `accessorFn` | `target`, `tags`, `updated_at` |
| Roles | Permissions | drop + `accessorFn` | `permission_count` |
| Users | BU | drop + `accessorFn` (sorts by **total**, not active) | `bu_count` |
| User Platform | Roles/Scope | drop + `accessorFn` (sorts by role count) | `role_count` |
| Cluster-admin BU list | HQ | drop | `is_hq` |
| Licenses seat / bu-quota / interface | Status | drop + `accessorFn` | `status` |
| Tenant Migration (client-side) | Status, Last checked | add `accessorFn` over the already-derived values | local |
| Cron Jobs | Business Unit | **add `enableSorting:false`** (bug fix, matches the comment) | none |

Rules that apply to every row above:

- A display column (`id` + `cell`) must gain an `accessorFn`, otherwise the header never becomes
  a button even with `enableSorting: true` (trap documented in `ClusterManagement.tsx:416`).
- Columns whose backend key is new (bucket B) are opened only **after** the backend is on DEV —
  Prisma answers 500 to an unknown key, and the new backend answers 400.
- Keep the FE `withTiebreaker` (`,id:asc`) on the license tables; add nothing new client-side.

### 1b. Raw `<Table>` sections in edit pages

- Move `src/pages/clusterEdit/tableSort.ts` → `src/utils/tableSort.ts` (same exports:
  `SortState`, `cycleSort`, `sortRows`, `compareValues`). Update the one importer.
- Add `src/components/SortableTableHead.tsx`: `<SortableTableHead sortKey sort onSort className>`
  renders a `<TableHead>` whose content is a button with `ArrowUp` / `ArrowDown` / `ArrowUpDown`
  (same icons and sizes as `DataTable`) so the two table families look identical.
- Apply to:
  - Cluster › Business Units (`clusterEdit/sections/BusinessUnitsSection.tsx`): replace the
    hand-rolled Code/Name buttons; add Status.
  - Cluster › Users (`clusterEdit/sections/UsersSection.tsx`): Name, Role, Status.
  - BU Users card (`businessUnitEdit/BusinessUnitUsersCard.tsx`): Name, Email, Username, BU Role,
    BU Status. The existing fixed `.sort()` stays as the order when no header is active.
  - BU Configuration (`businessUnitEdit/sections/ConfigurationSection.tsx`): Key, Label, Type.
- Cycle is unsorted → asc → desc → unsorted (`cycleSort`); sorting is in memory (`sortRows`).
  These sections are deliberately **not** converted to `DataTable`: they have no pagination or
  `#` column and carry bespoke width lanes and sticky-right layouts.

## Part 2 — Backend (`carmen-turborepo-backend-v2`)

### 2a. Bug fixes first

- `apps/micro-cluster/src/cluster/application/application.service.ts` (~L97-100) and
  `apps/micro-cluster/src/cluster/news/news.service.ts` (~L145-148): stop clobbering the caller's
  `orderBy`. Use the `business-unit-license.service.ts:468-470` shape —
  `q.sort.length === 0 ? <default> : findManyArgs.orderBy`.
- `apps/micro-notification/src/notification/broadcast-admin.service.ts` (~L253-256): add an `id`
  tiebreaker — the only sort path in the repo without one.

### 2b. New sort keys per endpoint

| Endpoint (app) | Key | Technique | Detail |
|---|---|---|---|
| Activity events (micro-business, `activity-event.service.ts`) | `bu_code`, `element_id` | whitelist | add to `SORTABLE`; real columns |
| Activity events | `user_name`, `app_name` | raw JOIN in the existing page query | `LEFT JOIN tb_user` + oldest `tb_user_profile` → `ORDER BY coalesce(firstname‖' '‖lastname, username, email)`; `LEFT JOIN tb_application` → `ORDER BY a.name`. Keep the `id` tiebreaker. |
| Users (micro-cluster, `user.service.ts`) | `bu_count` | Prisma relation `_count` | add to the existing per-key interception loop (~L150-158). Correct because the relation is selected unfiltered, so count = displayed total. First `_count` orderBy in the repo — verify the 66-char relation alias does not break under `relationLoadStrategy: 'query'`. |
| Roles (micro-business, `platform_role.service.ts`) | `permission_count` | in-memory derived sort | bounded set (tens of roles); count grants with `deleted_at: null`, same as the displayed number |
| User Platform (micro-business, `user_platform_role.service.ts`) | `role_count` | in-memory (already the pattern) | add `_count: { _all: true }` to the existing `groupBy`; add to `SORT_KEYS` and the comparator |
| Applications (micro-cluster, `application.service.ts`) | `access` | raw id-page | `ORDER BY allow_all DESC, COUNT(api.*) FILTER (WHERE api.deleted_at IS NULL)` |
| News (micro-cluster, `news.service.ts`) | `target`, `tags` | raw id-page | `target`: `(jsonb_array_length(business_unit_ids) = 0) DESC, jsonb_array_length(business_unit_ids)`; `tags`: `jsonb_array_length(tags)` |
| Broadcast (micro-notification, `broadcast-admin.service.ts`) | `severity` | raw `ORDER BY CASE` in the existing query | `metadata->>'severity'`: CRITICAL 0, WARNING 1, INFO 2, MAINTENANCE 3, NULL last |
| License seat / bu-quota / interface `listPlatform` (micro-cluster) | `status` | raw id-page | `CASE WHEN cancelled_at IS NOT NULL THEN 3 WHEN now < start_date THEN 1 WHEN now > end_date THEN 2 ELSE 0 END` (cancelled branch only where the column exists). One `now` per request. Rank order active → scheduled → expired → cancelled. |

### 2c. Shared rules for every raw id-page (copied from `cluster.service.ts`)

- SQL orders **and** pages in one query, returns ids; hydrate with Prisma; **re-order the hydrated
  rows by the id order SQL returned** (`id: { in }` does not preserve order).
- `NULLS LAST` in both directions; tiebreak on `id`.
- The where→SQL translator supports only the shapes `QueryParams.where()` can produce and
  **throws** on anything else. No silent fallback. One translator per service, not a shared one.
- An unknown sort key answers **400** with the key named — not 500, not a silent fallback.

### 2d. Explicitly out of scope

- Cron Jobs › Business Unit (FE button disabled).
- License `superseded` / `interface_capped` states stay FE-computed and do not participate in
  the status rank. Follow-up if wanted.
- No change to `paginate.query.ts` (any of its three copies).

## Part 3 — Delivery order, errors, verification

### PR order

1. **FE PR 1 — bucket A only** (raw tables, Tenant Migration, HQ, Broadcast Created, Cron BU fix).
   No backend dependency. Merge → auto-deploys DEV.
2. **BE PR** — 2a + 2b. Actions billing is off on the private repo, so gate locally with
   `bun run gates` before merge. Merge → auto-deploys DEV. No migration, so the
   migrate-on-push trap does not apply.
3. **FE PR 2 — bucket B.** Merge **only after** BE is live on DEV.
4. Browser check on DEV, then `git push origin main:vercel`. DEV/UAT branches are synced by the
   owner, never by the agent.

The `fe-license-fixture` gate does not force FE-before-BE here: no license fixture changes.

### Error handling

- BE: unknown key → 400 naming the key.
- FE: a `sort_<entity>` value persisted in `localStorage` may name a key the backend does not know
  during the deploy window → one 400, surfaced by the existing catch-block toast; the user clicks
  another header. Accepted; no extra code.

### Verification

- Static: `bun run typecheck` + `bun run lint` (FE), `bun run gates` (BE). Automated test steps are
  skipped per the owner's plan-execution preference; existing suites must still pass.
- Every raw key gets the three-layer check from the 24 Aug cluster work: psql order vs API order,
  endpoint asc/desc + page 1/page 2 with no duplicates or gaps, then a real header click on
  `http://dev.blueledgers.com:9902` (if `left_click` does not register, use
  `th.querySelector('button').click()`).
- Local-only columns (raw tables, Tenant Migration) are checked in the local browser.
