# CLAUDE.md

Guidance for Claude Code working in this repo. Read fully before changing code.

## Project Overview

Frontend-only React + TypeScript admin dashboard for clusters, business units, users, report templates, and print-template mappings. Flat enterprise design (glassmorphism removed) with shadcn/ui + Tailwind. Backend (NestJS/Prisma) is a separate service reached via the `/api` and `/api-system` proxies.

- **Framework:** React 19 + TypeScript (Vite 8) — strict mode on
- **Styling:** Tailwind 3.4 with HSL CSS custom properties
- **Components:** shadcn/ui (Radix + CVA) — primitives live in `src/components/ui/`
- **Tables:** TanStack Table v8 via `DataTable` wrapper (`src/components/ui/data-table.tsx`)
- **Routing:** react-router-dom v6
- **HTTP:** Axios with interceptors (`src/services/api.ts`)
- **Icons:** lucide-react
- **Toasts:** sonner (≥2.0.7)
- **XML editor:** CodeMirror 6
- **Node:** 20.x (`.nvmrc`, `engines`); package manager: Bun (preferred) or npm with `legacy-peer-deps=true`

## Commands

```bash
bun install                 # or: npm install
bun start                   # Vite dev server on :3304 (--mode dev → .env.dev)
bun run dev:local           # dev server against local backend (.env.dev, --mode dev)
bun run dev:prod            # dev server against deployed dev backend (.env.prod, --mode prod)
bun run dev:uat             # dev server against UAT backend (.env.uat, --mode uat)
bun run build               # production build (--mode prod → .env.prod; sets REACT_APP_BUILD_DATE, emits to build/)
bun run build:local         # build with dev env (.env.dev, --mode dev)
bun run build:prod          # build with prod env (.env.prod, --mode prod)
bun run build:uat           # build with UAT env (.env.uat, --mode uat)
bun run preview             # serve the production build locally on :3304 (--mode prod → .env.prod)
bun run test                # unit + component tests (Vitest, jsdom) — one-shot
bun run test:watch          # Vitest watch mode
bun run test:cov            # Vitest with v8 coverage
bun run test:scripts        # node --test for build scripts (scripts/lib/*.test.mjs)
```

No separate lint command — vite-plugin-eslint runs during `start`/`build`. Pass `CI=true` to treat warnings as errors.

## Environment

Copy `.env.example` → `.env.dev` (local backend), `.env.prod` (deployed dev backend), and `.env.uat` (UAT backend, `https://api-carmen-web.pncsb-app.com`). All are gitignored. The Vite **mode** selects the file: `vite --mode dev` → `.env.dev`; `vite --mode prod` → `.env.prod`; `vite --mode uat` → `.env.uat`. **Every script passes `--mode` explicitly** — Vite's defaults (`development` for `vite`, `production` for `vite build`/`vite preview`) match no file, so a bare `vite` finds no env and `vite.config.ts` throws `[env] Missing …` rather than silently falling back. Vite forbids a mode literally named `local` (it conflicts with the `.local` suffix), so the local-backend mode is `dev` — never create a `.env.local` (it loads in every mode and leaks across `dev:local`/`dev:prod`/`dev:uat`). Every mode uses port `3304`, so only one dev server can run at a time. Variables:

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_BASE_URL` | Backend base URL (axios uses it directly as an absolute `baseURL` — not proxied) |
| `REACT_APP_API_APP_ID`   | Sent as `x-app-id` on every request |
| `REACT_APP_ENV`          | `development` \| `uat` \| `production` |
| `REACT_APP_PORT`         | Dev server / preview port (default `3304` if unset) |

`vite.config.ts` (`server.proxy`) configures `/api` and `/api-system` proxying with `secure: false` (self-signed certs OK) — but `src/services/api.ts` gives axios an absolute `baseURL`, so this proxy never fires; every mode calls the backend directly and depends on backend CORS. `server.port`/`preview.port` read `REACT_APP_PORT` (fallback `3304`).

Backend API docs use **Scalar at `/swagger`** (e.g. `http://localhost:4000/swagger`) — there is **no `/swagger-json`**. The full OpenAPI 3.0 spec is HTML-entity-embedded in that page; extract it by unescaping the HTML and brace-matching from `"openapi":"3.0.0"`. Always confirm endpoint paths/DTO shapes against swagger (this repo has two backends — `/api` and `/api-system`).

## Deployment

Static SPA on GCP: GCS bucket behind Cloud CDN + a global HTTPS load balancer (Terraform in `infra/gcp/`). `.github/workflows/deploy-gcp.yml` builds on push to `main` and deploys keyless via Workload Identity Federation (`gcloud storage rsync` + CDN cache invalidation). Vercel (`vercel.json`) is retained in parallel.

