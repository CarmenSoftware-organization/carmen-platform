# Platform RBAC — Frontend Phase 2 (Role Management + Permission Catalog) Plan

> **For agentic workers:** Implement task-by-task. Phase 1 (foundation: `hasPermission`, `<Can>`, `PrivateRoute.requiredPermission`, `effectivePermissions`) is DONE on this branch. This phase builds the Role admin UI against the live backend endpoints. **Copy the closest existing example** (ClusterManagement / ClusterEdit / clusterService) and adapt — do not invent layouts.

**Goal:** Role admin UI — `roleService` + `permissionService`, a `RoleManagement` list page, a `RoleEdit` page with an accordion permission picker, a read-only Permission Catalog page, and their routes + a "Roles" nav item.

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`, branch `feat/platform-rbac-frontend-phase1` (continuing on it).

**Backend contract (live, verified):**
- `GET /api-system/platform/roles?<query>` → `{ data: [{ id, name, description, is_active, created_at, updated_at, permission_count }], paginate: { total, page, perpage, pages } }`
- `GET /api-system/platform/roles/:id` → `{ data: { id, name, description, is_active, permissions: string[] } }` (permissions are `"resource.action"` keys)
- `POST /api-system/platform/roles` body `{ name, description?, is_active?, permissions: { add: string[] } }` → `{ data: { id } }`
- `PUT /api-system/platform/roles/:id` body `{ name?, description?, is_active?, permissions: { add: string[], remove: string[] } }` → `{ data: { id } }`
- `DELETE /api-system/platform/roles/:id`
- `GET /api-system/platform/permissions` → `{ data: [{ id, resource, action, description, key }], paginate }` (key = `"resource.action"`)

Response unwrap convention everywhere: `response.data.data || response.data`.

**Verify:** `CI=true bun run build` must pass after each task. No unit runner (Vitest pending) — verification is build + manual.

---

## Task 1: Services

**Files:** create `src/services/roleService.ts` and `src/services/permissionService.ts`.

- [ ] **Step 1: `permissionService.ts`** (read-only catalog)
```ts
import api from './api';
import type { PermissionCatalogItem } from '../types';

const permissionService = {
  getCatalog: async (): Promise<PermissionCatalogItem[]> => {
    const response = await api.get('/api-system/platform/permissions');
    const body = response.data?.data ?? response.data;
    const items = Array.isArray(body) ? body : body?.data ?? [];
    return (items as Array<Partial<PermissionCatalogItem>>).map((p) => ({
      key: p.key ?? `${p.resource}.${p.action}`,
      resource: p.resource ?? '',
      action: p.action ?? '',
      description: p.description,
    }));
  },
};

export default permissionService;
```

- [ ] **Step 2: `roleService.ts`** (copy `clusterService.ts` shape; base path `/api-system/platform/roles`). Create/update take a flat shape and forward the `{ add, remove }` permission payload computed by the caller:
```ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type { PaginateParams } from '../types';

const defaultSearchFields = ['name', 'description'];

export interface RoleWriteData {
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: { add: string[]; remove?: string[] }; // "resource.action" keys
}

