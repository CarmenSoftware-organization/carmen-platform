# CLAUDE.md

Guidance for Claude Code working in this repo. Read fully before changing code.

## Project Overview

Frontend-only React + TypeScript admin dashboard for clusters, business units, users, and report templates. Flat enterprise design (glassmorphism removed) with shadcn/ui + Tailwind. Backend (NestJS/Prisma) is a separate service reached via the `/api` and `/api-system` proxies.

Stack, versions, and scripts: read `package.json`. Package manager is **Bun** (preferred); npm works via the checked-in `.npmrc`.

## Commands

`package.json` lists every script. What it does **not** tell you:

- `dev:*` / `build:*` pick the env file by Vite **mode** (`localhost`/`dev`/`uat`/`prod`) — see **Environment** below.
- `dev:prod` and `build:prod` are **placeholders that point at DEV**, not production.
- `build` also stamps `REACT_APP_BUILD_DATE` and emits to `build/` (not `dist/`).
- `build:bump` cuts a release locally and **never pushes** — see **Releases** below.
- `test` is Vitest (jsdom); `test:scripts` is a *separate* `node --test` run over `scripts/lib/*.test.mjs` and is **not** covered by `test`.

`vite-plugin-checker` runs both tsc and `eslint "./src/**/*.{ts,tsx}"` during `start`/`build`; `bun run typecheck` and `bun run lint` run the same two checks standalone, which is how `build:bump` gates a release. Pass `CI=true` to treat warnings as errors.

## Releases

