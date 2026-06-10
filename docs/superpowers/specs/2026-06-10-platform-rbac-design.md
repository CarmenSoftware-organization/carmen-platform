# Platform RBAC — Design Spec

**Date:** 2026-06-10
**Status:** Approved design — ready for implementation planning
**Spans:** `carmen-platform` (frontend) + `carmen-turborepo-backend-v2` (backend)
**Build order:** Backend first, then frontend.

---

## 1. Problem & Goal

The platform admin dashboard (`carmen-platform`) currently gates access with a coarse, hardcoded role check: 5 fixed `platform_role` values whitelisted in `AuthContext.tsx`, enforced at route level via `<PrivateRoute allowedRoles={[...]}>` and per nav item via `roles: [...]`. There is no concept of granular, per-resource permissions.

**Goal:** Replace this with a real RBAC system — dynamic roles, each granting a set of `resource.action` permissions, assignable to users with a scope (platform-wide or per-cluster), and enforced throughout the admin UI (nav, routes, action buttons, scope-aware lists).

### This is a NEW, SEPARATE concern from the existing backend RBAC

The backend (`carmen-turborepo-backend-v2`) already has an RBAC system, but it belongs to a **different domain** and must not be touched or conflated:

| | Existing RBAC (do NOT modify) | Platform RBAC (this spec) |
|---|---|---|
| Domain | Tenant ERP — procurement, inventory, vendor, store, etc. | Platform admin — cluster, business unit, user, application, news, broadcast, role |
| Scope | per `business_unit` | Platform (global) + Cluster |
| Tables | `tb_application_role`, `tb_permission`, `tb_application_role_tb_permission`, `tb_user_tb_application_role` | New `tb_platform_*` tables |
| Routes | `/api-system/roles`, `/api-system/permissions`, `/api-system/role-permissions` | `/api-system/platform/...` |

The platform RBAC is built **fresh**, namespaced under `/platform/`, with its own tables. It does **not** reuse or extend the existing application-role tables.

### Reuse conventions, not tables

While the data is separate, we deliberately **mirror the existing system's conventions** so the backend team works from familiar patterns and the result stays consistent:

