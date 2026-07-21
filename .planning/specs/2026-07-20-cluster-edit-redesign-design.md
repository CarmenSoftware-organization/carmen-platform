# Cluster Edit Redesign — Design Spec

- **Date:** 2026-07-20
- **Page:** `/clusters/:id/edit` (`src/pages/ClusterEdit.tsx`)
- **Goal:** Full UX + feature overhaul — clearer navigation of a data-dense page, plus stronger Business Unit / User management.

## Problem

`ClusterEdit.tsx` is 1,079 lines holding 30+ pieces of state in one file. It manages four distinct concerns (identity/licensing, branding, business units, users) as one long single-column scroll with an Edit/read-only toggle. As data grows (more BUs, more users) the page is hard to navigate, the BU/Users tables are read-mostly (no search/filter/sort, no bulk ops, edit only via modal), and the file exceeds the project's ~600-line decomposition guideline.

## Decisions (locked with the user)

1. **Scope:** overhaul both UX and features.
2. **Layout:** sticky left sidenav + scrollspy; long scroll on the right.
3. **Features:** client-side search/filter/sort in tables · inline edit in rows · bulk actions · licensing insight.
4. **Editing model:** edit-in-place (no Edit/read toggle) with a sticky bottom save bar — matching `BusinessUnitEdit`.
5. **Bulk actions:** backend has no batch endpoint → implement as N sequential requests with per-item error collection and a summary toast. (Approved.)

## Non-goals

- No backend changes. No new endpoints. Bulk = client-side fan-out over existing single-record endpoints.
- No change to the create (`isNew`) flow beyond keeping it a single simple form (no BU/Users/Branding sections — there is no `id` yet).
- No change to `clusterService` API surface (reuse `getById`, `update`, `uploadLogo`, `uploadAvatar`, `getClusterUsers`) and the existing `/api-system/user/clusters` endpoints.

## Architecture — decompose into `src/pages/clusterEdit/`

`ClusterEdit.tsx` becomes a thin orchestrator (load/save + composition). New units, each with one clear purpose:

| File | Responsibility | Depends on |
|---|---|---|
| `ClusterEditNav.tsx` | Sticky sidenav (desktop) / horizontal chip bar (mobile); renders section links + count badges; highlights active | `useScrollSpy` |
| `useScrollSpy.ts` | Hook: `IntersectionObserver` over section ids → returns active id; exposes `scrollTo(id)` | — |
| `useClusterUsers.ts` | All cluster-user state + handlers (fetch/add/edit/remove/bulk); mirrors `useBusinessUnitUsers` shape | `api`, `userService`, `clusterService` |
| `sections/DetailsSection.tsx` | Identity + licensing fields via `InlineField` | `InlineField`, capacity utils |
| `sections/BrandingSection.tsx` | Logo + avatar upload | `BrandingImageUpload` |
| `sections/BusinessUnitsSection.tsx` | BU table + `TableToolbar` | `TableToolbar`, `CapacityMeter` |
| `sections/UsersSection.tsx` | Users table + `TableToolbar` + `BulkActionBar` + `InlineCell` | those three |
| `TableToolbar.tsx` | Search input (debounce 400ms) + filter chips + sort state; generic over row type | — |
| `BulkActionBar.tsx` | Floating bar shown when ≥1 row selected: count, clear, action buttons | — |
| `InlineCell.tsx` | Cell-level edit-in-place (select/badge) for a table row | — |

**Reused as-is:** `ClusterHero`, `CapacityGauge`, `CapacityMeter`, `BrandingImageUpload`, `utils/capacity` (`utilization`, `CapLevel`), `PageHeader`, `Can`, `ConfirmDialog`, `DevDebugSheet`, `EmptyState`, `useUnsavedChanges`, `useGlobalShortcuts`, `docVersion` helpers.
**Transformed:** `ClusterIdentityFields` → rendered through `InlineField` inside `DetailsSection` (read + edit collapse into one edit-in-place control).

## Layout & scrollspy

- Two columns on `lg+`: left = `ClusterEditNav` (sticky, `top` offset below any sticky header), right = scrolling content. Below `lg`: nav collapses to a horizontal scrollable chip row pinned at top.
- Each section wrapper: `id={sectionId}` + `scroll-mt-*` so smooth-scroll targets clear the sticky chrome.
- Click nav item → `scrollTo(id)` (`scrollIntoView({ behavior: 'smooth', block: 'start' })`). Scroll → `useScrollSpy` updates the highlighted item.
- Nav labels carry live counts: `Business Units (4)`, `Users (12)`.
- `prefers-reduced-motion`: fall back to instant scroll.

## Editing model

- **No Edit/read toggle.** `DetailsSection` fields are `InlineField`s — click to edit, commit on blur/Enter, revert on Escape. Writes go into `formData`.
- **Sticky bottom save bar** appears only when `hasChanges` (`formData` vs `savedFormData`), reusing the `BusinessUnitEdit` pattern: pulse dot + "Unsaved changes" + Cancel + Save. Offset matches sidebar (`md:left-16 lg:left-60`); page gets `pb-20` so content isn't overlapped.
- **Preserved behaviors:**
  - `doc_version` optimistic locking (rule 17): dedicated `docVersion` state, sent only when present, 409 → `notifyVersionConflict()` + refetch.
  - Not-found gate: bad/deleted id renders the `EmptyState` shell, never the edit shell over blank data.
  - `Can` permission gating at every action (`cluster.update` scoped to `clusterId`, `cluster.create` for BU-add).
  - Dev-only `DevDebugSheet` with cluster/BU/users tabs.
  - `useUnsavedChanges(hasChanges)`, `Ctrl/⌘+S` = submit, `Esc` = cancel active field.
  - `isNew` flow stays a single form (no sidenav/sections).
