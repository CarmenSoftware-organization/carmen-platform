# Platform RBAC — Frontend Phase 4 (Enforcement Rollout) Plan

> **For agentic workers:** Phases 1–3 are DONE on this branch. This phase migrates page/nav/button access from the legacy 5-role checks to permission checks across all entities. **SAFETY FIRST** (this is a breaking access-control change):
> - **Do NOT change the login access gate** and **do NOT remove `ALLOWED_ROLES` or `hasRole`.** They are kept as a transitional safety net so existing role-based users can still LOG IN even before they have platform-role assignments. (Fully removing them is a later operational step once all users are migrated.)
> - The `userCount <= 1` escape hatch in `hasPermission` stays.
> - `PrivateRoute` keeps supporting `allowedRoles` (don't remove the prop/logic) — we just stop passing it on entity routes.
> - In dev, the dev-mock grants all platform permissions, so the app stays fully usable while developing.

**Goal:** Entity routes use `requiredPermission`; nav items use `permission`; Add/Edit/Delete actions are wrapped in `<Can>`. Backend remains the real gate (403); this is UI alignment.

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform`, branch `feat/platform-rbac-frontend-phase1`.

**Permission map (resource per entity — note business-units use `cluster.*`, BU is not a separate resource):**
| Entity | routes | nav `permission` | read/create/update/delete |
|--------|--------|------------------|---------------------------|
| clusters | `/clusters`, `/clusters/new`, `/clusters/:id/edit` | `cluster.read` | cluster.read / cluster.create / cluster.update / cluster.delete |
| business-units | `/business-units[...]` | `cluster.read` | cluster.* |
| users | `/users[...]` | `user.read` | user.* |
| report-templates | `/report-templates[...]` | `report_template.read` | report_template.* |
| print-template-mapping | `/print-template-mapping[...]` | `print_template_mapping.read` | print_template_mapping.* |
| applications | `/applications[...]` | `application.read` | application.* |
| news | `/news[...]` | `news.read` | news.* |
| broadcasts | `/broadcasts/new` | `broadcast.send` | broadcast.send |

**Verify:** `CI=true bun run build` passes after each task.

---

## Task 1: Routes → requiredPermission (App.tsx)

**File:** modify `src/App.tsx`.

- [ ] For each entity route group, replace `allowedRoles={[...]}` with `requiredPermission="<key>"`:
  - `/clusters` → `requiredPermission="cluster.read"`; `/clusters/new` → `cluster.create`; `/clusters/:id/edit` → `cluster.update`
  - `/applications` → `application.read`; `/new` → `application.create`; `/:id/edit` → `application.update`
  - `/business-units` → `cluster.read`; `/new` → `cluster.create`; `/:id/edit` → `cluster.update` (these currently have NO guard — add the requiredPermission)
  - `/users` → `user.read`; `/new` → `user.create`; `/:id/edit` → `user.update` (currently no guard — add)
  - `/report-templates` → `report_template.read`; `/new` → `report_template.create`; `/:id/edit` → `report_template.update`
  - `/print-template-mapping` → `print_template_mapping.read`; `/new` → `print_template_mapping.create`; `/:id/edit` → `print_template_mapping.update`
  - `/news` → `news.read`; `/new` → `news.create`; `/:id/edit` → `news.update`
  - `/broadcasts/new` → `broadcast.send`
  - Leave `/dashboard`, `/profile`, `/platform/*` (already done), and public routes unchanged.
- [ ] Do NOT remove the `allowedRoles` prop from `PrivateRoute` (it stays supported). Just stop passing it on these routes.
- [ ] `CI=true bun run build` passes. Commit `git commit -m "feat(rbac): entity routes use requiredPermission"`.

---

## Task 2: Nav → permission (Layout.tsx)

**File:** modify `src/components/Layout.tsx`.

- [ ] In `allNavItems`, replace each item's `roles: [...]` with `permission: '<key>'` per the map (and ADD `permission` to items currently without a gate: Business Units → `cluster.read`, Users → `user.read`):
```tsx
{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
{ path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read' },
{ path: '/business-units', label: 'Business Units', icon: Building2, permission: 'cluster.read' },
{ path: '/users', label: 'Users', icon: Users, permission: 'user.read' },
{ path: '/report-templates', label: 'Report Templates', icon: FileText, permission: 'report_template.read' },
{ path: '/print-template-mapping', label: 'Print Mapping', icon: Printer, permission: 'print_template_mapping.read' },
{ path: '/news', label: 'News', icon: Newspaper, permission: 'news.read' },
{ path: '/applications', label: 'Applications', icon: AppWindow, permission: 'application.read' },
{ path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, permission: 'broadcast.send' },
{ path: '/platform/roles', label: 'Roles', icon: ShieldCheck, permission: 'role.read' },  // already added in Phase 2
```
- [ ] Keep the filter as the AND of both gates (it already is): `(!item.roles || hasRole(item.roles)) && (!item.permission || hasPermission(item.permission))`. Do NOT remove the `hasRole`/`roles` branch (transitional).
- [ ] `CI=true bun run build` passes. Commit `git commit -m "feat(rbac): nav items use permission"`.

---

## Task 3: `<Can>` on Management pages (Add + row actions)

**Files:** the 8 Management pages: `ClusterManagement.tsx`, `BusinessUnitManagement.tsx`, `UserManagement.tsx`, `ReportTemplateManagement.tsx`, `PrintTemplateMappingManagement.tsx`, `ApplicationManagement.tsx`, `NewsManagement.tsx`, and the broadcast entry (no management list — skip).

For EACH page (read it; find the "Add" button and the row Edit/Delete actions):
- [ ] Import `Can` from `../components/Can`.
- [ ] Wrap the header "Add <X>" button in `<Can permission="<resource>.create"> ... </Can>`.
- [ ] In the actions column, wrap the Edit menu-item/button in `<Can permission="<resource>.update">` and the Delete one in `<Can permission="<resource>.delete">`. (Row-level scope: if the row has a `cluster_id`, pass `clusterId={row.original.cluster_id}`; for cluster rows pass `clusterId={row.original.id}`. Where a row has no obvious cluster id, omit `clusterId` — the broad check applies.)
- [ ] PrintTemplateMappingManagement is a config page (different layout) — wrap its primary add/edit affordances in `<Can permission="print_template_mapping.create"|"...update">` as applicable.
- [ ] Resource per file: Cluster→`cluster`, BusinessUnit→`cluster`, User→`user`, ReportTemplate→`report_template`, PrintTemplateMapping→`print_template_mapping`, Application→`application`, News→`news`.
- [ ] `CI=true bun run build` passes. Commit `git commit -m "feat(rbac): gate Add/Edit/Delete on Management pages with <Can>"`.

---

## Task 4: `<Can>` on Edit pages (Edit toggle + delete)

**Files:** the 8 Edit pages: `ClusterEdit.tsx`, `BusinessUnitEdit.tsx`, `UserEdit.tsx`, `ReportTemplateEdit.tsx`, `PrintTemplateMappingEdit.tsx`, `ApplicationEdit.tsx`, `NewsEdit.tsx`, `BroadcastCompose.tsx`.

For EACH page (read it):
- [ ] Import `Can`.
- [ ] Wrap the "Edit" toggle button (the one that flips read-only → editing on existing records) in `<Can permission="<resource>.update">`. For a record with a cluster scope, pass `clusterId={...}` from the loaded record where available; otherwise omit.
- [ ] If the page has a Delete button, wrap it in `<Can permission="<resource>.delete">`.
- [ ] BroadcastCompose: wrap its Send button in `<Can permission="broadcast.send">`.
- [ ] Do NOT gate the Save/Cancel buttons inside the edit form (once editing, the user is already permitted; route + Edit-toggle gating cover it). Keep new-record create flows working (route gates `*.create`).
- [ ] Resource per file matches Task 3. `CI=true bun run build` passes. Commit `git commit -m "feat(rbac): gate Edit toggle/delete on Edit pages with <Can>"`.

---

## Final verification
- [ ] `CI=true bun run build` passes clean.
- [ ] **Login still works** for users with a legacy `platform_role` (gate unchanged); `ALLOWED_ROLES`/`hasRole` still present.
- [ ] In dev (dev-mock grants all), every page/nav/button remains visible/usable.
- [ ] Grep confirms no entity route still passes `allowedRoles` (all migrated to `requiredPermission`), but `PrivateRoute` still supports `allowedRoles` and `hasRole` still exists.
- [ ] (Manual, backend reachable, a user WITH assignments) confirm a cluster-scoped/limited user sees only permitted nav/pages/buttons; a 403 from the backend on a forbidden action surfaces via toast.

## Deferred (operational, NOT in this phase)
- Removing `ALLOWED_ROLES`/`hasRole` and switching the login gate to "has any effective permission" — do this only AFTER all real users have platform-role assignments, to avoid login lock-out.

## Coverage vs spec §5.6
- routes → requiredPermission → Task 1 ✓
- nav → permission → Task 2 ✓
- `<Can>` on Add/Edit/Delete across entities → Tasks 3,4 ✓
- escape hatch retained; login gate kept safe (transitional) — documented (spec's hard removal intentionally deferred for safety) ✓