- Permission shape `{ resource, action }` (same as `tb_permission`).
- Write DTOs use `permissions: { add: string[], remove: string[] }` replace-semantics (same as `ApplicationRoleUpdateDto`; also matches the frontend's existing Application Management pattern).
- Effective permissions are returned as `"resource.action"` strings (same as the existing `GET /api/user/permission` → `permissions: string[]`), but **grouped by scope**.
- Enforcement mirrors the existing `permission.guard.ts` + `@Permission()` decorator pattern, applied to the new platform routes.

---

## 2. Architecture Decision

**Approach A — Server-resolved effective permissions** (chosen over frontend-resolved and CASL-style policy engine).

The backend resolves each user's roles + scopes into a flat, scope-grouped set of permission strings and returns it at login and on profile fetch. The frontend simply checks membership. Backend is the source of truth and the real enforcement gate (returns 403); the frontend only shows/hides UI to match.

Rationale: fits the existing architecture (`AuthContext` already stores `loginResponse`), keeps authorization logic in one place (no client/server drift), is secure (frontend cannot be the gate), and is right-sized for a 2-level scope — no new dependency, no over-engineering.

---

## 3. Permission Model

### Resources (8)
`cluster` (covers business units — BU is not a separate resource), `user`, `report_template`, `print_template_mapping`, `application`, `news`, `broadcast`, `role`.

### Actions
`read`, `create`, `update`, `delete`, plus:
- `send` — broadcast only (`broadcast.read`, `broadcast.send`)
- `manage_roles` — user only (`user.manage_roles`, separate from `user.update`, gates role assignment)

### Permission catalog (~34 keys)
```
cluster.read   cluster.create   cluster.update   cluster.delete
user.read      user.create      user.update      user.delete      user.manage_roles
report_template.read   report_template.create   report_template.update   report_template.delete
print_template_mapping.read  .create  .update  .delete
application.read  application.create  application.update  application.delete
news.read   news.create   news.update   news.delete
broadcast.read   broadcast.send
role.read   role.create   role.update   role.delete
```
The catalog is **seeded by the backend** (mirror `seed.permission.ts`) and exposed read-only. The frontend treats it as a fixed reference.

### Scope (2 levels)
- `platform` — global; the permission applies everywhere.
- `cluster` — the permission applies only within a specific cluster.

A platform-scoped permission satisfies any cluster check (platform admins can act in every cluster).

---

## 4. Backend Design (`carmen-turborepo-backend-v2`) — built first

### 4.1 Prisma (platform schema: `prisma-shared-schema-platform`)

New tables, mirroring existing column/audit conventions (`id` uuid, `is_active`, `created_at`/`created_by_id`/`updated_at`/`updated_by_id`/`deleted_at`/`deleted_by_id`, soft-delete unique with `deleted_at`):

```prisma
model tb_platform_permission {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  resource    String  @db.VarChar
  action      String  @db.VarChar
  description String?
  // audit columns...
  @@unique([resource, action, deleted_at])
}

model tb_platform_role {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @db.VarChar
  description String?
  is_active   Boolean? @default(true)
  // audit columns...
  @@unique([name, deleted_at])
}

model tb_platform_role_tb_permission {
  id                  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platform_role_id    String @db.Uuid
  platform_permission_id String @db.Uuid
  // audit columns...
  @@unique([platform_role_id, platform_permission_id, deleted_at])
}

model tb_user_tb_platform_role {
  id               String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id          String  @db.Uuid
  platform_role_id String  @db.Uuid
  // scope: platform-wide when cluster_id is null, else cluster-scoped
  cluster_id       String? @db.Uuid
  // audit columns...
  @@unique([user_id, platform_role_id, cluster_id, deleted_at])
}
```

**Scope encoding:** the assignment row carries `cluster_id` — `null` ⇒ platform scope; set ⇒ that cluster. (Unlike the existing BU-scoped system where scope is implied by the role's BU; here roles are scope-agnostic and the scope lives on the assignment, so one role can be reused across clusters.)

Default 5 roles (`super_admin`, `platform_admin`, `support_manager`, `support_staff`, `security_officer`) become **seed data** in `tb_platform_role` with permission mappings — not hardcoded enums. They are ordinary editable rows.

### 4.2 Seeds
- `seed.platform-permission.ts` — the ~34 catalog rows.
- `seed.platform-role-permission.ts` — the 5 default roles and their permission sets.

### 4.3 HTTP API (gateway, namespaced under `/api-system/platform/`)

Mirror the existing `application-roles` / `application-permissions` modules (controller + service proxying to the microservice via TCP `ClientProxy`, swagger request/response DTOs).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api-system/platform/roles` | List roles (paginated, server-side) |
| GET | `/api-system/platform/roles/:id` | Role detail incl. its permission keys |
| POST | `/api-system/platform/roles` | Create role |
| PUT | `/api-system/platform/roles/:id` | Update role (replace-semantics permissions) |
| DELETE | `/api-system/platform/roles/:id` | Delete role |
| GET | `/api-system/platform/permissions` | Permission catalog (read-only) |
| GET | `/api-system/platform/users/:id/roles` | List a user's role assignments (with scope) |
| POST | `/api-system/platform/users/:id/roles` | Assign a role to a user with a scope |
| DELETE | `/api-system/platform/users/:id/roles/:assignmentId` | Remove an assignment |

**Role create/update DTO:**
```ts
{
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: { add: string[]; remove: string[] }; // permission keys "resource.action"
}
```

**User-role assignment DTO (POST):**
```ts
{
  role_id: string;
  scope: { type: 'platform' } | { type: 'cluster'; cluster_id: string };
}
```

**Response envelope** follows the repo standard: `{ data, paginate? }`.

### 4.4 Effective permissions at login / profile

The backend resolves the requesting user's platform-role assignments into a scope-grouped permission set and includes it in:
- `POST /api/auth/login` response (alongside the existing `platform_role`, `access_token`)
- `GET /api/user/profile` response

```ts
effective_permissions: {
  platform: string[];                      // ["user.read", "role.update", ...]
  clusters: Record<string, string[]>;      // { "<clusterId>": ["cluster.update", "user.create", ...] }
}
```

### 4.5 Enforcement (gateway)
Mirror `permission.guard.ts` + `@Permission()` decorator for the platform routes: each platform admin endpoint declares the permission(s) it requires; the guard checks the resolved platform permissions (with scope) and returns 403 on failure. Backend enforcement is authoritative.

### 4.6 Scope-aware list filtering
List endpoints for scoped resources (clusters, business units under a cluster, users, report templates) **auto-filter by the caller's scope** derived from their token/assignments — the frontend does not send a scope param. A platform-scoped user sees everything; a cluster-scoped user sees only their cluster(s).

---

## 5. Frontend Design (`carmen-platform`) — built after backend

### 5.1 Types (`src/types/index.ts`)
```ts
export type Scope = { type: 'platform' } | { type: 'cluster'; cluster_id: string };
export interface EffectivePermissions { platform: string[]; clusters: Record<string, string[]>; }
export interface Role { id: string; name: string; description?: string; is_active?: boolean; permissions: string[]; }
export interface PermissionCatalogItem { key: string; resource: string; action: string; description?: string; }
export interface UserRoleAssignment { id: string; user_id: string; role_id: string; role_name?: string; scope: Scope; }
```

### 5.2 Permission primitives

**`AuthContext`** — replace `hasRole` with `hasPermission`, store `effectivePermissions` (from login/profile, persisted like `loginResponse`):
```ts
hasPermission(key: string, opts?: { clusterId?: string }): boolean
```
Resolution rules:
1. If `key` ∈ `effectivePermissions.platform` ⇒ allowed (everywhere).
2. If `opts.clusterId` given ⇒ allowed iff platform has it **or** `clusters[clusterId]` includes it.
3. If no `clusterId` (broad check, e.g. to show a nav item) ⇒ allowed iff `key` is in platform **or in any cluster's list** ("can do it somewhere").
4. **Escape hatch retained:** `userCount <= 1` ⇒ allow all (first-admin bootstrap).

Extract the pure resolution into `src/utils/permissions.ts` so it is unit-testable once Vitest lands.

**`<Can>`** (`src/components/Can.tsx`) — wraps action UI:
```tsx
<Can permission="user.create">…</Can>                          {/* broad */}
<Can permission="cluster.update" clusterId={row.id}>…</Can>     {/* scoped to a row */}
```
Renders children only when allowed; optional `fallback`.

**`PrivateRoute`** — add `requiredPermission` prop (replaces `allowedRoles`); shows the existing `<AccessDenied>` when lacking.

**Nav (`Layout.tsx`)** — each item carries `permission: 'xxx.read'` (replaces `roles`); filtered with `hasPermission`.

### 5.3 Services (follow `clusterService.ts` shape)
| Service | Base | Methods |
|---------|------|---------|
| `roleService.ts` | `/api-system/platform/roles` | getAll, getById, create, update, delete |
| `permissionService.ts` | `/api-system/platform/permissions` | getCatalog |
| `userRoleService.ts` | `/api-system/platform/users/:id/roles` | list, add, remove |

Write mapping: form's flat `permissions: string[]` → `{ add, remove }` diff vs the role's current set (mirrors Application Management's `details.add` mapping).

### 5.4 Pages (two-page pattern)

**`RoleManagement.tsx`** (copy `ClusterManagement.tsx`) — server-side DataTable, debounced search, active filter Sheet, CSV export, dev debug Sheet. Columns: `name`, `description`, permission count (Badge), `is_active` (`<Badge variant="success"|"secondary">`), row actions.

**`RoleEdit.tsx`** (copy `ClusterEdit.tsx`) — form (name, description, is_active) + **Permission Picker: accordion grouped by resource**, each resource a collapsible row with action checkboxes (`read/create/update/delete/...`) and a "Select all" toggle; read-only mode shows granted permissions as badges grouped by resource. Edit/Cancel stash pattern, `useUnsavedChanges`, `Ctrl/⌘+S`, `Escape`, `validateField` on blur.

**Permission Catalog** (`/platform/permissions`, read-only) — not a full Management page (small static reference, like the PrintTemplateMapping exception). Cards grouped by resource listing each `key` + description.

**User → Role assignment** — add a "Roles & Scope" card to `UserEdit.tsx`: lists current assignments (role name + scope badge: "Platform" or cluster name), an "Add role" dialog (select role + select scope: Platform or pick a cluster), and per-row remove. Gated by `user.manage_roles`. Calls `userRoleService`.

### 5.5 Routes & nav
```tsx
<Route path="/platform/roles"          element={<PrivateRoute requiredPermission="role.read"><RoleManagement/></PrivateRoute>} />
<Route path="/platform/roles/new"      element={<PrivateRoute requiredPermission="role.create"><RoleEdit/></PrivateRoute>} />
<Route path="/platform/roles/:id/edit" element={<PrivateRoute requiredPermission="role.update"><RoleEdit/></PrivateRoute>} />
<Route path="/platform/permissions"    element={<PrivateRoute requiredPermission="role.read"><PermissionCatalog/></PrivateRoute>} />
```
Add a "Roles" nav item (`permission: 'role.read'`).

### 5.6 Enforcement rollout (migration)
Across all 8 entity page pairs: replace every `hasRole`/`allowedRoles` usage with permission checks; wrap Add/Edit/Delete actions in `<Can>` (Add → `resource.create`; row Edit/Delete → `resource.update`/`resource.delete` with the row's `clusterId`, or `row.id` for cluster itself); on Edit pages, hide the Edit toggle when the user lacks `update` for that record's scope. Remove `hasRole`/`ALLOWED_ROLES`; the login gate becomes "has any effective permission" instead of a 5-role whitelist. Lists rely on backend auto-filtering; the frontend uses `row.cluster_id` only for button checks. Entities spanning multiple clusters fall back to a platform-level check and otherwise rely on the backend 403 (handled via `parseApiError` + `toast.error`).

---

## 6. Phasing

Each phase is its own spec→plan→implement cycle. Backend precedes frontend.

- **Phase B (backend, first):** Prisma tables + migration, seeds, platform RBAC modules/endpoints under `/platform/`, guard/decorator, effective-permission resolution in login/profile, scope-aware list filtering.
- **Phase 1 (frontend foundation):** types, `hasPermission` + `effectivePermissions` in `AuthContext`, `<Can>`, `PrivateRoute.requiredPermission`, nav `permission` field, `utils/permissions.ts`. A dev-only mock fixture (`process.env.NODE_ENV === 'development'`) lets the frontend be built/tested before the backend deploy lands.
- **Phase 2:** `roleService` + `permissionService`, `RoleManagement` + `RoleEdit` (accordion picker), Permission Catalog page, routes + nav.
- **Phase 3:** `userRoleService` + "Roles & Scope" card in `UserEdit`.
- **Phase 4:** enforcement rollout across all 8 entities; remove `hasRole`/`ALLOWED_ROLES`; change login gate.

---

## 7. Testing
- The pure `hasPermission` resolver lives in `utils/permissions.ts` for unit testing once Vitest is set up (currently a pending repo item; no unit runner yet).
- Until then: Playwright E2E (page-object pattern in `e2e/`) over the core flow — create role → assign to user with scope → verify nav/buttons show/hide correctly — using the Phase-1 dev mock fixture.
- Every catch block uses `parseApiError(err)` + `toast.error()`, including backend 403s.

---

## 8. Out of Scope (YAGNI)
- Attribute-based conditions beyond resource/action/scope.
- A third scope level (business-unit) — BU is covered under cluster scope.
- Role inheritance / composition.
- Editing the permission catalog from the UI (catalog is backend-seeded, read-only).
- Touching or migrating the existing tenant-ERP application-role RBAC.