const roleService = {
  getAll: async (paginate: PaginateParams = {}) => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      defaultSearchFields,
      typeof paginate.filter === 'object' && !Array.isArray(paginate.filter) ? (paginate.filter as Record<string, unknown>) : {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/platform/roles?${q.toQueryString()}`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/api-system/platform/roles/${id}`);
    return response.data;
  },
  create: async (data: RoleWriteData) => {
    const body = {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      permissions: { add: data.permissions.add },
    };
    const response = await api.post('/api-system/platform/roles', body);
    return response.data;
  },
  update: async (id: string, data: RoleWriteData) => {
    const body = {
      name: data.name,
      description: data.description,
      is_active: data.is_active,
      permissions: { add: data.permissions.add, remove: data.permissions.remove ?? [] },
    };
    const response = await api.put(`/api-system/platform/roles/${id}`, body);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/api-system/platform/roles/${id}`);
    return response.data;
  },
};

export default roleService;
```

- [ ] **Step 3:** `CI=true bun run build` passes.
- [ ] **Step 4:** Commit `git commit -m "feat(rbac): roleService + permissionService"`.

---

## Task 2: Permission picker component

**File:** create `src/components/PermissionPicker.tsx`.

No `accordion`/`checkbox` primitives exist — use native `<details>`/`<summary>` + native checkboxes styled with Tailwind. The picker groups the catalog by resource; each resource is a collapsible row with per-action checkboxes and a "Select all" toggle. Controlled component: value/onChange over a `string[]` of selected keys. Disabled in read-only mode (the page renders badges instead when not editing — see Task 4).

- [ ] **Step 1: implement**
```tsx
import React, { useMemo } from 'react';
import type { PermissionCatalogItem } from '../types';
import { Badge } from './ui/badge';

interface PermissionPickerProps {
  catalog: PermissionCatalogItem[];
  value: string[];                 // selected "resource.action" keys
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const PermissionPicker: React.FC<PermissionPickerProps> = ({ catalog, value, onChange, disabled }) => {
  // group by resource, preserving catalog order
  const groups = useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const p of catalog) {
      map.set(p.resource, [...(map.get(p.resource) ?? []), p]);
    }
    return Array.from(map.entries());
  }, [catalog]);

  const selected = useMemo(() => new Set(value), [value]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };

  const toggleAll = (resource: string, keys: string[]) => {
    const allOn = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    if (allOn) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    onChange([...next]);
  };

  return (
    <div className="space-y-2">
      {groups.map(([resource, items]) => {
        const keys = items.map((i) => i.key);
        const onCount = keys.filter((k) => selected.has(k)).length;
        const allOn = onCount === keys.length;
        return (
          <details key={resource} className="rounded-md border border-input bg-card" open={onCount > 0}>
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium select-none">
              <span className="flex items-center gap-2">
                {resource}
                {onCount > 0 && <Badge variant="secondary" className="text-[10px]">{onCount}/{keys.length}</Badge>}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => { e.preventDefault(); toggleAll(resource, keys); }}
                >
                  {allOn ? 'Clear all' : 'Select all'}
                </button>
              )}
            </summary>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
              {items.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm" title={p.description}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selected.has(p.key)}
                    onChange={() => toggle(p.key)}
                    disabled={disabled}
                  />
                  <span>{p.action}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default PermissionPicker;
```
- [ ] **Step 2:** `CI=true bun run build` passes.
- [ ] **Step 3:** Commit `git commit -m "feat(rbac): PermissionPicker (accordion, native details/checkbox)"`.

---

## Task 3: Permission Catalog page (read-only)

**File:** create `src/pages/PermissionCatalog.tsx`. This is a small read-only reference (like the PrintTemplateMapping exception) — NOT a full Management page. Cards grouped by resource.

- [ ] **Step 1: implement** — header (back to /platform/roles + title), load catalog via `permissionService.getCatalog()` in `useEffect` (loading + error states; use `getErrorDetail`), group by resource, render a `Card` per resource listing each `key` (mono) + description. Include the standard page wrapper (`space-y-4 sm:space-y-6`), page title (`text-2xl sm:text-3xl font-bold tracking-tight`), `Loader2` spinner while loading, `EmptyState` if empty, and a dev debug Sheet (`import.meta.env.DEV`) showing the raw catalog. Use `toast.error` + `parseApiError` in the catch. Reference the header/title/debug-sheet markup from `ClusterManagement.tsx`.
- [ ] **Step 2:** `CI=true bun run build` passes.
- [ ] **Step 3:** Commit `git commit -m "feat(rbac): Permission Catalog page"`.

---

## Task 4: RoleManagement page

**File:** create `src/pages/RoleManagement.tsx`. **Copy `src/pages/ClusterManagement.tsx`** and adapt. Read that file first.

- [ ] **Step 1: implement** with these deltas from ClusterManagement:
  - Service: `roleService`. Entity label "Role". localStorage keys `*_roles` (e.g. `perpage_roles`, `search_roles`, `sort_roles`, `page_roles`).
  - State: `roles`, `totalRows`, `loading`, `error`, `searchTerm`, `statusFilter` (active filter), `showFilters`, `rawResponse`, `paginate`, `copied`, `deleteId`.
  - `fetchRoles`: `const data = await roleService.getAll(params); setRawResponse(data); const items = data.data || data; setRoles(items); setTotalRows(data.paginate?.total ?? items.length);`
  - Columns (`useMemo`, deps `[navigate, handleDelete]`): `name`, `description`, a `permission_count` column rendering `<Badge variant="secondary">{row.original.permission_count ?? 0}</Badge>`, `is_active` rendering `<Badge variant={row.original.is_active ? 'success' : 'secondary'}>{row.original.is_active ? 'Active' : 'Inactive'}</Badge>`, and an actions dropdown (Edit → `navigate(\`/platform/roles/\${row.original.id}/edit\`)`, Delete → `setDeleteId(row.original.id)`). Do NOT add a `#` column.
  - Header row: title "Roles" + a button "Permission Catalog" (`variant="outline"`, navigate `/platform/permissions`) + Export CSV + "Add Role" (`navigate('/platform/roles/new')`).
  - Active filter Sheet (Active/Inactive) building `paginate.advance` per the CLAUDE.md single-boolean rule: `statusFilter.length === 1 ? JSON.stringify({ where: { is_active: statusFilter[0] === 'true' } }) : ''`.
  - CSV export columns: `[{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'permission_count', label: 'Permissions' }, { key: 'is_active', label: 'Active' }]`.
  - Debounced search (400ms), `useGlobalShortcuts({ onSearch })`, loading/empty/datatable decision table, loading overlay, dev debug Sheet (label `GET /api-system/platform/roles`).
  - Delete: `<ConfirmDialog>` calling `roleService.delete(deleteId)` then refetch + `toast.success`. Use `parseApiError` + `toast.error` in catches.
- [ ] **Step 2:** `CI=true bun run build` passes.
- [ ] **Step 3:** Commit `git commit -m "feat(rbac): RoleManagement page"`.

---

## Task 5: RoleEdit page

**File:** create `src/pages/RoleEdit.tsx`. **Copy `src/pages/ClusterEdit.tsx`** and adapt. Read it first.

- [ ] **Step 1: implement** with these deltas:
  - `FormData` interface: `{ name: string; description: string; is_active: boolean; permissions: string[] }`.
  - State per the Edit pattern: `id` (useParams), `isNew = !id`, `formData`, `savedFormData`, `loading`, `editing` (new ⇒ true), `saving`, `error`, `rawResponse`, `fieldErrors`, `copied`. PLUS `catalog: PermissionCatalogItem[]` and `originalPermissions: string[]` (the permissions as loaded, for diffing on update).
  - On mount: always load the catalog (`permissionService.getCatalog()` → `setCatalog`). If `!isNew`, load the role (`roleService.getById(id)`): map `const r = data.data || data;` into `{ name, description: r.description ?? '', is_active: r.is_active ?? true, permissions: r.permissions ?? [] }`; `setFormData(loaded); setSavedFormData(loaded); setOriginalPermissions(r.permissions ?? []);`.
  - Header: back button (→ `/platform/roles`) + title (`isNew ? 'New Role' : formData.name`) + Edit/Cancel toggle (existing-only) with stash-restore (`savedFormData`).
  - Card "Role Details": `name` (required, edit Input / ReadOnlyText), `description` (Textarea / ReadOnlyText), `is_active` (checkbox in edit; `<Badge variant={is_active?'success':'secondary'}>` in read-only).
  - Card "Permissions": when `editing`, render `<PermissionPicker catalog={catalog} value={formData.permissions} onChange={(next) => setFormData(f => ({ ...f, permissions: next }))} />`. When read-only, render the granted permissions grouped by resource as `<Badge variant="secondary">` chips (group `formData.permissions` by the part before the first `.`); show "No permissions" if empty.
  - `useUnsavedChanges(hasChanges)` where `hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData)`. `useGlobalShortcuts({ onSave, onCancel })`.
  - Validation: `name` required — on blur run `validateField('name', value)`; pre-submit re-validate name, abort if empty.
  - Save handler:
    ```ts
    const desired = formData.permissions;
    if (isNew) {
      const result = await roleService.create({ name: formData.name, description: formData.description, is_active: formData.is_active, permissions: { add: desired } });
      const created = result.data || result;
      toast.success('Role created successfully');
      navigate(created?.id ? `/platform/roles/${created.id}/edit` : '/platform/roles', { replace: true });
    } else {
      const add = desired.filter((p) => !originalPermissions.includes(p));
      const remove = originalPermissions.filter((p) => !desired.includes(p));
      await roleService.update(id!, { name: formData.name, description: formData.description, is_active: formData.is_active, permissions: { add, remove } });
      toast.success('Changes saved successfully');
      await fetchRole();   // reload → resets formData/savedFormData/originalPermissions
      setEditing(false);
    }
    ```
    Wrap in try/catch with `parseApiError` + `toast.error` (+ `setFieldErrors(fields)` if returned).
  - Dev debug Sheet with tabs (track `debugTab`) — at minimum a "Role" tab (raw role response) and a "Catalog" tab (raw catalog). Wrap in `import.meta.env.DEV`.
- [ ] **Step 2:** `CI=true bun run build` passes.
- [ ] **Step 3:** Commit `git commit -m "feat(rbac): RoleEdit page with permission picker"`.

---

## Task 6: Routes + nav

**Files:** modify `src/App.tsx` and `src/components/Layout.tsx`.

- [ ] **Step 1: routes** — add lazy imports + routes (use `requiredPermission`, dogfooding Phase 1; dev-mock grants these in dev):
```tsx
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const RoleEdit = lazy(() => import('./pages/RoleEdit'));
const PermissionCatalog = lazy(() => import('./pages/PermissionCatalog'));
// ...
<Route path="/platform/roles" element={<PrivateRoute requiredPermission="role.read"><RoleManagement /></PrivateRoute>} />
<Route path="/platform/roles/new" element={<PrivateRoute requiredPermission="role.create"><RoleEdit /></PrivateRoute>} />
<Route path="/platform/roles/:id/edit" element={<PrivateRoute requiredPermission="role.update"><RoleEdit /></PrivateRoute>} />
<Route path="/platform/permissions" element={<PrivateRoute requiredPermission="role.read"><PermissionCatalog /></PrivateRoute>} />
```
Match the existing lazy/Suspense pattern in App.tsx (place imports + routes alongside the others).
- [ ] **Step 2: nav** — in `src/components/Layout.tsx` `allNavItems`, add (import a suitable lucide icon, e.g. `ShieldCheck`):
```tsx
{ path: '/platform/roles', label: 'Roles', icon: ShieldCheck, permission: 'role.read' },
```
(Uses the `permission` field added in Phase 1; the Layout filter already honors it. Do not add `roles` to this item.)
- [ ] **Step 3:** `CI=true bun run build` passes. Manually confirm (dev) the "Roles" nav item appears (dev-mock grants `role.read`) and `/platform/roles`, `/platform/roles/new`, `/platform/permissions` render.
- [ ] **Step 4:** Commit `git commit -m "feat(rbac): platform roles routes + nav item"`.

---

## Final verification
- [ ] `CI=true bun run build` passes clean.
- [ ] Phase 1 primitives unchanged; existing pages/nav unaffected.
- [ ] (Manual, when backend reachable) list roles, open a seeded role (e.g. `platform_admin`) → picker reflects its permissions; create a role; edit add/remove permissions; delete; view catalog.

## Coverage vs spec §5.3–5.5
- §5.3 roleService/permissionService/userRoleService(→Phase 3) → Task 1 ✓ (roleService, permissionService)
- §5.4 RoleManagement → Task 4 ✓; RoleEdit + accordion picker → Tasks 2,5 ✓; Permission Catalog page → Task 3 ✓
- §5.5 routes + "Roles" nav → Task 6 ✓
