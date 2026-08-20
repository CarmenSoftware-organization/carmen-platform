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
<Route path="/x" element={<PrivateRoute requiredPermission="role.read"><X /></PrivateRoute>} />
// Super-admin-only:
<Route path="/x" element={<PrivateRoute requireSuperAdmin><X /></PrivateRoute>} />
```

After create: `navigate(\`/items/\${created.id}/edit\`, { replace: true })` — there is no bare `/items/:id` route, only `/items`, `/items/new`, and `/items/:id/edit`; navigating to the bare form falls through the catch-all to the 404 page.

`PrivateRoute` is one of **three** guards (`AuthedRoute` and `ClusterAdminRoute` are not interchangeable with it), and a denied check renders `<Forbidden />` in place rather than redirecting. Guard choice, `hasPermission` scoping (`clusterId` changes the question), and the unresolved-≠-denied rule: **`agent-os/standards/permissions/`**.

## Report Template Edit Specifics

`src/pages/ReportTemplateEdit.tsx` uses a different layout from other Edit pages: sticky left column (Info + BU Scope + Metadata) + tabbed right column (Dialog XML / Content XML / Preview) + sticky bottom action bar (offset matches sidebar: `md:left-16 lg:left-60`). Wrap page in `pb-20` so the bar doesn't overlap content. Use `<div hidden={...}>` for tab panels containing CodeMirror so editors stay mounted.

XML utils in `src/utils/xml.ts`: `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes`, `downloadText`. Prefer `XmlEditor`/`DialogPreview` over raw util calls.

## Configuration Page Pattern

Some pages are **config pages, not Management pages**, and intentionally deviate from rule 13 — when the data set has a fixed, small size (e.g. bounded by an enum), a DataTable + pagination + CSV export is the wrong tool. Use cards instead.

Examples that still exist:
- `src/pages/ReportFormGroupManagement.tsx` — one card per report group.
- `src/pages/EmailSettingManagement.tsx` — one card per email sender purpose (capped at 3, ever). The page holds `editingPurpose` so only one card is editable at a time; each card owns its own form state and calls the service directly.

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

- **Read** (`ApplicationResponseDto`): `{ id, name, description, is_active, allow_all, api_names: string[] }`. There is **no `app_id` field** — the record `id` (UUID) *is* the `x-app-id` value; surface it as "App ID".
- **Write** (create/update): `{ name, description, is_active, allow_all, details: { add: [{ api_name }] } }`. Map the form's flat `api_names: string[]` → `details.add[]`; **skip `details` when `allow_all` is true**. Update uses **replace semantics** (send the full desired set).
- **Catalog (grouped by module):** `GET /api-system/applications/api-catalog` returns `{ api_names: string[], groups: { module, api_names }[] }` (not a bare array; may be inside the `{ data }` envelope — endpoint is one of the few that returns a **bare object, no `{ data }` wrapper**, but the service unwraps tolerantly either way). `applicationService.getApiCatalog()` returns `{ groups, api_names }`: it uses backend `groups` when present + valid (per-element runtime guard `isApiCatalogGroup`), otherwise **derives them client-side** via `groupApiNames(api_names)` — so the UI renders grouped regardless of backend deploy order. The **module is the prefix before the first `.`** in each api_name (`cluster.create` → `cluster`); dotless names become their own group. Both backend (generator) and frontend (`moduleOf`) use the identical split rule, so the fallback equals server data exactly.
  - **Grouping helpers:** `src/utils/apiCatalog.ts` — `moduleOf(name)`, `actionOf(name)` (text after first `.`), `groupApiNames(names): ApiCatalogGroup[]` (modules sorted, entries sorted). Type `ApiCatalogGroup { module; api_names }` lives in `src/types/index.ts`.
  - **Backend source of truth:** the catalog is auto-generated in `carmen-turborepo-backend-v2` — `scripts/generate-app-api-catalog/run.ts` scans `AppIdGuard('module.action')` calls and emits both `APP_API_CATALOG` (flat) and `APP_API_CATALOG_GROUPS`; never hand-edit `app-api-catalog.generated.ts`, regenerate with `bun run scripts/generate-app-api-catalog/run.ts`. New endpoint guards automatically appear after regeneration + DEV deploy.
- **Edit-page selector UI:** a **collapsible accordion grouped by module** — filter box (matches module name OR api_name; matches auto-expand), per-module `selected/total` badge + **All/None** toggle, expand/collapse-all (scoped to currently-visible groups), buttons labelled action-only (`actionOf`) with the full api_name as `title`. Read-only view groups selected api_names under module subheaders. Falls back to `<ChipInput>` if the catalog fetch fails (`catalogFailed`).
- `allow_all` hides the api_name selector entirely. Page is `platform_admin`-only (route + nav `roles`).
