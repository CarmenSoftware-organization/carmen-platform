# Grouped (by-module) API Names selector — Design

**Date:** 2026-06-10
**Status:** Approved, pending implementation plan
**Repos touched:** `carmen-platform` (frontend) + `carmen-turborepo-backend-v2` (backend)

## Problem

The Application Edit page (`/applications/:id/edit`) lets an admin pick which
`api_name` values an application is allowed to call. The picker is a single flat
list of toggle buttons fed by `GET /api-system/applications/api-catalog`, which
returns a flat `string[]`. There are **765 api_names across 120 modules**, so the
flat list is an unscannable wall of buttons.

Every `api_name` follows a `module.action` convention (e.g. `cluster.create`,
`activityLog.findAll`); the prefix before the first `.` is the module. We want to
group the catalog by module and present it as a collapsible accordion, with the
grouping computed on the backend (authoritative) and gracefully derivable on the
frontend.

## Decisions (from brainstorming)

- **Grouping source:** backend + generator (most thorough). The catalog generator
  emits grouped data; the controller returns it. Frontend can also derive the same
  grouping from the flat list as a fallback.
- **Module rule:** `module = name.split('.')[0]`. A name with no dot becomes its own
  single-entry group (full string as the module). Same rule on both sides, so
  results are identical regardless of which side computes them.
- **UI:** collapsible accordion, collapsed by default, with per-module
  `[selected/total]` badge, per-module "All" toggle, a filter box, and a global
  total + expand/collapse-all control.
- **Read-only view:** selected api_names grouped under module subheaders.
- **No new libraries.** No change to `allow_all` behavior or the `catalogFailed`
  ChipInput fallback.

## Part 1 — Backend generator

**File:** `carmen-turborepo-backend-v2/scripts/generate-app-api-catalog/run.ts`

The script already walks the gateway source, collects `AppIdGuard('module.action')`
names into a `Set`, and writes a sorted flat array. Add a second derivation and a
second export:

1. After computing `sorted` (flat, alphabetical — unchanged), build a grouped
   structure: reduce `sorted` into a map `module → api_names[]` where
   `module = name.includes('.') ? name.split('.')[0] : name`. Produce an array of
   `{ module, api_names }` sorted by `module`, with each group's `api_names` kept in
   the already-sorted order.
2. Emit **both** exports into `app-api-catalog.generated.ts`:
   - `APP_API_CATALOG: readonly string[]` — unchanged, kept for back-compat.
   - `APP_API_CATALOG_GROUPS: readonly { module: string; api_names: readonly string[] }[]` — new.
3. Update the console log to report module count alongside the entry count.

The generated file's header comment (regenerate instructions) stays the same.

## Part 2 — Backend controller

**File:** `carmen-turborepo-backend-v2/apps/backend-gateway/src/platform/applications/applications.controller.ts`

- Import `APP_API_CATALOG_GROUPS` alongside `APP_API_CATALOG`.
- `getApiCatalog` returns `{ api_names: APP_API_CATALOG, groups: APP_API_CATALOG_GROUPS }`.
  Keeping `api_names` preserves the existing response contract for any other consumer.
- Extend the `@ApiResponse` schema to document the new `groups` property
  (array of objects with `module: string` and `api_names: string[]`, with an example).

No service/DB changes — this endpoint is static data only.

## Part 3 — Frontend service + types

**Files:** `carmen-platform/src/types/index.ts`, `carmen-platform/src/services/applicationService.ts`

- Add to `types/index.ts`:
  ```ts
  export interface ApiCatalogGroup {
    module: string;
    api_names: string[];
  }
  ```
- `applicationService.getApiCatalog()` return type becomes
  `Promise<{ groups: ApiCatalogGroup[]; api_names: string[] }>`.
- Parsing (tolerant, in this order):
  1. Unwrap the `{ data }` envelope as today (`response.data?.data ?? response.data`).
  2. Read `api_names` (array; tolerate a bare `string[]` body as before → `api_names`).
  3. If the body has a `groups` array, use it (validate each item has `module` +
     `api_names[]`).
  4. **Else derive groups from `api_names`** by splitting on the first `.`
     (dotless → own group), sorted by module. This is the deploy-order safety net:
     the frontend renders grouped even before the backend redeploy lands, because the
     split rule is identical to the generator's.
- Always return a non-null `api_names` (flat, for the "N selected" total and any other
  use) and `groups`.

## Part 4 — Frontend UI

**File:** `carmen-platform/src/pages/ApplicationEdit.tsx`

State changes:
- Replace `catalog: string[]` with `catalogGroups: ApiCatalogGroup[]` (keep a derived
  flat list, or store both — flat is still needed for the total count and to know all
  selectable names). `catalogFailed`, `apiSearch` unchanged.
- Add `expandedModules: Set<string>` (or `Record<string, boolean>`) for accordion state.

Editing view (when `!formData.allow_all` and `!catalogFailed`), replacing the current
flat button cloud:
- **Filter box** (existing search input, kept): the query matches a group if the
  **module name** matches OR any of its `api_names` match. Non-matching groups are
  hidden; within a matching group only matching api_names render. While a non-empty
  filter is active, matching groups are **auto-expanded**.
- **Header row:** total `N selected` (count of `formData.api_names`) + an
  **Expand all / Collapse all** toggle button.
- **Per module row:** chevron (▸/▾) to expand/collapse, module name, a
  `[selected/total]` count badge, and an **All** button that selects every api_name in
  the module (flips to deselect-all when all are already selected).
- **Expanded group:** the module's api_names as toggle buttons (reusing the existing
  selected/outline styling and the `X` on selected). Button label shows the
  **action only** (text after the first `.`); the `title` attribute and the stored
  value remain the full `api_name`.
- Default state: all groups **collapsed** (120 modules).

Handlers:
- Reuse `toggleApiName(api)` unchanged.
- Add `toggleModule(module)` — expand/collapse accordion row.
- Add `selectAllInModule(module)` / deselect — adds or removes that module's full
  api_name set from `formData.api_names`.

Read-only view (not editing):
- Group the selected `formData.api_names` by module (same split rule) and render each
  module as a small subheader with its selected api_names as `<Badge variant="outline">`.
- `-` placeholder when none selected.

Unchanged:
- `allow_all` still hides the entire selector.
- `catalogFailed` still falls back to `<ChipInput>`.
- The `N selected` footer line.
- Debug Sheet, validation, save/cancel, keyboard shortcuts.

## Edge cases

- **Dotless api_name:** becomes its own single-entry module (both sides). Consistent.
- **Backend not yet redeployed:** response has only `api_names` → frontend derives
  groups itself. No visible difference.
- **Filter with no matches:** show the existing "No API names matching …" message.
- **Selected api_name no longer in catalog** (renamed/removed guard): it still lives in
  `formData.api_names` and renders in the read-only grouped view; in edit mode it
  simply won't appear as a toggle. (Pre-existing behavior; not regressed.)

## Out of scope

- Changing how `api_name`s are guarded or named in the backend.
- Persisting expand/collapse state across sessions.
- Any change to create/update write semantics (`details.add[]` mapping is untouched).

## Build sequence

1. Backend generator → regenerate `app-api-catalog.generated.ts`.
2. Backend controller + OpenAPI schema.
3. Frontend types + service (with client-side fallback).
4. Frontend UI accordion (edit + read-only views).
5. Verify against running app at `/applications/:id/edit`.
