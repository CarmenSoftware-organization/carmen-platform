# Manage News — Design Spec

**Date:** 2026-05-26
**Status:** Approved (design); ready for implementation planning
**Author:** brainstormed with Claude

## 1. Summary

Add a **Manage News** feature to the carmen-platform admin dashboard: a standard
Management + Edit CRUD pair for news articles, wired to the **existing** backend
news API. News articles have a title, Markdown body, optional source/image URLs,
a draft → published → archived status workflow, and business-unit targeting
(global or specific BUs).

This is an admin authoring tool. The public-facing display of news (consumed by
end-users via the backend's anonymous endpoint) is **out of scope**.

## 2. Goals & non-goals

### Goals
- List, search (debounced), and filter news by status.
- Create, edit, and delete news articles.
- Edit Markdown content with a live preview.
- Target news at all BUs (global) or a specific set of BUs.
- Manage the draft/published/archived status workflow.
- Restrict the entire feature to `platform_admin`.

### Non-goals (YAGNI)
- The public anonymous endpoint `/api/public/news` (read-only, end-user facing).
- Image **upload** — `image` is a URL string field only (no file picker).
- Manual `published_at` date picking — the backend auto-sets it on publish.
- A "show deleted" / soft-delete toggle — status is the only list filter.
- Inline row Publish/Archive quick actions — status is changed on the Edit page.

## 3. Backend contract (already exists)

Source of truth: `carmen-turborepo-backend-v2` →
`apps/backend-gateway/src/application/news/` and
`packages/prisma-shared-schema-platform/prisma/schema.prisma` (`model tb_news`).

### Base path
**`/api/news`** — note this is `/api`, **not** `/api-system` like the other
frontend entities. Both prefixes are proxied in `vite.config.ts`.

### Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/news`       | List (paginated, searchable, filterable) |
| GET    | `/api/news/:id`   | Get one (UUID v4) |
| POST   | `/api/news`       | Create |
| PUT    | `/api/news/:id`   | Update |
| DELETE | `/api/news/:id`   | Delete (soft delete) |

All require `Authorization: Bearer <token>` + `x-app-id` header (both already
added by the axios interceptor in `src/services/api.ts`). Swagger tag:
"Reports: News".

### Record shape (`NewsResponseDto`)
```ts
{
  id: string;                  // UUID
  title?: string;              // required on create
  contents?: string;           // Markdown body (VarChar)
  url?: string;                // source URL
  image?: string;              // image URL
  business_unit_ids?: string[];// [] = global (all BUs); non-empty = only those BUs
  status?: 'draft' | 'published' | 'archived'; // default 'draft'
  published_at?: string;       // ISO 8601; auto-set on transition to published
  audit?: {                    // enriched audit object (see note below)
    created?: { at?: string; id?: string; name?: string; avatar?: string };
    updated?: { at?: string; id?: string; name?: string; avatar?: string };
    deleted?: { at?: string; id?: string; name?: string; avatar?: string };
  };
}
```

### List response shape
```ts
{ data: News[], paginate: { total: number; page: number; perpage: number; pages: number } }
```
Matches the existing `ApiListResponse<T>`; unwrap with `response.data.data || response.data`
and read pagination from `response.data.paginate`.

### Create / Update request bodies
- **Create** (`NewsCreateRequestDto`): `title` (required), `contents?`, `url?`,
  `image?`, `business_unit_ids` (required array; `[]` = global), `status?`
  (defaults `draft`), `published_at?` (auto-set if omitted on publish).
- **Update** (`NewsUpdateRequestDto`): all fields optional; setting
  `business_unit_ids` **replaces** the array; transitioning `status` to
  `published` auto-sets `published_at` if omitted.

### Audit shape note
News returns an enriched nested `audit` object (`audit.created.at`,
`audit.created.name`, `audit.updated.at`, etc.), **not** the flat
`created_at` / `created_by_name` fields used by Cluster/BusinessUnit/User. This
is the first frontend entity to consume the `audit` shape, so we add reusable
`Audit` / `AuditEntry` types.

## 4. Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Audience | Targetable (global or specific BUs) |
| Backend | Already exists at `/api/news` |
| Content editor | Markdown + preview via `react-markdown` + `remark-gfm` |
| BU targeting UI | "Global" checkbox toggle + self-contained BU multi-select |
| Status workflow | Native `<select>` on Edit + status filter on Management |
| Access | `platform_admin` only |
| `published_at` | Read-only / backend auto-set (no manual picker) |
| Deleted filter | None (status is the only filter) |

## 5. New dependencies

- `react-markdown` — React Markdown renderer (safe by default; no raw HTML).
- `remark-gfm` — GitHub-flavored Markdown (tables, strikethrough, task lists).

Install with the repo's package manager (Bun preferred; npm uses
`legacy-peer-deps=true`). These are the only new runtime deps.

