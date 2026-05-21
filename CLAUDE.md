# CLAUDE.md

Guidance for Claude Code working in this repo. Read fully before changing code.

## Project Overview

Frontend-only React + TypeScript admin dashboard for clusters, business units, users, report templates, and print-template mappings. Glassmorphism design with shadcn/ui + Tailwind. Backend (NestJS/Prisma) is a separate service reached via the `/api` and `/api-system` proxies.

- **Framework:** React 18 + TypeScript (Vite 8) — strict mode on
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
bun start                   # Vite dev server on :3001
bun run build               # production build (sets REACT_APP_BUILD_DATE, emits to build/)
bun run preview             # serve the production build locally on :3001
bun run test:e2e            # Playwright headless
bun run test:e2e:ui         # Playwright UI
bun run test:e2e:headed     # visible browser
bun run test:e2e:debug      # debug mode
```

No separate lint command — vite-plugin-eslint runs during `start`/`build`. Pass `CI=true` to treat warnings as errors.

## Environment

Copy `.env.example` → `.env`. Variables:

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_BASE_URL` | Backend base URL (proxied in dev) |
| `REACT_APP_API_APP_ID`   | Sent as `x-app-id` on every request |
| `REACT_APP_ENV`          | `development` \| `uat` \| `production` |

`vite.config.ts` (`server.proxy`) proxies `/api` and `/api-system` with `secure: false` (self-signed certs OK).

## Deployment

Multi-stage Docker (Node 20 builder → nginx:stable-alpine, port 3001). CI in `.github/workflows/build.yml` pushes ARM64 image to ECR and deploys via SSM. `docker-compose` binds `127.0.0.1:3001` behind a reverse proxy with 30s healthcheck.

## E2E Tests

Page-object pattern under `e2e/`: `tests/` (specs by feature), `pages/`, `helpers/`, `fixtures/`. Config in `playwright.config.ts` (Chromium, screenshots on failure).

## Project Structure (orientation only — `ls` for current state)

```
src/
  components/      Layout, Sidebar, PrivateRoute, TableSkeleton, EmptyState,
                   KeyboardShortcuts, XmlEditor, DialogPreview
    ui/            shadcn primitives — DO NOT modify without a clear reason
    magicui/       Ripple effects
  pages/           Landing, Login, Dashboard, Profile,
                   <Entity>Management.tsx (list) + <Entity>Edit.tsx (CRUD)
                   for Cluster, BusinessUnit, User, ReportTemplate, PrintTemplateMapping
  services/        api.ts (axios + interceptors) + one <entity>Service.ts per entity
  types/index.ts   All shared TS types
  utils/           QueryParams, csvExport, validation, errorParser, xml
  hooks/           useUnsavedChanges
  context/         AuthContext
  lib/utils.ts     cn() = clsx + tailwind-merge
```

## The Two Page Patterns

Every entity has two pages — **always copy the closest existing example**, do not invent layouts.

### Management page (`<Entity>Management.tsx`)
Canonical example: **`src/pages/ClusterManagement.tsx`**

Required structure: header row (title + Export CSV + Add button) → Card with search (debounced 400ms) + filter Sheet + active-filter badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` (server-side) + loading overlay → dev-only debug Sheet.

Required state shape: `items`, `totalRows`, `loading`, `error`, `searchTerm`, `statusFilter`, `showFilters`, `rawResponse`, `copied`, `paginate` (`{ page, perpage, search, sort }`).

### Edit page (`<Entity>Edit.tsx`)
Canonical examples: **`src/pages/ClusterEdit.tsx`** (simple), **`src/pages/ReportTemplateEdit.tsx`** (tabbed XML + sticky bottom bar).

Required structure: header (back + title + Edit toggle) → error display → Card sections (form, `lg:grid-cols-2` on existing) → related-data cards → dev-only debug Sheet with tabs.

Required state shape: `id` (from `useParams`), `isNew = !id`, `formData`, `loading`, `editing` (new ⇒ true; existing ⇒ false until Edit pressed), `saving`, `error`, `rawResponse`, `copied`, `savedFormData`.

Edit/Cancel: stash `formData` into `savedFormData` on Edit; restore on Cancel.

## Sidebar Layout

`Layout.tsx` owns sidebar state (persisted to `localStorage('sidebar-collapsed')`); `Sidebar.tsx` renders desktop fixed sidebar (`w-60` / `w-16`) and a mobile Sheet drawer. Main content margin: `md:ml-16` ↔ `md:ml-60`. Transitions via `.sidebar-transition`.

Add a nav item by editing `allNavItems` in `Layout.tsx`:
```tsx
{ path: '/settings', label: 'Settings', icon: Settings, roles?: ['platform_admin'] }
```
`roles` is filtered through `hasRole()` from `AuthContext`. Collapsed state shows icons only, with right-side tooltips (`delayDuration={200}`).

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
// Role-guarded:
<Route path="/x" element={<PrivateRoute allowedRoles={['platform_admin']}><X /></PrivateRoute>} />
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

## Styling Reference

**Color tokens (HSL):** `--primary` 220 90% 56% (blue) · `--accent` 260 60% 58% (purple) · `--destructive` 0 84% 60% · `--muted-foreground` 220 10% 46% · `--border` / `--input` 220 15% 90%.

**Glass:** `.glass` (16px blur — sidebar, mobile header) · `.glass-strong` (24px — Sheet, dropdowns). `.bg-mesh` for page backgrounds.

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