- Branding, BU, and Users mutations are **independent** of the save bar — they persist immediately via their own endpoints/dialogs, not through cluster `update`.

**Rule-14 deviation:** rule 14 mandates an Edit/read toggle. This page deliberately follows the `BusinessUnitEdit` edit-in-place precedent instead (documented in CLAUDE.md as the pattern for large Edit pages). All other rule-14 requirements (back button, Save/Cancel, debug sheet, `useUnsavedChanges`, `Ctrl+S`, `Esc`, real-time validation on commit) are kept.

## Sections (top → bottom)

1. **Overview** — `ClusterHero` (identity chips + audit + BU/Users capacity gauges).
2. **Details** — `code`, `name`, `alias_name`, `max_license_bu`, `is_active` via `InlineField`; real-time `validateField` on commit; inline error text.
3. **Branding** — `BrandingImageUpload` for logo (rect) + avatar (square); uploads via dedicated endpoints, set returned presigned URL (no refetch, preserves unsaved edits).
4. **Business Units** — `TableToolbar` + table: Code · Name · Users (`CapacityMeter`) · Status · edit-nav. Add button gated by `cluster.create` and disabled at license cap.
5. **Users** — `TableToolbar` + `BulkActionBar` + table: select checkbox · Name (edit trigger) · Email · Parent BU (`InlineCell`) · Role (`InlineCell`) · Status (`InlineCell`) · remove. Add via existing dialog.

## Feature detail

### Search / filter / sort (client-side, both tables)
- Search: debounced 400ms; BU matches code/name; Users match name/email/username.
- Filters (chips, toggle): BU → active/inactive. Users → active/inactive, role, parent BU.
- Sort: click column header cycles asc → desc → none; single active sort column; `localeCompare` for text, numeric for counts.
- All derived with `useMemo` (correct deps). Filtering/sorting never mutates source arrays.

### Inline edit (Users rows via `InlineCell`)
- Editable cells: `role` (select: admin/user), `parent_bu_id` (select of BUs, options disabled at their user cap unless it's the current BU). `is_active` (badge toggle) **only if** `PUT /api-system/user/clusters/:id` accepts `is_active` — the existing dialog edits only `role` + `parent_bu_id`, so support must be confirmed against swagger during implementation; if unsupported, drop the status toggle (and the bulk status action) and keep status read-only.
- Commit → `PUT /api-system/user/clusters/:clusterUserId` with the changed field; optimistic row update, rollback + toast on failure.
- The existing "Edit Cluster User" dialog stays as a fallback for small screens.

### Bulk actions (Users)
- Row checkboxes + header select-all (over the currently filtered set). Selection cleared when filters change.
- `BulkActionBar` actions: **Remove**, **Move to parent BU**, and **Set active / inactive** (conditional on `is_active` being an accepted `PUT` field — see Inline edit note).
- Execution: N sequential requests over existing single-record endpoints; collect per-item outcome; never abort the whole batch on one failure; final summary toast (`"8 updated, 1 failed"`). Destructive bulk (remove) confirmed via `ConfirmDialog`. Move-to-BU respects per-BU cap and reports skips.

### Licensing insight
- Overview gauges via `ClusterHero` (already `CapacityGauge`-backed, colour-coded by `utilization` level).
- Per-BU `CapacityMeter` in the BU table with warn/over colour.
- Add-BU disabled at cluster `max_license_bu`; Add-User BU options disabled at per-BU `max_license_users` — both already present, retained.

## Error handling

- Every catch: `getErrorDetail`/`parseApiError` + `toast.error` (rule 12); field errors via `setFieldErrors` where returned.
- `doc_version` 409 → `notifyVersionConflict()` + `fetchCluster()`.
- Bulk: per-item try/catch, aggregate, summary toast; partial success leaves succeeded items applied.
- Section fetch failure → keep prior data, non-blocking toast (BU/Users are secondary to the cluster record).

## Testing (Vitest, co-located `*.test.tsx`)

- `useScrollSpy` — mock `IntersectionObserver`; active id updates; `scrollTo` calls `scrollIntoView`.
- `TableToolbar` — search filters rows; filter chips narrow; sort cycles + orders.
- `BulkActionBar` — select/clear/count; select-all over filtered set; action fires callback with selected ids.
- `InlineCell` — enters edit, commits changed value, cancels on Escape, no-ops on unchanged.
- `ClusterEdit` page integration — `vi.mock` services + `Can`, real `MemoryRouter`; assert sections render, save bar appears on change, not-found gate, permission gating (extends existing `ClusterEdit.test.tsx`).

## Rollout / verification

- `bun run build` clean (no unused imports/vars after decomposition — rule: FRONTEND build check).
- `bun run test` green.
- Manual: scrollspy on desktop + mobile chip bar; edit-in-place commit + save bar; inline user edits; bulk remove/move/status with a forced failure; license caps at limit; not-found id; dev debug sheet.

## Open risks

- Bulk over many users = many requests; mitigate with sequential execution + progress and a soft cap warning if selection is very large.
- Scrollspy offset must track the mobile chip bar height so smooth-scroll lands correctly.
