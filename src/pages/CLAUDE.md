# Page conventions (`src/pages/`)

Loaded when working under `src/pages/`. Universal rules, styling tokens, `doc_version`
locking, and the **Rules for AI** list live in the root `CLAUDE.md` — read that too.

## The Two Page Patterns

Every entity has two pages — **always copy the closest existing example**, do not invent layouts.

### Management page (`<Entity>Management.tsx`)
Canonical example: **`src/pages/ClusterManagement.tsx`**

Required structure: header row (title + Export CSV + Add button) → summary band → Card with search (debounced 400ms) + filter Sheet + active-filter badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` (server-side) + loading overlay → dev-only debug Sheet.

Required state shape: `items`, `totalRows`, `loading`, `error`, `summary`/`summaryLoading`/`summaryError`, `searchTerm`, `statusFilter`, `showFilters`, `showDeleted`, `rawResponse`, `copied`, `paginate` (`{ page, perpage, search, sort }`).

Levels, summary-band contract, and the soft-delete toggle: `agent-os/standards/pages/` (`management-page.md`, `summary-band.md`).

### Edit page (`<Entity>Edit.tsx`)
**Three modes, not one** — Toggle (`RoleEdit`, `UserEdit`, `NewsEdit`, `ApplicationEdit`, `ReportTemplateEdit`), Edit-in-place (`ClusterEdit`, `BusinessUnitEdit`), Relationship (`UserPlatformEdit`, no `formData` at all). Pick by counting sections + related tables. Decision rule and per-mode state shape: **`agent-os/standards/pages/edit-page-modes.md`**.

Canonical examples: **`src/pages/RoleEdit.tsx`** (Toggle, simple), **`src/pages/ReportTemplateEdit.tsx`** (tabbed XML + sticky bottom bar), **`src/pages/ClusterEdit.tsx`** (Edit-in-place with scrollspy + inline row editing).

**`src/pages/businessUnitEdit/`** is the reference decomposition — the page file is the orchestrator (form state + load/save + composition); the form is per-section components under `sections/` (sharing a `SectionFieldProps` bundle), the BU-users sub-flow is a `useBusinessUnitUsers` hook + `BusinessUnitUsersCard`, and Branding/Debug are their own cards. **Split when a piece has a name, not at a line count** — 24 pages have a subdirectory, from one file to ten. Naming conventions and the cross-page-reuse rule: `agent-os/standards/pages/decomposition.md`.

Required structure: header (back + title + Edit toggle *in Toggle mode*) → error display → Card sections (form, `lg:grid-cols-2` on existing) → related-data cards → dev-only debug Sheet with tabs.

Required state shape: `id` (from `useParams`), `isNew = !id`, `formData`, `loading`, `saving`, `error`, `notFound`, `fieldErrors`, `rawResponse`, `copied`, `savedFormData`. Toggle mode adds `editing` (new ⇒ true; existing ⇒ false until Edit pressed) and stashes `formData` into `savedFormData` on Edit, restoring on Cancel. Edit-in-place keeps `savedFormData` for the `useUnsavedChanges` diff even without a toggle.

## Filter Advance Query

`paginate.advance` is a JSON string. Single boolean:
```ts
const advance = statusFilter.length === 1
  ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } }) : '';