`bun run build:bump` cuts a release **locally** — it never pushes and never fetches. The
guard order, what the script writes, and the **tag-push order** (a squash-merged release PR
strands the tag outside `main`'s history) live in the **`cutting-a-release` skill**
(`.claude/skills/cutting-a-release/SKILL.md`) — read it before cutting or fixing a release.

The version the app displays comes from `src/data/changelog.json` → `versions[0].version`
(`src/components/VersionBadge.tsx`), **not** from `package.json`.

## Environment

Copy `.env.example` → `.env.localhost` (local backend), `.env.dev` (deployed DEV backend), `.env.uat` (UAT backend), and `.env.prod` (production slot — **currently a placeholder pointing at DEV**). All are gitignored. The Vite **mode** selects the file: `vite --mode localhost` → `.env.localhost`; `--mode dev` → `.env.dev`; `--mode uat` → `.env.uat`; `--mode prod` → `.env.prod`. **Every script passes `--mode` explicitly** — Vite's defaults (`development` for `vite`, `production` for `vite build`/`vite preview`) match no file, so a bare `vite` finds no env and `vite.config.ts` throws `[env] Missing …` rather than silently falling back. Vite **throws** on a mode literally named `local` (it conflicts with the `.local` suffix), which is why the local-backend mode is `localhost` — and never create a bare `.env` or `.env.local`: Vite loads both in every mode, so they leak across all four targets and silently satisfy the guard. Every mode uses port `3304`, so only one dev server can run at a time. Variables:

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_BASE_URL` | Backend base URL (axios uses it directly as an absolute `baseURL` — not proxied) |
| `REACT_APP_API_APP_ID`   | Sent as `x-app-id` on every request |
| `REACT_APP_ENV`          | `development` \| `uat` \| `production` |
| `REACT_APP_PORT`         | Dev server / preview port (default `3304` if unset) |

`vite.config.ts` (`server.proxy`) configures `/api` and `/api-system` proxying with `secure: false` (self-signed certs OK) — but `src/services/api.ts` gives axios an absolute `baseURL`, so this proxy never fires; every mode calls the backend directly and depends on backend CORS. `server.port`/`preview.port` read `REACT_APP_PORT` (fallback `3304`).

Backend API docs use **Scalar at `/swagger`** (e.g. `http://localhost:4000/swagger`) — there is **no `/swagger-json`**. The full OpenAPI 3.0 spec is HTML-entity-embedded in that page; extract it by unescaping the HTML and brace-matching from `"openapi":"3.0.0"`. Always confirm endpoint paths/DTO shapes against swagger (this repo has two backends — `/api` and `/api-system`).

## Deployment

Static SPA on GCP: GCS bucket behind Cloud CDN + a global HTTPS load balancer (Terraform in `infra/gcp/`). `.github/workflows/deploy-gcs.yml` builds from source and deploys keyless via Workload Identity Federation (`gcloud storage rsync` + CDN cache invalidation) — its **only** trigger is `workflow_dispatch`, so **nothing deploys automatically**, not even a push to `main`; someone runs it by hand. The other workflow, `.github/workflows/verify.yml`, runs `bun run test` then `bun run build` (ESLint + tsc + Vite) on PRs to `main`/`DEV`/`UAT` and on pushes to every branch *except* those three; a second job repeats the build under `npm ci` to mirror Vercel's install. So a push to `main` triggers nothing at all. Vercel (`vercel.json`) is retained in parallel.

## Unit & Component Tests

Vitest (jsdom) is the in-repo test runner — separate from the Playwright E2E suite. `vitest.config.ts` is **standalone** and must not touch `vite.config.ts`; `vitest.setup.ts` wires RTL's `afterEach(cleanup)` **by hand** because we run **no** `globals` — without it renders accumulate in the shared jsdom doc. `src/vitest.d.ts` exposes the jest-dom matchers to tsc without touching `tsconfig.json`.

- **Location:** co-locate `*.test.ts` / `*.test.tsx` beside the source (e.g. `src/utils/validation.test.ts`).
- **Imports:** explicit — `import { describe, it, expect, vi } from 'vitest'` (no globals).
- **Pure functions:** unit-test directly. Reference: `src/utils/*.test.ts`.
- **Components:** React Testing Library + `@testing-library/user-event`; assert behavior/roles/text (no snapshots). Presentational examples: `src/pages/businessUnitEdit/*.test.tsx`.
- **Page integration:** `vi.mock` the shell (`Layout`, `AuthContext`) + services (and `api`) + `sonner`; keep routing **real** via `MemoryRouter`. **Never mock `Can`** — it *is* the permission logic, so stubbing it makes every permission test pass regardless of permissions. Drive it through a `vi.hoisted` mutable auth object instead. Reference: `src/pages/ClusterEdit.test.tsx`; full rule: `agent-os/standards/testing/mock-boundary.md`.

## E2E Tests

E2E tests live in the standalone sibling repo **`../carmen-platform-e2e`** (Playwright).
See that repo's `CLAUDE.md`. This repo's Vite dev server (`:3304`) is the system under test.

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

## Sidebar Layout

`Layout.tsx` owns sidebar state (persisted to `localStorage('sidebar-collapsed')`); `Sidebar.tsx` renders desktop fixed sidebar (`w-60` / `w-16`) and a mobile Sheet drawer. Main content margin: `md:ml-16` ↔ `md:ml-60`. Transitions via `.sidebar-transition`.

Add a nav item by editing `ALL_PLATFORM_NAV_ITEMS` in **`src/components/nav/platformNav.ts`** (`Layout.tsx` only calls `buildPlatformNav`; the cluster-admin view has its own list in `nav/clusterAdminNav.ts`). Items carry a `group` (`'Organization' | 'Content' | 'Analytics' | 'Platform'`) and gate on either a single `permission` or `superAdminOnly`:
```tsx
{ path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' }
{ path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' }
```
Filtered via `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)` from `AuthContext`. Items with no `group` (e.g. Dashboard) render ungrouped at top. Collapsed state shows icons only, with right-side tooltips (`delayDuration={200}`). **Keep a group's items contiguous in the array** — `Sidebar` groups by consecutive runs, so splitting them renders the heading twice.

Adding a nav item is only one of the three places a gate lives — see `agent-os/standards/permissions/gating-a-page.md`.

## Service Layer

Every service follows the same shape (`src/services/clusterService.ts` is the reference):

```ts
const defaultSearchFields = ['name', 'code'];

const xService = {
  getAll: async (p: PaginateParams = {}) => { /* QueryParams.toQueryString() */ },
  getById: async (id: string) => { /* GET /api-system/x/:id */ },
  create:  async (data) => { /* POST */ },
  update:  async (id, data) => { /* PUT */ },
  delete:  async (id) => { /* DELETE */ },
};
```

- **Base path:** two backends behind one axios instance (absolute `baseURL` — never proxied, see Environment above). `/api-system/...` for the cross-tenant platform registry (clusters, business-units, applications, `platform/*`, report-templates, tenant, `user/clusters`); `/api/...` for tenant/BU-scoped or user-self routes (`auth/*`, `user/profile`, `user/permission/platform`, `news`, `notifications/broadcasts/*`, `config/{buCode}/...`). Both expose a `user/` namespace and they are unrelated — confirm against swagger, never copy the prefix from a neighbouring service file. Full rule: `agent-os/standards/api/base-paths.md`
- **Headers:** `Content-Type: application/json`, `x-app-id` (env), `Authorization: Bearer <token>` (added by interceptor)
- **Response shape:** `{ data: T | T[], paginate?: { total, page, perpage } }` — unwrap with `response.data.data || response.data`

## Filter Advance Query

`paginate.advance` is a JSON string. Single boolean:
```ts
const advance = statusFilter.length === 1
  ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } }) : '';
```
Multiple enums: build a `where` object with `{ in: [...] }`, JSON.stringify only if non-empty.

## Reusable Components — When to Use What

| Need | Component / Hook | Notes |
|------|------------------|-------|
| Confirm a destructive action | `<ConfirmDialog>` (`components/ui/confirm-dialog.tsx`) | **Never** use `window.confirm()`. Async-safe `onConfirm` shows spinner |
| Empty list state | `<EmptyState>` (`components/EmptyState.tsx`) | Required: `icon`, `title`. Include `description` + action button |
| Initial table load | `<TableSkeleton columns rows>` | Use only when `loading && items.length === 0` |
| User feedback | `toast.success/error/info/warning` from `sonner` | **Never** use `alert()`. Wired in `App.tsx`. Levels are semantic: `warning` = partial success (`Deleted 3, 2 failed`), `info` = no-op (`Already up to date`) — see `agent-os/standards/errors/user-feedback.md` |
| Unsaved-change guard | `useUnsavedChanges(hasChanges)` | Compare `formData` vs `savedFormData` (or `initialFormData` if new) |
| Keyboard shortcuts | `useGlobalShortcuts({ onSave, onCancel, onSearch })` | `?` help dialog auto-wired in `Layout` |
| XML editing | `<XmlEditor>` (`components/XmlEditor.tsx`) | CM6 wrapper. Falls back to read-only Copy+Download when `readOnly` |
| Dialog XML preview | `<DialogPreview xml=...>` | Renders `<Label>` + `<Date>`/`<Lookup>` pairs |
| Tag/chip input over CSV string | `<ChipInput>` (`components/ui/chip-input.tsx`) | Pass raw comma-joined string in, get it back out |
| Field-level validation | `validateField(name, value)` (`utils/validation.ts`) | Validates by field-name heuristic; pair with `fieldErrors` state |
| API error parsing | `parseApiError(err)` (`utils/errorParser.ts`) | Returns `{ message, fields? }`. Use in every catch block |
| CSV export | `generateCSV` + `downloadCSV` (`utils/csvExport.ts`) | Required on every Management page |

Writing a **new** hook: where it lives, the race guard every fetching hook needs, `allSettled` over `all`, and the `useDebouncedValue` flush/`onSettle` contract — **`agent-os/standards/hooks/`**.

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

## doc_version Optimistic Locking

Versioned entities carry a numeric `doc_version`; a stale write gets **HTTP 409**. Hold it in its own `useState` (never in `formData`), send it on update only when the GET returned one, and on conflict `notifyVersionConflict()` + refetch. Helpers: `src/utils/docVersion.ts`. Reference page: `ClusterEdit.tsx`.

Wiring rules, pitfalls, and the custom-write-payload list: **`agent-os/standards/api/doc-version-locking.md`**. Full contract: `docs/doc-version-optimistic-locking-spec.md`.

Wired pages: Cluster, BusinessUnit, User, ReportTemplate, Application, Role, News, Email Settings.

## Styling Reference

**Color tokens (HSL):** warm-neutral ground + a single blue accent (calm-corporate reskin) — `--accent` is a neutral warm surface, **not** a brand hue, and status accents use dedicated `--success` / `--warning` / `--info` tokens rather than `--accent`. Values live in `src/index.css` + `tailwind.config.js` (the source of truth); the full reference (light + dark, all roles, hex, spacing, shadows, contrast) is **`.planning/design/system/tokens.md`** — keep it in sync when those change.

**Surfaces:** glassmorphism (`.glass` / `.glass-strong`) was removed in the enterprise redesign — surfaces are now flat `bg-card` / `bg-background` with a 1px `border`.

**Spacing:** page wrapper `space-y-4 sm:space-y-6` · card content `space-y-4` · field `space-y-2` · button gaps `gap-3`.

**Type:** page title `text-2xl sm:text-3xl font-bold tracking-tight` · subtitle `text-sm sm:text-base text-muted-foreground` · body `text-sm` · meta `text-xs` or `text-[11px]` · code `text-[10px] sm:text-xs font-mono`.

**Icon convention:** `mr-2 h-4 w-4` inside buttons with text; `h-5 w-5` for standalone icon buttons (`size="icon"`).

**Breakpoints:** mobile-first. `sm:` 640 · `md:` 768 (sidebar appears) · `lg:` 1024 (two-col form grids).

How to *consume* a token (`hsl(var(--token))` where a class won't fit), the both-blocks rule for adding one, and the frozen-column CSS contract: **`agent-os/standards/styling/`**.

## DateTime

No library. Inline formatter:
```ts
const fmt = (v?: string) => {
  if (!v) return '-';
  const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
```

## Rules for AI

1. **Read the closest existing page/service before writing new ones.** Match its exact pattern.
2. **Never modify `src/components/ui/`** primitives without explicit ask.
3. **Never** use `alert()`, `window.alert()`, or `window.confirm()` — use `toast.*` and `<ConfirmDialog>`.
4. **Never** add a `#` row-index column to `DataTable` — it adds one itself.
5. **Never** use raw green Tailwind classes for status — use `<Badge variant="success" | "secondary">`.
6. **Never** add external libraries without asking.
7. **Wrap all debug-only code** in `process.env.NODE_ENV === 'development'`.
8. **Wrap column defs** in `useMemo` with correct deps.
9. **Persist `perpage` per-entity** in `localStorage` (`perpage_<type>`).
10. **All shared types** in `src/types/index.ts`. Page-local `FormData` interfaces stay in the page file.
11. **Add new fields as optional (`?`)** unless the API guarantees them.
12. **Catch blocks** pick one of three helpers from `utils/errorParser.ts` — `parseApiError` when a form needs per-field errors (then `setFieldErrors(fields)`), `getErrorDetail` when you only need a string (it redacts in prod), `devLog` when the user shouldn't be told. Check `isNotFoundError` / `isVersionConflict` **before** the generic branch. See `agent-os/standards/errors/catch-blocks.md`.
13. **Management pages** come in three shapes, chosen by **where the filtering happens**: server-side list (unbounded set — `DataTable serverSide`, debounced search, filter Sheet or bar, CSV, summary band, debug Sheet, `Ctrl/⌘+K`), client-filtered list (structurally capped set — one fetch, in-memory filter, **no debounce**), and Config (cards, no table). Debounce only when typing triggers a fetch. See `agent-os/standards/pages/management-page.md`.
14. **All Edit pages** need: back button, Save/Cancel, dev debug Sheet with tabs, `useUnsavedChanges(hasChanges)`, `Ctrl/⌘+S` save, `Escape` cancel, real-time `validateField` on blur. The edit/read-only **toggle is mode-specific**, not universal — see `agent-os/standards/pages/edit-page-modes.md`.
15. **Mobile-first responsive.** Test both layouts (`md` is the desktop/sidebar pivot).
16. **Skeleton vs overlay vs empty:** see Loading States Decision Table — do not mix.
17. **Versioned-entity Edit pages** must thread `doc_version` via `src/utils/docVersion.ts`: dedicated `docVersion` state (never in `formData`), send only when present, `409` → `notifyVersionConflict()` + refetch. See **doc_version Optimistic Locking**.
18. **Tests** (Vitest): co-locate `*.test.ts(x)` beside source, use explicit `vitest` imports (no globals), assert behavior not snapshots. Pure utils → unit test; components → RTL; pages → mock shell+services, real `MemoryRouter`, **never mock `Can`**. See **Unit & Component Tests** and `agent-os/standards/testing/`. Don't churn `tsconfig.json` / `vite.config.ts` for test setup.
