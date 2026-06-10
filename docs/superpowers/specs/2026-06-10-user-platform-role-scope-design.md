# User Platform (Role & Scope Config) — Design

**Date:** 2026-06-10
**Status:** Approved, pending implementation plan

## Summary

Move per-user role/scope assignment out of the User edit page into a dedicated
two-page feature under the **Platform** sidebar group. Today the "Roles & Scope"
card lives inside `src/pages/UserEdit.tsx` (lines ~930–1059). After this change,
the User page no longer touches roles; role/scope is managed only from the new
**User Platform** pages.

## Goals

- New list page to pick a user, plus an edit page to manage that user's role/scope.
- Both pages live under the Platform nav group, gated by new `user_platform.*`
  permissions.
- Remove the Roles & Scope card and all its supporting code from `UserEdit.tsx`.
- Reuse existing services — **no new service layer**.

## Non-Goals

- No backend changes in this repo. Seeding `user_platform.read` /
  `user_platform.manage` into the permission catalog and assigning them to roles
  is done in `carmen-turborepo-backend-v2` by the user (see Backend Dependency).
- No change to the role/scope data model, `userRoleService`, or assignment API.
- No roles-count column on the list (would require N+1 fetches).

## Architecture

| Concern | File | Status | Services used |
|---|---|---|---|
| List (pick a user) | `src/pages/UserPlatformManagement.tsx` | new | `userService.getAll` |
| Config role/scope | `src/pages/UserPlatformEdit.tsx` | new | `userService.getById`, `userRoleService`, `roleService.getAll`, `clusterService.getAll` |
| Nav item | `src/components/Layout.tsx` | edit | — |
| Routes | `src/App.tsx` | edit | — |
| Remove card | `src/pages/UserEdit.tsx` | edit | drops `userRoleService` |

Shared types `UserRoleAssignment` and `Scope` already exist in
`src/types/index.ts` — no type changes needed.

## Backend Dependency (out of scope for this repo)

`user_platform.read` and `user_platform.manage` are a **new permission resource**
that does not exist in the backend catalog yet (current resources: application,
broadcast, cluster, news, print_template_mapping, report_template, role, user).
The catalog is served by `permissionService.getCatalog()` from the backend.

Until these two permissions are seeded into the backend catalog **and** assigned
to the appropriate roles, the nav item and routes will be hidden for everyone
(frontend gates on a permission nobody holds). This backend work happens in
`carmen-turborepo-backend-v2` and is the user's responsibility.

## Permissions

| Key | Gates |
|---|---|
| `user_platform.read` | Nav item, both routes, viewing the list + a user's assignments |
| `user_platform.manage` | Add / remove role assignment buttons (wrapped in `<Can>`) |

## Page 1 — `UserPlatformManagement.tsx` (list)

Standard Management page (CLAUDE.md rule 13), copied from the closest existing
example (`UserManagement.tsx`, trimmed):

- Header row: title + Export CSV button.
- Card: debounced search (400ms) + filter Sheet (active status) + active-filter
  badges.
- CardContent: `TableSkeleton` / `EmptyState` / server-side `DataTable` + loading
  overlay (per the Loading States Decision Table).
- Columns: **Name**, **Email / Username**, **Status** (`<Badge variant="success" | "secondary">`).
  No row-index column (DataTable adds its own). No roles-count column.
- Row click → `navigate('/platform/user-platform/:userId')`.
- CSV export of user identity fields (per rule 13 convention).
- Dev-only debug Sheet (`process.env.NODE_ENV === 'development'`), raw response in
  `rawResponse`.
- `Ctrl/⌘+K` focuses search.
- State shape per CLAUDE.md: `items`, `totalRows`, `loading`, `error`,
  `searchTerm`, `statusFilter`, `showFilters`, `rawResponse`, `copied`,
  `paginate` (`{ page, perpage, search, sort }`). Persist `perpage` as
  `perpage_user_platform`.

## Page 2 — `UserPlatformEdit.tsx` (role/scope config)

A **config sub-page**, intentionally deviating from rule 14 (same spirit as
`PrintTemplateMappingEdit.tsx`): no user-field form, no edit/read-only toggle, no
Save button. Assignments persist immediately on add/remove.

Layout:

- Header: back button + the user's name / email rendered read-only.
- **Roles & Scope card** — lifted verbatim from `UserEdit.tsx` (current lines
  ~930–1059):
  - List current assignments; each row shows `role_name` + a scope badge
    (`Platform` or the cluster name resolved from `clusterOptions`).
  - Inline Add Role form: role `<select>` (from `roleService.getAll`), scope
    `<select>` (`platform` | `cluster`), and a cluster `<select>` shown when scope
    is `cluster`.
  - Remove via `<ConfirmDialog>` (never `window.confirm`).
  - Add/remove controls wrapped in `<Can permission="user_platform.manage">`.
- Loads on mount (`:userId` from `useParams`):
  - `userService.getById(userId)` → header identity.
  - `userRoleService.list(userId)` → assignments.
  - `roleService.getAll({ perpage: 200, sort: 'name:asc' })` → role options.
  - `clusterService.getAll({ perpage: 200, sort: 'name:asc' })` → cluster options.
- Handlers ported as-is: `handleAddRole` (builds `Scope`, calls
  `userRoleService.add`, re-lists), `handleRemoveRole` (calls
  `userRoleService.remove`, re-lists). Catches use `parseApiError` + `toast.error`.
- Dev-only debug Sheet.

## Removal from `UserEdit.tsx`

Delete the Roles & Scope feature so the User page no longer manages roles:

- Remove the Roles & Scope `Card` (current lines ~930–1059), including the inline
  Add Role form and its `ConfirmDialog`.
- Remove state: `roleAssignments`, `roleOptions`, `showAddRole`, `selectedRoleId`,
  `scopeType`, `scopeClusterId`, `addingRole`, `deleteRoleAssignment`.
- Remove handlers: `handleAddRole`, `handleRemoveRole`.
- Remove the load block that calls `userRoleService.list` and the
  `roleService.getAll` → `roleOptions` fetch (current lines ~209–214).
- **Keep** `clusterService` / `clusterOptions` — still used by the Business Units
  section.
- Remove now-unused imports: `userRoleService`, and `UserRoleAssignment` / `Scope`
  type imports. Re-check `ShieldCheck` and `roleService` — remove only if no other
  usage remains in the file.

## Sidebar + Routes

`src/components/Layout.tsx` — add to the Platform group in `allNavItems`:

```tsx
{ path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' }
```

`src/App.tsx`:

```tsx
<Route path="/platform/user-platform" element={<PrivateRoute requiredPermission="user_platform.read"><UserPlatformManagement /></PrivateRoute>} />
<Route path="/platform/user-platform/:userId" element={<PrivateRoute requiredPermission="user_platform.read"><UserPlatformEdit /></PrivateRoute>} />
```

## Testing / Verification

- `bun run build` (or `CI=true bun run build`) passes with no TypeScript or ESLint
  errors — confirms the `UserEdit.tsx` removals left no dangling references.
- Manual: with `user_platform.read` held, the nav item appears under Platform, the
  list loads, row click opens the config page, and add/remove role works; with
  `user_platform.manage` absent, the add/remove controls are hidden.
- Confirm the User edit page no longer shows the Roles & Scope card.

## Open Risks

- The page is invisible until the backend seeds the two permissions — expected and
  documented above, not a frontend bug.