```
Multiple enums: build a `where` object with `{ in: [...] }`, JSON.stringify only if non-empty.

## Form Field Pattern

Every field must render two modes — edit (Input/Select/checkbox) and read-only (styled div). Reference: `src/pages/ClusterEdit.tsx`.

```tsx
const ReadOnlyText = ({ value }: { value: string }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
    {value || '-'}
  </div>
);
```
Active/inactive ⇒ `<Badge variant={x ? 'success' : 'secondary'}>` (never raw green Tailwind).

## Validation Flow

- `onChange` clears `fieldErrors[name]`
- `onBlur` runs `validateField(name, value)` and sets the error
- Inline display: `<p className="text-xs text-destructive">`
- Input gets `className={fieldErrors[name] ? 'border-destructive' : ''}`
- Pre-submit: re-validate all required fields, abort early if any error

Built-in validators (`utils/validation.ts`): `isValidEmail`, `isValidCode` (2–20 chars `[A-Za-z0-9_-]`), `isValidPhone` (8–20 digits, `+`, spaces, `-`, `()`), `isValidUrl` (http/https only).

`validateField(name, value, options?)` switches on the **field name** and ends in `default: return ''` — an unhandled name validates nothing, silently. Add a `case` rather than validating ad hoc in a page. Required is opt-in: `validateField('name', v, { required: true, label: 'Name' })`; without it an empty value always passes. Handled names and the full flow: `agent-os/standards/errors/validation.md`.

## Debug Sheet

Wrap **everything** in `process.env.NODE_ENV === 'development'`. Fixed amber circular trigger bottom-right; reveals raw API responses (stash in `rawResponse`). Multi-tab variant for Edit pages (track active tab in `debugTab` state). Copy handler:

```ts
const handleCopyJson = (data: unknown) => {
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  setCopied(true); setTimeout(() => setCopied(false), 2000);
};
```

## Loading States Decision Table

| Condition | Render |
|-----------|--------|
| `loading && items.length === 0` | `<TableSkeleton />` |
| `loading && items.length > 0`  | DataTable with absolute loading overlay |
| `!loading && items.length === 0` | `<EmptyState />` with action |
| otherwise | DataTable normally |

## Loading Button Pattern

```tsx
<Button disabled={saving}>
  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
  {saving ? 'Saving...' : 'Save Changes'}
</Button>
```
Always disable async-action buttons during the request. `ConfirmDialog` self-manages its spinner.

## Pagination & Sort

```ts
const handlePaginateChange = ({ page, perpage }) => {
  localStorage.setItem('perpage_<type>', String(perpage));   // persist per-entity
  setPaginate(prev => ({ ...prev, page, perpage }));
};
const handleSortChange = (sort: string) => setPaginate(p => ({ ...p, sort })); // "field:asc|desc"
```
`DataTable` auto-prepends a `#` row-index column — **do not add one yourself**.

## Routes

```tsx
<Route path="/items"          element={<PrivateRoute><ItemManagement /></PrivateRoute>} />
<Route path="/items/new"      element={<PrivateRoute><ItemEdit /></PrivateRoute>} />
<Route path="/items/:id/edit" element={<PrivateRoute><ItemEdit /></PrivateRoute>} />
// Permission-guarded:
<Route path="/x" element={<PrivateRoute requiredPermission="platform_role.read"><X /></PrivateRoute>} />
// Super-admin-only:
<Route path="/x" element={<PrivateRoute requireSuperAdmin><X /></PrivateRoute>} />
```

After create: `navigate(\`/items/\${created.id}/edit\`, { replace: true })` — there is no bare `/items/:id` route, only `/items`, `/items/new`, and `/items/:id/edit`; navigating to the bare form falls through the catch-all to the 404 page.

`PrivateRoute` is one of **three** guards (`AuthedRoute` and `ClusterAdminRoute` are not interchangeable with it), and a denied check renders `<Forbidden />` in place rather than redirecting. Guard choice, `hasPermission` scoping (`clusterId` changes the question), and the unresolved-≠-denied rule: **`agent-os/standards/permissions/`**.

## Report Template Edit Specifics

`src/pages/ReportTemplateEdit.tsx` uses a different layout from other Edit pages: a left panel (one `Card`, three `border-t` sections: Info / BU Scope / Data Source) that scrolls with the page + a **sticky** tabbed right column (Dialog XML / Content XML / Preview, `lg:top-20`, editors sized `calc(100vh - 21rem)`) + sticky bottom action bar (offset matches sidebar: `md:left-16 lg:left-60`). The subtitle is a `SourceLineage` strip (Dialog fields → source → builder key); read mode leaves report group / kind / status to the header badges. Wrap page in `pb-20` so the bar doesn't overlap content. Use `<div hidden={...}>` for tab panels containing CodeMirror so editors stay mounted.

XML utils in `src/utils/xml.ts`: `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes`, `downloadText`. Prefer `XmlEditor`/`DialogPreview` over raw util calls.