## 6. Files

### New
| File | Purpose |
|------|---------|
| `src/services/newsService.ts` | CRUD against `/api/news` |
| `src/pages/NewsManagement.tsx` | List page — copy of `ClusterManagement.tsx` |
| `src/pages/NewsEdit.tsx` | Create/edit page — copy of `ClusterEdit.tsx` |
| `src/components/ui/textarea.tsx` | New shadcn `Textarea` primitive (none exists) |
| `src/components/MarkdownEditor.tsx` | Write/Preview tabs (edit) + rendered view (read-only) |
| `src/components/BusinessUnitMultiSelect.tsx` | Search Input + checkbox list + selected chips |
| `e2e/tests/news.spec.ts` | E2E spec |
| `e2e/pages/NewsPage.ts` | Page object |

### Modified
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `News`, `NewsStatus`, `Audit`, `AuditEntry` |
| `src/App.tsx` | 3 lazy routes guarded `allowedRoles={['platform_admin']}` |
| `src/components/Layout.tsx` | Nav item + `Newspaper` icon import |
| `src/utils/validation.ts` | Add `isValidUrl`; handle `url`/`image` in `validateField` |
| `package.json` | Add the two deps |

## 7. Types (`src/types/index.ts`)

```ts
export type NewsStatus = 'draft' | 'published' | 'archived';

export interface AuditEntry {
  at?: string;
  id?: string;
  name?: string;
  avatar?: string;
}

export interface Audit {
  created?: AuditEntry;
  updated?: AuditEntry;
  deleted?: AuditEntry;
}

export interface News {
  id: string;
  title: string;
  contents?: string;            // Markdown
  url?: string;                 // source URL
  image?: string;               // image URL
  business_unit_ids?: string[]; // [] = global; non-empty = those BUs
  status?: NewsStatus;
  published_at?: string;
  audit?: Audit;
}
```

## 8. Service (`src/services/newsService.ts`)

Mirrors `clusterService.ts` exactly, but on the `/api` base path:

```ts
const defaultSearchFields = ['title', 'contents'];

const newsService = {
  getAll:  (paginate) => GET  /api/news?<QueryParams.toQueryString()>  // returns ApiListResponse<News>
  getById: (id)       => GET  /api/news/:id
  create:  (data)     => POST /api/news
  update:  (id, data) => PUT  /api/news/:id
  delete:  (id)       => DELETE /api/news/:id
};
```

Use `QueryParams` with `defaultSearchFields` and the `advance` JSON string for
the status filter (see §9).

## 9. Management page (`NewsManagement.tsx`)

Copy `src/pages/ClusterManagement.tsx`. Required structure: header row
(title + Export CSV + Add) → Card with search + filter Sheet + active-filter
badges → CardContent with `TableSkeleton` / `EmptyState` / `DataTable` +
loading overlay → dev debug Sheet.

State shape: `items`, `totalRows`, `loading`, `error`, `searchTerm`,
`statusFilter` (`string[]`), `showFilters`, `rawResponse`, `copied`,
`paginate` (`{ page, perpage, search, sort, advance, filter }`).

