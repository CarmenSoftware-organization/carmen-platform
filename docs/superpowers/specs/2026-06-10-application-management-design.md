# Application Management — Design

**Date:** 2026-06-10
**Status:** Approved (design)
**Type:** Admin CRUD feature (frontend only)

## Summary

Add an admin CRUD page set for **Applications** — backend entities that group a set of
allowed API operations. Pure frontend work against an existing backend; this UI only
manages application records. It does **not** change the `x-app-id` the frontend sends
(that stays sourced from `REACT_APP_API_APP_ID`).

Access is restricted to `platform_admin`.

## Backend API (verified against swagger at `/api-system/applications`)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api-system/applications` | List (paginate: `page`, `perpage`, `search`, `searchfields`, `sort`, `filter`) |
| POST   | `/api-system/applications` | Create |
| GET    | `/api-system/applications/{application_id}` | Get by id |
| PUT    | `/api-system/applications/{application_id}` | Update |
| DELETE | `/api-system/applications/{application_id}` | Delete |
| GET    | `/api-system/applications/api-catalog` | Catalog of selectable `api_name` values |

### Read model — `ApplicationResponseDto`
```jsonc
{
  "id": "uuid",
  "name": "mobile-app",
  "description": "Carmen mobile client",
  "is_active": true,
  "allow_all": false,
  "api_names": ["auth.login", "news.findAll"]   // flat string[]
}
```

### Write model (create/update) — asymmetric to the read model
```jsonc
{
  "name": "mobile-app",        // required on create
  "description": "...",
  "is_active": true,
  "allow_all": false,
  "details": { "add": [ { "api_name": "news.findAll" }, ... ] }
}
```
- `api_names` is read-only output; on write it is sent through `details.add[]`.
- **Update uses replace semantics:** send the full desired set of api_names in
  `details.add` (the schema has no `remove`/`update`, confirmed acceptable).

### api-catalog
- Returns `{ api_names: string[] }` (may be inside the standard `{ data }` envelope)
  — the available `api_name` values. `getApiCatalog()` extracts `api_names`.
- Used to populate the api_names multi-select on the Edit page.

## Notes vs. the original verbal description
- There is **no `app_id` field** on the entity. `x-app-id` is request context, not a field.
- `api_name` is not a scalar field; reads expose `api_names: string[]`, writes use `details.add[]`.
- `allow_all` (boolean) grants access to all APIs.

## Components to build

Follow the canonical two-page pattern (copy the closest existing example — `Cluster`).

### 1. Type — `src/types/index.ts`
```ts
export interface Application {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  api_names?: string[];        // read model
}

export interface ApplicationWritePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  details?: { add: { api_name: string }[] };
}
```

### 2. Service — `src/services/applicationService.ts`
Copy `clusterService.ts`. Base path `/api-system/applications`.
- `defaultSearchFields = ['name', 'description']`
- `getAll`, `getById`, `create`, `update`, `delete` (standard shape, unwrap
  `response.data.data || response.data`)
- `getApiCatalog(): Promise<string[]>` → `GET /api-system/applications/api-catalog`
- `create`/`update` accept form data and **map `api_names: string[]` →
  `details.add: [{ api_name }]`** before sending. On update, send the full selected
  set (replace).
- `is_active` filtering via `paginate.advance` JSON (`{ where: { is_active: ... } }`),
  same as the Cluster filter pattern.

### 3. Management page — `src/pages/ApplicationManagement.tsx`
Copy `ClusterManagement.tsx`. Satisfies rule 13 (debounced search 400ms, filter Sheet,
server-side `DataTable`, CSV export, dev debug Sheet, `Ctrl/⌘+K`).

Columns (wrapped in `useMemo`; no manual `#` column):
- **Name**
- **Description**
- **Access** — `allow_all` ⇒ `<Badge>All APIs</Badge>`; otherwise `N APIs`
- **Status** — `<Badge variant={is_active ? 'success' : 'secondary'}>`
- **Actions** — Edit + Delete (via `<ConfirmDialog>`)

State shape: `items, totalRows, loading, error, searchTerm, statusFilter, showFilters,
rawResponse, copied, paginate({ page, perpage, search, sort })`. Persist
`perpage_applications` in localStorage. CSV via `generateCSV` + `downloadCSV`.

### 4. Edit page — `src/pages/ApplicationEdit.tsx`
Copy `ClusterEdit.tsx`. Satisfies rule 14 (edit/read-only toggle, back, Save/Cancel,
dev debug Sheet with tabs, `useUnsavedChanges`, `Ctrl/⌘+S`, `Escape`, on-blur
`validateField`).

Fields (each renders edit + read-only mode):
- **name** — required, `validateField` on blur
- **description** — optional
- **is_active** — checkbox
- **allow_all** — checkbox/switch. When checked, **hide/disable the api_names
  selector** (all APIs granted).
- **api_names** — multi-select / combobox populated from `getApiCatalog()`. If the
  catalog request fails, fall back to a `<ChipInput>` (free text). Hidden when
  `allow_all` is true.

State shape: `id` (from `useParams`), `isNew = !id`, `formData`, `loading`, `editing`
(new ⇒ true; existing ⇒ false until Edit), `saving`, `error`, `rawResponse`, `copied`,
`savedFormData`. After create: `navigate('/applications/:id', { replace: true })`.

### 5. Routing — `src/App.tsx`
```tsx
<Route path="/applications"          element={<PrivateRoute allowedRoles={['platform_admin']}><ApplicationManagement /></PrivateRoute>} />
<Route path="/applications/new"      element={<PrivateRoute allowedRoles={['platform_admin']}><ApplicationEdit /></PrivateRoute>} />
<Route path="/applications/:id/edit" element={<PrivateRoute allowedRoles={['platform_admin']}><ApplicationEdit /></PrivateRoute>} />
```

### 6. Sidebar — `src/components/Layout.tsx`
Add to `allNavItems`:
```tsx
{ path: '/applications', label: 'Applications', icon: AppWindow, roles: ['platform_admin'] }
```
Use the `AppWindow` lucide icon.

## Error handling
Every catch block uses `parseApiError(err)` + `toast.error()` (plus
`setFieldErrors(fields)` when returned). No `alert()` / `window.confirm()`.

## Testing
Manual verification against the running backend (login as `platform_admin`):
list, create (name + selected api_names), edit (toggle `allow_all`, change api_names →
verify replace), delete, search, filter by status, CSV export. Optional Playwright spec
mirroring an existing entity spec under `e2e/`.

## Out of scope
- Changing the runtime `x-app-id` source.
- Editing the api-catalog itself.
- `details` remove/update operations (replace semantics only).