## Configuration Page Pattern

Some pages are **config pages, not Management pages**, and intentionally deviate from rule 13 — when the data set has a fixed, small size (e.g. bounded by an enum), a DataTable + pagination + CSV export is the wrong tool. Use cards instead.

Examples that still exist:
- `src/pages/ReportFormGroupManagement.tsx` — one card per report group.
- `src/pages/EmailSettingManagement.tsx` — a routing panel (`emailSettings/RoutingPanel.tsx`) over one card per **named sender profile**. Profiles are free-form rows, not a fixed set of purposes — the old "one card per purpose, capped at 3" shape is gone. The page holds `editingPurpose` so only one card is editable at a time; each card owns its own form state and calls the service directly. The flow→profile mapping is fetched **at the page** (`useEmailRouting`) and derived into destination-side lanes (`emailSettings/routingLanes.ts`), because the panel and every profile card must read one shared answer — a card that says "no flow sends through this profile" while the panel disagrees is what makes an admin delete the wrong profile.

(`PrintTemplateMapping*`, formerly this section's example, was deleted along with the feature on both frontend and backend — don't reference it again.)

## Tenant Data Import (Preconfig Wizard)

`src/pages/TenantImportWizard.tsx` + `src/pages/tenantImport/` — a wizard page, not a
Management page: pick a BU (shared `BuSwitcher`), upload `Preconfig.xlsx`, review the File
check report, then run one step at a time. The workbook is re-attached to every request
(the backend keeps no upload session), and all mapping lives in micro-business
(`preconfig-import/preconfig-catalog.ts`) — the client only sends `step_id` + options.
Progress arrives as NDJSON via `preconfigImportService.importStream`. Gated on
`data_import.manage`. Spec: `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md`.

A committed, data-safe sample workbook lives at `sample_data/Preconfig-mock.xlsx` —
regenerate it with `bun run generate:mock-preconfig` (generator in
`scripts/lib/preconfig-mock/`, spec at
`docs/superpowers/specs/2026-08-04-preconfig-mock-data-design.md`). The real customer
workbook `sample_data/Preconfig.xlsx` is **gitignored and must never be committed**.

## Application Management Specifics

`Application*` pages follow the standard two-page pattern (copied from Cluster), but the
backend read/write models are **asymmetric** — `src/services/applicationService.ts` translates:

- **Read** (`ApplicationResponseDto`): `{ id, name, description, is_active, allow_all, api_names: string[], status, status_message, status_until, status_changed_at, status_changed_by_name }` plus `bypass_users: { user_id, name, email }[]` on `findOne`. There is **no `app_id` field** — the record `id` (UUID) *is* the `x-app-id` value; surface it as "App ID". Read status through `statusOf()` (`src/utils/applicationStatus.ts`) — it falls back to `is_active` on backends that predate status modes. `is_active` and `status` always agree (`is_active === (status !== 'disabled')`); `is_active` will be dropped.
- **Write** (create/update): `{ name, description, allow_all, device, details: { add: [{ api_name }] } }` — **no `is_active`**. Map the form's flat `api_names: string[]` → `details.add[]`; **skip `details` when `allow_all` is true**. Update uses **replace semantics** (send the full desired set).
- **Status and bypass list have their own endpoints**, never the form's Save: `PATCH /api-system/applications/:id/status` `{ status, status_message?, status_until?, doc_version? }` (409 `APP_SELF_LOCK` when `:id` is the caller's own `x-app-id`) and `PUT /api-system/applications/:id/bypass-users` `{ user_ids }`. Both cards live in `src/pages/applicationEdit/` and refetch with `fetchApplication({ keepForm: true })`: no skeleton; out of edit mode the form is re-seeded, in edit mode the form keeps its edits and its `doc_version` advances only if the server's form fields still equal `savedFormData` (else the old version stays, so the form's Save hits the 409 conflict path instead of a lost update). The status card is handed the **record's** `getDocVersion(appRecord)`, not the form's. The form's own Save/conflict refetches with `{ silent: true }` (full re-seed, no skeleton) so the cards stay mounted and keep their drafts; both cards report `onDirtyChange` into `useUnsavedChanges`. Ctrl/⌘+S and Escape act on the form only when focus is in the form, the unsaved bar, or on `body`.
- **Page layout:** hero → **Access definition** zone (API access + Settings rail, the form — Edit → Save) → **Live controls** zone (`ZoneHeading`; each card applies with its own button). Bypass users renders *inside* the Status card (`<ApplicationBypassUsersCard embedded>` as `ApplicationStatusCard` children) because the list only matters for Maintenance/Read-only; it keeps its own Save and dirty state.
- **App secret** (`ApplicationSecretCard`, beside the Status card in the Live controls zone, rendered only when the record has `has_secret` as a boolean — without it Status takes the full row): `POST …/:id/secret/rotate` (generate/rotate, returns plaintext once, bumps `doc_version`), `GET …/:id/secret` (reveal, audit-logged, 404 when none), `PATCH …/:id/secret/enforcement` `{ require_secret, doc_version? }`. Read model adds `require_secret`, `has_secret`, `secret_last4`, `secret_rotated_at`, `secret_rotated_by_name`, `secret_previous_expires_at` — never ciphertext/plaintext. Plaintext lives **only** in the card's state (cleared on Hide, after 30 s, on app change, on unmount; a late response for another app is dropped) — never in `formData`, `appRecord`, `rawResponse` or the debug sheet. The hero shows an outline "Secret required" chip when `require_secret` is true. Error codes `APP_SECRET_MISSING` 400 / `APP_SECRET_SELF_LOCK` 409 (check before `isVersionConflict`) / `APP_SECRET_KEY_UNAVAILABLE` 503 via `secretErrorCode()` (`src/utils/applicationSecret.ts`). Gated by `application.secret.manage` (generate, rotate, switch) and `application.secret.reveal` (reveal, copy); neither → no card.
- **Catalog (grouped by module):** `GET /api-system/applications/api-catalog` returns `{ api_names: string[], groups: { module, api_names }[] }` (not a bare array; may be inside the `{ data }` envelope — endpoint is one of the few that returns a **bare object, no `{ data }` wrapper**, but the service unwraps tolerantly either way). `applicationService.getApiCatalog()` returns `{ groups, api_names }`: it uses backend `groups` when present + valid (per-element runtime guard `isApiCatalogGroup`), otherwise **derives them client-side** via `groupApiNames(api_names)` — so the UI renders grouped regardless of backend deploy order. The **module is the prefix before the first `.`** in each api_name (`cluster.create` → `cluster`); dotless names become their own group. Both backend (generator) and frontend (`moduleOf`) use the identical split rule, so the fallback equals server data exactly.
  - **Grouping helpers:** `src/utils/apiCatalog.ts` — `moduleOf(name)`, `actionOf(name)` (text after first `.`), `groupApiNames(names): ApiCatalogGroup[]` (modules sorted, entries sorted). Type `ApiCatalogGroup { module; api_names }` lives in `src/types/index.ts`.
  - **Backend source of truth:** the catalog is auto-generated in `carmen-turborepo-backend-v2` — `scripts/generate-app-api-catalog/run.ts` scans `AppIdGuard('module.action')` calls and emits both `APP_API_CATALOG` (flat) and `APP_API_CATALOG_GROUPS`; never hand-edit `app-api-catalog.generated.ts`, regenerate with `bun run scripts/generate-app-api-catalog/run.ts`. New endpoint guards automatically appear after regeneration + DEV deploy.
- **Edit-page selector UI:** a **collapsible accordion grouped by module** — filter box (matches module name OR api_name; matches auto-expand), per-module `selected/total` badge + **All/None** toggle, expand/collapse-all (scoped to currently-visible groups), buttons labelled action-only (`actionOf`) with the full api_name as `title`. Read-only view groups selected api_names under module subheaders. Falls back to `<ChipInput>` if the catalog fetch fails (`catalogFailed`).
- `allow_all` hides the api_name selector entirely. Page is `platform_admin`-only (route + nav `roles`).