### Status filter → advance query
`statusFilter` is a `string[]` of selected statuses (toggle-buttons in the
filter Sheet, like Cluster's active/inactive buttons). Persist to
`localStorage('filters_news')`. Build advance:

```ts
const buildAdvance = (statuses: string[]) =>
  statuses.length > 0
    ? JSON.stringify({ where: { status: { in: statuses } } })
    : '';
```

### DataTable columns (`useMemo`)
1. **Title** — `news.title`.
2. **Status** — `<Badge>`: `published` → `success`, `draft` → `secondary`,
   `archived` → `outline`.
3. **Target** — `business_unit_ids` empty/undefined → `Global` badge; else
   `${n} BUs`.
4. **Published** — `published_at` via inline `fmt()` (or `-`).
5. **Updated** — `audit?.updated?.at` via `fmt()`, with `audit?.updated?.name`.
6. **Actions** — Edit link (`/news/:id/edit`) + Delete via `<ConfirmDialog>`
   (calls `newsService.delete`, then refetch + `toast.success`).

Do **not** add a `#` index column — `DataTable` adds one.

### Behaviors
- Debounced search (400ms); searches `title`/`contents`.
- Loading states per the decision table (skeleton / overlay / empty).
- CSV export via `generateCSV` + `downloadCSV`.
- `perpage_news` persisted in `localStorage`.
- `Ctrl/⌘+K` search shortcut via `useGlobalShortcuts`.
- Dev-only debug Sheet exposing `rawResponse`.
- Catch blocks use `parseApiError` + `toast.error`.

## 10. Edit page (`NewsEdit.tsx`)

Copy `src/pages/ClusterEdit.tsx`. Page-local form state:

```ts
interface NewsFormData {
  title: string;
  contents: string;
  url: string;
  image: string;
  status: NewsStatus;
  isGlobal: boolean;          // derived: business_unit_ids.length === 0
  business_unit_ids: string[];
}
```

State: `id` (`useParams`), `isNew = !id`, `formData`, `loading`, `editing`
(new ⇒ true; existing ⇒ false until Edit pressed), `saving`, `error`,
`rawResponse`, `copied`, `savedFormData`.

### Card sections
1. **Content**
   - `title` — `<Input>`, required. `validateField` on blur.
   - `contents` — `<MarkdownEditor value onChange readOnly={!editing} />`.
   - `url` — `<Input>` + `isValidUrl` on blur.
   - `image` — `<Input>` + `isValidUrl` on blur; render a small thumbnail
     preview when the value is a valid URL.
2. **Publishing**
   - `status` — native `<select>` (draft/published/archived), matching the
     native `<select>` pattern used in `ClusterEdit`.
   - `published_at` — read-only display (`fmt()`); helper text: auto-set by the
     backend when status becomes `published`.
3. **Targeting**
   - "Visible to all business units" checkbox (`isGlobal`), styled like the
     `is_active` checkbox in `ClusterEdit`.
   - When `isGlobal` is **false** → `<BusinessUnitMultiSelect>`.
4. **Metadata** (existing records only) — read-only created/updated from
   `audit.created` / `audit.updated` (`at` + `name`).

### Mapping on load / submit
- **Load:** `isGlobal = !news.business_unit_ids?.length`;
  `business_unit_ids = news.business_unit_ids ?? []`.
- **Submit:** `business_unit_ids = isGlobal ? [] : business_unit_ids`.

### Validation (pre-submit)
- `title` required (non-empty).
- `url`, `image` — if non-empty, must pass `isValidUrl`.
- If `!isGlobal`, require ≥1 selected BU (else inline error + abort).

### Navigation
- After **create:** `navigate('/news/${created.id}/edit', { replace: true })` —
  lands on the Edit page in read-only mode. (Deviates from `ClusterEdit`, which
  navigates to `/clusters/${id}` — a path with no matching route; the `/edit`
  suffix resolves correctly here.)
- Back button → `navigate('/news')`.

### Standard Edit behaviors
Edit/read-only toggle, Save/Cancel with `savedFormData` stash on Edit & restore
on Cancel, `useUnsavedChanges(hasChanges)` (compare `formData` vs
`savedFormData`/initial), `Ctrl/⌘+S` save, `Escape` cancel, loading button
pattern, dev debug Sheet with tabs, `parseApiError` + `toast.error` in catches.

## 11. New components

### `src/components/MarkdownEditor.tsx`
Props: `{ value: string; onChange: (v: string) => void; readOnly?: boolean }`.
- **Edit mode:** `<Tabs>` with **Write** (`<Textarea>`) and **Preview**
  (`react-markdown` + `remark-gfm`) panels.
- **Read-only mode:** rendered Markdown only, in a styled container
  (manual prose-like Tailwind classes; no typography plugin installed).
- react-markdown does not render raw HTML by default — no extra sanitization
  needed.

### `src/components/BusinessUnitMultiSelect.tsx`
Props: `{ value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }`.
- Loads BUs via `businessUnitService.getAll` (large `perpage`) on mount.
- Client-side search `<Input>` filters the list by name/code.
- Scrollable list of native checkboxes (one per BU).
- Selected BUs shown above as removable `<Badge>` chips.
- Loading skeleton while fetching; errors via `parseApiError` + inline message.

### `src/components/ui/textarea.tsx`
Standard shadcn `Textarea` primitive (forwardRef, `cn()` classes). New addition
(no primitive is being modified).

## 12. Validation util changes (`src/utils/validation.ts`)

- Add `isValidUrl(value: string): boolean` (accepts http/https URLs; empty is
  valid since the fields are optional — emptiness handled by callers).
- Extend `validateField` to handle field names `url` and `image` using
  `isValidUrl`.

## 13. Routing (`src/App.tsx`)

```tsx
const NewsManagement = lazy(() => import('./pages/NewsManagement'));
const NewsEdit = lazy(() => import('./pages/NewsEdit'));

<Route path="/news"          element={<PrivateRoute allowedRoles={['platform_admin']}><NewsManagement /></PrivateRoute>} />
<Route path="/news/new"      element={<PrivateRoute allowedRoles={['platform_admin']}><NewsEdit /></PrivateRoute>} />
<Route path="/news/:id/edit" element={<PrivateRoute allowedRoles={['platform_admin']}><NewsEdit /></PrivateRoute>} />
```

## 14. Navigation (`src/components/Layout.tsx`)

- Import `Newspaper` from `lucide-react`.
- Add to `allNavItems`:
  ```tsx
  { path: '/news', label: 'News', icon: Newspaper, roles: ['platform_admin'] }
  ```
- Filtered through `hasRole()`; collapsed sidebar shows icon + tooltip.

## 15. Testing (E2E)

`e2e/tests/news.spec.ts` + `e2e/pages/NewsPage.ts` following the existing
page-object pattern. Cover:
- List renders; search filters results.
- Status filter (draft/published/archived).
- Create — global news.
- Create — BU-targeted news (toggle off global, pick BUs).
- Edit existing — change content + status.
- Delete with `ConfirmDialog`.

## 16. Conformance to CLAUDE.md rules

- Copies the closest existing page/service (`ClusterManagement`,
  `ClusterEdit`, `clusterService`).
- No modification of existing `src/components/ui/` primitives (only **adds**
  `textarea.tsx`).
- No `alert()` / `window.confirm()` — uses `toast.*` + `<ConfirmDialog>`.
- No `#` index column added to `DataTable`.
- Status via `<Badge>` variants (no raw green Tailwind).
- New libraries (`react-markdown`, `remark-gfm`) explicitly approved.
- Debug-only code wrapped in `process.env.NODE_ENV === 'development'`.
- Column defs wrapped in `useMemo`.
- `perpage` persisted per-entity (`perpage_news`).
- New optional fields typed as `?`.
- Catch blocks use `parseApiError` + `toast.error`.
- Shared types (`News`, `NewsStatus`, `Audit`, `AuditEntry`) in
  `src/types/index.ts`; `NewsFormData` stays page-local.
- Management page: debounced search, filter Sheet, server-side DataTable, CSV
  export, dev debug Sheet, `Ctrl/⌘+K`.
- Edit page: edit/read-only toggle, back, Save/Cancel, dev debug Sheet with
  tabs, `useUnsavedChanges`, `Ctrl/⌘+S`, `Escape`, `validateField` on blur.
- Mobile-first responsive.

## 17. Open risks / verify during implementation

- Confirm the runtime list response nests pagination under `paginate` (per the
  microservice code) vs. flat `total/page/perpage` (per the swagger DTO). The
  service code returns `{ data, paginate: {...} }`; verify via the dev debug
  Sheet on first run and adjust the unwrap if needed.
- Confirm `getById` returns the news object (wrapped by the gateway's
  `respond()`); unwrap with `response.data.data || response.data`.
- Verify the `audit` object is present on both list and detail responses (the
  controller applies `@EnrichAuditUsers()` to both).