## Unit & Component Tests

[Vitest](https://vitest.dev) (jsdom) is the in-repo test runner — separate from the Playwright E2E suite. Config lives in `vitest.config.ts` (standalone — does **not** touch `vite.config.ts`); `vitest.setup.ts` registers jest-dom matchers + `afterEach(cleanup)` (we run **no** `globals`, so RTL cleanup is wired manually — otherwise renders accumulate in the shared jsdom doc); `src/vitest.d.ts` makes the jest-dom matchers visible to tsc without touching `tsconfig.json`.

- **Run:** `bun run test` (one-shot) · `test:watch` · `test:cov` (v8 coverage). Tests are excluded from the app bundle (never imported by app code).
- **Location:** co-locate `*.test.ts` / `*.test.tsx` beside the source (e.g. `src/utils/validation.test.ts`).
- **Imports:** explicit — `import { describe, it, expect, vi } from 'vitest'` (no globals).
- **Pure functions:** unit-test directly. Reference: `src/utils/*.test.ts`.
- **Components:** React Testing Library + `@testing-library/user-event`; assert behavior/roles/text (no snapshots). Presentational examples: `src/pages/businessUnitEdit/*.test.tsx`.
- **Page integration:** `vi.mock` the shell (`Layout`, `Can`) + services (and `api`), keep routing **real** via `MemoryRouter`. Reference: `src/pages/ClusterEdit.test.tsx`.

## E2E Tests

E2E tests live in the standalone sibling repo **`../carmen-platform-e2e`** (Playwright).
See that repo's `CLAUDE.md`. This repo's Vite dev server (`:3304`) is the system under test.

## Project Structure (orientation only — `ls` for current state)

```
src/
  components/      Layout, Sidebar, PrivateRoute, TableSkeleton, EmptyState,
                   KeyboardShortcuts, XmlEditor, DialogPreview
    ui/            shadcn primitives — DO NOT modify without a clear reason
  pages/           Landing, Login, Dashboard, Profile,
                   <Entity>Management.tsx (list) + <Entity>Edit.tsx (CRUD)
                   for Cluster, BusinessUnit, User, ReportTemplate, PrintTemplateMapping
    businessUnitEdit/  BusinessUnitEdit.tsx decomposed — sections/, useBusinessUnitUsers
                       hook, Form/Branding/Users/Debug cards, shared.tsx, types.ts
  services/        api.ts (axios + interceptors) + one <entity>Service.ts per entity
  types/index.ts   All shared TS types
  utils/           QueryParams, csvExport, validation, errorParser, xml
  hooks/           useUnsavedChanges
  context/         AuthContext
  lib/utils.ts     cn() = clsx + tailwind-merge
  **/*.test.{ts,tsx}  Vitest unit/component tests, co-located beside source
```

Test config at repo root: `vitest.config.ts`, `vitest.setup.ts`, plus `src/vitest.d.ts` (jest-dom matcher types). See **Unit & Component Tests** above.

## The Two Page Patterns

Every entity has two pages — **always copy the closest existing example**, do not invent layouts.

### Management page (`<Entity>Management.tsx`)
Canonical example: **`src/pages/ClusterManagement.tsx`**

Required structure: header row (title + Export CSV + Add button) → Card with search (debounced 400ms) + filter Sheet + active-filter badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` (server-side) + loading overlay → dev-only debug Sheet.

Required state shape: `items`, `totalRows`, `loading`, `error`, `searchTerm`, `statusFilter`, `showFilters`, `rawResponse`, `copied`, `paginate` (`{ page, perpage, search, sort }`).

### Edit page (`<Entity>Edit.tsx`)
Canonical examples: **`src/pages/ClusterEdit.tsx`** (simple), **`src/pages/ReportTemplateEdit.tsx`** (tabbed XML + sticky bottom bar).

**`src/pages/BusinessUnitEdit.tsx`** is the largest Edit page and is **decomposed** into `src/pages/businessUnitEdit/` — the page file is the orchestrator (form state + load/save + composition); the form is per-section components under `sections/` (sharing a `SectionFieldProps` bundle), the BU-users sub-flow is a `useBusinessUnitUsers` hook + `BusinessUnitUsersCard`, and Branding/Debug are their own cards. Follow this split if an Edit page grows unwieldy — don't let one page file balloon past ~600 lines.

Required structure: header (back + title + Edit toggle) → error display → Card sections (form, `lg:grid-cols-2` on existing) → related-data cards → dev-only debug Sheet with tabs.

Required state shape: `id` (from `useParams`), `isNew = !id`, `formData`, `loading`, `editing` (new ⇒ true; existing ⇒ false until Edit pressed), `saving`, `error`, `rawResponse`, `copied`, `savedFormData`.

Edit/Cancel: stash `formData` into `savedFormData` on Edit; restore on Cancel.

## Sidebar Layout

`Layout.tsx` owns sidebar state (persisted to `localStorage('sidebar-collapsed')`); `Sidebar.tsx` renders desktop fixed sidebar (`w-60` / `w-16`) and a mobile Sheet drawer. Main content margin: `md:ml-16` ↔ `md:ml-60`. Transitions via `.sidebar-transition`.

Add a nav item by editing `allNavItems` in `Layout.tsx`. Items carry a `group` (`'Organization' | 'Content' | 'Platform'`) and gate on either a single `permission` or `superAdminOnly`:
```tsx
{ path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' }
{ path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' }
```
Filtered via `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)` from `AuthContext`. Items with no `group` (e.g. Dashboard) render ungrouped at top. Collapsed state shows icons only, with right-side tooltips (`delayDuration={200}`).

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

- **Base path:** `/api-system/...` (proxied in dev)
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
| User feedback | `toast.success/error/info/warning` from `sonner` | **Never** use `alert()`. Already wired in `App.tsx` |
| Unsaved-change guard | `useUnsavedChanges(hasChanges)` | Compare `formData` vs `savedFormData` (or `initialFormData` if new) |
| Keyboard shortcuts | `useGlobalShortcuts({ onSave, onCancel, onSearch })` | `?` help dialog auto-wired in `Layout` |
| XML editing | `<XmlEditor>` (`components/XmlEditor.tsx`) | CM6 wrapper. Falls back to read-only Copy+Download when `readOnly` |
| Dialog XML preview | `<DialogPreview xml=...>` | Renders `<Label>` + `<Date>`/`<Lookup>` pairs |
| Tag/chip input over CSV string | `<ChipInput>` (`components/ui/chip-input.tsx`) | Pass raw comma-joined string in, get it back out |
| Field-level validation | `validateField(name, value)` (`utils/validation.ts`) | Validates by field-name heuristic; pair with `fieldErrors` state |
| API error parsing | `parseApiError(err)` (`utils/errorParser.ts`) | Returns `{ message, fields? }`. Use in every catch block |
| CSV export | `generateCSV` + `downloadCSV` (`utils/csvExport.ts`) | Required on every Management page |

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

Built-in validators (`utils/validation.ts`): `isValidEmail`, `isValidCode` (2–20 chars `[A-Za-z0-9_-]`), `isValidPhone` (8–20 digits, `+`, spaces, `-`, `()`). `validateField` also handles `username` (email), `alias_name` (1–3 alphanum), `max_license_bu`, `max_license_users` (positive int).

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

After create: `navigate(\`/items/\${created.id}\`, { replace: true })`.

## Report Template Edit Specifics

`src/pages/ReportTemplateEdit.tsx` uses a different layout from other Edit pages: sticky left column (Info + BU Scope + Metadata) + tabbed right column (Dialog XML / Content XML / Preview) + sticky bottom action bar (offset matches sidebar: `md:left-16 lg:left-60`). Wrap page in `pb-20` so the bar doesn't overlap content. Use `<div hidden={...}>` for tab panels containing CodeMirror so editors stay mounted.

XML utils in `src/utils/xml.ts`: `formatXml`, `validateXml`, `countLines`, `byteSize`, `formatBytes`, `downloadText`. Prefer `XmlEditor`/`DialogPreview` over raw util calls.

## Print Template Mapping Specifics

`src/pages/PrintTemplateMappingManagement.tsx` is a **configuration page**, not a standard Management page, and intentionally deviates from rule 13:

- Data set is small (one row per `document_type` × template), so it uses a card-grouped layout (group by document type) instead of a server-side DataTable.
- No debounced search, no Sheet filter, no CSV export — replaced by a `document_type` select + an "Active only" checkbox.
- Backend service is filter-based (`document_type`, `active_only` query params), not paginated.
- The companion `PrintTemplateMappingEdit.tsx` is a single-mode form (no edit/read-only toggle) — appropriate for a config row that's always editable when opened.

When adding similar small-dimension configuration pages, follow this pattern rather than rule 13.

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

Versioned entities carry a numeric `doc_version`. The backend **requires** it on update and rejects a stale write with **HTTP 409** (message `Record was modified by another request …`). Every `<Entity>Edit` page that updates such a record must echo the last-seen token back. Full contract: `docs/doc-version-optimistic-locking-spec.md`.

**Helper — `src/utils/docVersion.ts`:**
- `getDocVersion(record)` → the numeric token off a loaded record, else `undefined`.
- `isVersionConflict(err)` → `true` only on 409 **and** a lock signal. Detection relies on the message match (`/modified by another request|doc_version/i`) because the gateway remaps the error `code` to `ALREADY_EXISTS` (same as a name-collision 409) — the message check is **load-bearing**, do not simplify it away (see the comment in the file).
- `notifyVersionConflict()` → the single canonical conflict toast.

**Per Edit page** (reference: `ClusterEdit.tsx`):
- Hold `const [docVersion, setDocVersion] = useState<number>()` — **never** put `doc_version` in `formData` (it would pollute the unsaved-changes dirty-check and create payload).
- Capture on load: `setDocVersion(getDocVersion(record))` inside `fetchX`.
- Send on update **only when present**: `service.update(id, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) })`. Create paths never send it.
- After save, the existing post-save `fetchX()` refreshes `docVersion` (the update response also returns the new one).
- On conflict, branch the catch: `if (isVersionConflict(err)) { notifyVersionConflict(); await fetchX(); } else { <existing error handling, unchanged> }`. The page stays in edit mode; in-flight edits are discarded and reloaded to latest (standard optimistic-lock UX).

**Defensive principle:** send the token only when the GET returned one — so an entity whose backend read doesn't yet expose `doc_version` is a runtime no-op (no 400 risk). Services with **custom write payloads** forward it explicitly: `applicationService.toWritePayload`, `roleService.update`, and `newsService.buildNewsFormData` (multipart appends `doc_version` as a **string** — the backend coerces it). Pass-through services (`Partial<T>`/`Record`) forward it automatically once the type carries `doc_version?: number`.

Wired pages: Cluster, BusinessUnit, User, ReportTemplate, Application, Role, News, PrintTemplateMapping. **Backend gotcha:** the admin "Role" page is **platform roles** (`/api-system/platform/roles` → `platform_role` service), not application-roles (`/api-system/roles`). Optimistic locking only fires when the backend read exposes `doc_version` AND the update guards `where: { id, doc_version }`.

## Styling Reference

**Color tokens (HSL):** `--primary` 221 61% 48% (blue) · `--accent` 220 14% 96% (neutral subtle surface, not a brand hue) · `--destructive` 0 84% 60% · `--muted-foreground` 220 10% 46% · `--border` / `--input` 220 15% 90% · `--radius` 0.375rem. Status accents (success/warning/info) use dedicated `--success` / `--warning` / `--info` tokens rather than `--accent`.

**Surfaces:** glassmorphism (`.glass` / `.glass-strong`) was removed in the enterprise redesign — surfaces are now flat `bg-card` / `bg-background` with a 1px `border`.

**Spacing:** page wrapper `space-y-4 sm:space-y-6` · card content `space-y-4` · field `space-y-2` · button gaps `gap-3`.

**Type:** page title `text-2xl sm:text-3xl font-bold tracking-tight` · subtitle `text-sm sm:text-base text-muted-foreground` · body `text-sm` · meta `text-xs` or `text-[11px]` · code `text-[10px] sm:text-xs font-mono`.

**Icon convention:** `mr-2 h-4 w-4` inside buttons with text; `h-5 w-5` for standalone icon buttons (`size="icon"`).

**Breakpoints:** mobile-first. `sm:` 640 · `md:` 768 (sidebar appears) · `lg:` 1024 (two-col form grids).

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
12. **Catch blocks** must use `parseApiError(err)` + `toast.error()` (plus `setFieldErrors(fields)` when returned).
13. **All Management pages** need: debounced search (400ms), filter Sheet, server-side DataTable, CSV export, dev debug Sheet, `Ctrl/⌘+K` search shortcut.
14. **All Edit pages** need: edit/read-only toggle, back button, Save/Cancel, dev debug Sheet with tabs, `useUnsavedChanges(hasChanges)`, `Ctrl/⌘+S` save, `Escape` cancel, real-time `validateField` on blur.
15. **Mobile-first responsive.** Test both layouts (`md` is the desktop/sidebar pivot).
16. **Skeleton vs overlay vs empty:** see Loading States Decision Table — do not mix.
17. **Versioned-entity Edit pages** must thread `doc_version` via `src/utils/docVersion.ts`: dedicated `docVersion` state (never in `formData`), send only when present, `409` → `notifyVersionConflict()` + refetch. See **doc_version Optimistic Locking**.
18. **Tests** (Vitest): co-locate `*.test.ts(x)` beside source, use explicit `vitest` imports (no globals), assert behavior not snapshots. Pure utils → unit test; components → RTL; pages → mock shell+services, real `MemoryRouter`. See **Unit & Component Tests**. Don't churn `tsconfig.json` / `vite.config.ts` for test setup.
