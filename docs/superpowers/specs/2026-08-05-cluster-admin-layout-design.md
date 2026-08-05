# Cluster Admin — a separate layout, route-space, and authorization boundary

**Date:** 2026-08-05
**Status:** Approved (design reviewed section by section)
**Repos:** `carmen-platform` (frontend) **and** `carmen-turborepo-backend-v2` (backend) —
one spec, two implementation plans
**Touches (frontend):** `src/components/Layout.tsx`, `src/components/nav/` (new),
`src/components/ClusterAdminLayout.tsx` (new), `src/components/ClusterAdminRoute.tsx` (new),
`src/components/HeaderUserMenu.tsx`, `src/components/Breadcrumbs.tsx`,
`src/context/AuthContext.tsx`, `src/pages/clusterAdmin/` (new),
`src/services/clusterAdminService.ts` (new), `src/pages/clusterEdit/sections/DetailsSection.tsx`,
`src/types/index.ts`, `src/App.tsx`
**Touches (backend):** `apps/backend-gateway/src/platform/platform_clusters/`,
`apps/backend-gateway/src/platform/platform_business-units/`,
`apps/backend-gateway/src/platform/platform_me-admin-clusters/` (new),
`apps/micro-cluster/src/cluster/cluster/cluster.service.ts`,
`apps/micro-cluster/src/cluster/business-unit/business-unit.service.ts`,
`apps/micro-cluster/src/common/cluster-admin-authz.service.ts`

---

## 1. Problem

The admin app has exactly one layout. `Layout.tsx` hardcodes a 16-item nav (lines 58–84)
and filters it with `hasPermission(key)` — no cluster argument. `checkPermission`
(`src/utils/permissions.ts:47`) treats a call with no `clusterId` as a broad
"show a nav item" check that passes when the key exists in **any** cluster:

```ts
return Object.values(eff.clusters ?? {}).some((keys) => keys.includes(key));
```

So a user whose authority stops at one hotel chain still sees *Clusters*, *Business Units*,
*Tenant Migrations*, *Users* — all of them platform-wide lists — plus every Content and
Platform item their keys happen to unlock. The nav promises reach the user does not have.

### 1.1 Two different things are called "cluster admin"

| | Source of truth | Who reads it |
|---|---|---|
| **A — membership admin** | `tb_cluster_user.role = 'admin'` | `ClusterAdminAuthzService` (`isClusterAdmin`, `adminClusterScope`) — the gate on every invitation and user-cluster route |
| **B — cluster-scoped RBAC** | `tb_user_tb_platform_role.cluster_id != null` | `effective_permissions.service.ts` → `effectivePermissions.clusters` → everything the frontend does today |

The frontend knows only B. The backend's cluster-admin feature set is built entirely on A.

**Decision: A is the definition.** `tb_cluster_user.role = 'admin'` is the single source of
truth for "is this person an administrator of this cluster", and `ClusterAdminAuthzService`
is the enforcement point. B keeps its existing role for platform-level pages and is not
extended.

### 1.2 What already works, and what blocks A today

Verified against the gateway controllers and `micro-cluster` services on 2026-08-05.

| Endpoint the new layout needs | Current gate | Effect on a pure membership admin |
|---|---|---|
| `POST/GET/DELETE /api-system/clusters/:cluster_id/invitations`, `POST .../:invitation_id/resend` | `AppIdGuard('clusterInvitation.*')` + `isClusterAdmin` inside `micro-cluster` | ✅ works |
| `GET /api-system/user/clusters` (`getAllUserCluster`) | `adminClusterScope` — fail-closed, empty list rather than 403 | ✅ works |
| `GET /api-system/user/clusters/:cluster_id` (`getUserClusterById`) | `isClusterAdmin` | ✅ works |
| `POST/PUT/DELETE /api-system/user/clusters` | `isClusterAdmin` | ✅ works |
| `GET /api-system/clusters` | `PlatformPermissionGuard` + `RequirePlatformPermission('cluster.read')` | ❌ 403 |
| `PUT /api-system/clusters/:cluster_id` | `RequirePlatformPermission('cluster.update')`; `updateCluster` itself has **no** admin check | ❌ 403 |
| `GET /api-system/clusters/:cluster_id` | `RequirePlatformPermission('cluster.read')`; `getClusterById(id)` takes **no `user_id`** | ❌ 403, and unscoped for anyone who passes the gate |
| `GET /api-system/business-units` | `AppIdGuard('businessUnit.findAll')` only; `listBusinessUnit(paginate)` takes **no `user_id`** | ⚠️ returns every BU on the platform |
| `POST` / `PUT /api-system/business-units` | `AppIdGuard` only; no cluster check in the service | ⚠️ any authenticated caller can create or edit a BU in any cluster |
| Logging in at all | `AuthContext.tsx:138-140` rejects when `platform` is empty **and** `clusters` is empty | ❌ cannot enter the app |

The four working routes were built for this feature — the controller header comment says so
outright ("endpoints a Cluster Admin uses to invite users into their cluster"). The broken
ones are the older platform-era routes.

`PlatformPermissionGuard` cannot close this on its own. Its own header comment describes it
as a **coarse** gate: it passes when the key exists platform-wide **or in any cluster
scope**. It answers "does this person hold `cluster.update` somewhere", never "for *this*
cluster" — the `:cluster_id` is not its business.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | "Cluster admin" means `tb_cluster_user.role = 'admin'` | §1.1 — the backend's whole cluster-admin surface already enforces it |
| D2 | The layout covers: edit own cluster, manage BUs in it, invite users, manage existing members | The four capabilities requested |
| D3 | `clusterId` lives in the URL — `/cluster-admin/:clusterId/*` | Deep-linkable; two clusters in two tabs cannot collide; no hidden global "current cluster" |
| D4 | A user with both authorities can switch views in both directions | Super admins can reproduce what a customer sees, which `adminClusterScope` already supports (`all: true`) |
| D5 | One spec covering backend and frontend | The layout does not function without the backend gates |
| D6 | Scoped list reads are **fail-closed** | A caller who administers nothing sees nothing, matching `adminClusterScope` and `userBusinessUnitFindAll` |
| D7 | Members and pending invitations share one page, as two tabs | A pending invitation *is* a person who is not a member yet; splitting them makes an admin check two places to answer "did I already invite them", and the backend's 409 (`that email already has membership in this cluster`) is unreadable without both in view |
| D8 | Reuse the existing shell; extract only the nav | `Layout.tsx` already owns sidebar collapse + persistence, the mobile Sheet, breadcrumbs, theme toggle, version badge, and the user menu. Duplicating that is two of everything to fix forever |

### 2.1 Why the boundary sits at the router

`ClusterAdminRoute` resolves the scope once, for `:clusterId`, and every page beneath it
inherits the answer. The alternative — teaching each existing page to scope itself —
scatters the boundary across pages that must then be re-audited on every change.
`PrivateRoute` already establishes this pattern in the repo; this extends it to a scope
bound to a URL parameter.

**The frontend guard is navigation, not security.** Every request underneath it still hits
`isClusterAdmin` on the server. That is what makes it acceptable for the guard to decide
from a cached list (§4.3).

---

## 3. Backend changes — `carmen-turborepo-backend-v2`

### B1 — `GET /api-system/me/admin-clusters` (new)

Answers "which clusters do I administer" in one small call.

```
GET /api-system/me/admin-clusters?search=&page=&perpage=
→ { data: [{ id, name, code, is_active }],
    paginate: { total, page, perpage, pages },
    summary: { all: boolean } }
```

**Why `all` sits inside `summary`.** Corrected 2026-08-05 during implementation, after a review
traced the response through the gateway. `BaseHttpController.respond` always calls
`StdResponse.fromResult`, which duck-types a paginated payload as
`'paginate' in value && 'data' in value && Array.isArray(value.data)` and then rebuilds the body
from `data` and `paginate` alone — **silently dropping every other top-level key**. A flat
`{ all, data, paginate }` matches that test on every call, so `all` never reached the client.
`summary` is the one extra key the envelope explicitly preserves, so it is the channel that
works without modifying a serializer every gateway controller shares.

- Backed directly by `ClusterAdminAuthzService.adminClusterScope(user_id)`.
- `all: true` for platform super admins — `data` then carries a searchable page of all
  clusters rather than the whole table.
- For everyone else `all: false` and `data` is the complete set they administer (realistically
  tens of rows), so a single call is the whole truth.
- Empty result for a caller who administers nothing. Not a 403 — it is a list endpoint.
- New `AppIdGuard` api_name: `clusterAdmin.myClusters`. Regenerate the catalog with
  `bun run scripts/generate-app-api-catalog/run.ts`; never hand-edit
  `app-api-catalog.generated.ts`.

The response shape deliberately mirrors `adminClusterScope`'s `{ all, clusterIds }` so both
layers describe scope the same way.

**Why not reuse `GET /api-system/user/clusters`:** `getAllUserCluster()` returns every
*membership row* of every cluster the caller administers, with no pagination. For a super
admin that is the entire `tb_cluster_user` table in one response.

### B2 — `getClusterById` takes `user_id` and gates on it

`cluster.service.ts:397` — `getClusterById(id)` accepts no caller identity, so anyone who
clears the gateway gate can read any cluster.

New signature `getClusterById(id, user_id)`, allowed when **any** of:

- `isPlatformSuperAdmin(user_id)`
- `isClusterAdmin(user_id, id)`
- `PlatformScopeService.clusterScopeFor(user_id, 'cluster.read')` resolves `all: true` or
  includes `id`

Otherwise `CLUSTER_USER_NOT_CLUSTER_ADMIN`. The gateway route drops
`@RequirePlatformPermission('cluster.read')` so a membership admin reaches the service; the
service is the gate.

### B3 — `listBusinessUnit` takes `user_id` and scopes

`business-unit.service.ts:408` — `listBusinessUnit(paginate)` accepts no caller identity and
returns every business unit on the platform.

New signature `listBusinessUnit(paginate, user_id)`, scoped by a new resolver on
`ClusterAdminAuthzService`:

```ts
// Union of membership-admin scope and cluster-scoped RBAC, WITHOUT inheriting
// PlatformScopeService's fail-open behaviour.
async readableClusterScope(userId): Promise<{ all: boolean; clusterIds: string[] }>
```

Resolution order:

1. `isPlatformSuperAdmin` → `{ all: true }`
2. a **platform-wide** (`cluster_id === null`) role grant of `cluster.read` → `{ all: true }`
3. otherwise → `{ all: false, clusterIds: adminClusterScope.clusterIds ∪ cluster-scoped cluster.read grants }`
4. an empty union → an empty page (**D6, fail-closed**)

Step 4 is where this deviates from `PlatformScopeService`, which returns `{ all: true }` when
a user has no matching role rows at all — a deliberate backward-compatibility choice
documented in that file. Inheriting it here would make the union unconditionally `all: true`
for exactly the users this feature exists to scope, defeating the change.

**Consequence, accepted:** a user with neither a platform-role row nor an admin membership
now sees zero business units where they previously saw all of them. DEV is migrated and
seeded (31 permissions, 5 roles), so this group should be empty; §7 lists the pre-deploy
check that confirms it.

`getBusinessUnitById` (`business-unit.service.ts:464`) is identity-free today too. It takes a
BU id rather than a cluster id, so it resolves the owning cluster with
`clusterIdForBusinessUnit` first, then admits the caller when `readableClusterScope` returns
`all: true` or contains that cluster.

### B4 — `createBusinessUnit` / `updateBusinessUnit` gate on the target cluster

Both take `user_id` already and ignore it for authorization.

- **create** — the caller must clear one of these for `data.cluster_id`:
  `isPlatformSuperAdmin`, `isClusterAdmin(user_id, data.cluster_id)`, or a platform
  `cluster.create` grant covering that cluster. This is the write-side counterpart of
  `readableClusterScope` and differs from it only in the permission key it consults —
  `cluster.create` here, `cluster.update` in the update path, `cluster.read` in B3.
- **update** — resolve the BU's current cluster with `clusterIdForBusinessUnit` and check it.
  When `data.cluster_id` moves the BU, check the destination too. `userBusinessUnitUpdate`
  (lines 725–728) already does exactly this and is the reference.

This closes a gap that exists today; it is not a restriction the feature introduces.

### B5 — `PUT /api-system/clusters/:cluster_id` admits membership admins

Drop `@RequirePlatformPermission('cluster.update')` from the gateway route and make
`updateCluster` the gate — the arrangement the invitations controller already uses, and the
only layer that knows which cluster is being written.

Allowed when `isPlatformSuperAdmin` OR `isClusterAdmin(user_id, id)` OR a platform
`cluster.update` grant covering the cluster.

**Field restriction:** when the caller is a membership admin without a platform
`cluster.update` grant, strip `max_license_bu`, `max_license_users`, and `is_active` from the
payload before the write. Licensing and activation stay a platform decision. Stripping
rather than rejecting keeps a full-object PUT from a well-behaved client working.

### B6 — deliberately unchanged

`GET /api-system/clusters` (list), `DELETE /api-system/clusters/:cluster_id`,
`DELETE /api-system/business-units/:business_unit_id`. The cluster-admin layout uses B1
instead of the cluster list, and deletion of a cluster or a BU stays platform-only.

---

## 4. Frontend changes — `carmen-platform`

### 4.1 Route-space

```
/cluster-admin                                        → picker, or redirect when exactly one
/cluster-admin/:clusterId/cluster                     → cluster profile (edit)
/cluster-admin/:clusterId/business-units              → BU list
/cluster-admin/:clusterId/business-units/new          → BU create
/cluster-admin/:clusterId/business-units/:buId/edit   → BU edit
/cluster-admin/:clusterId/users                       → members + invitations (tabs)
```

`/cluster-admin` resolves as: `all === true` or more than one cluster → picker page;
exactly one → `<Navigate replace>` into it; none → `<Forbidden />`.

Pages are lazy-loaded through the existing `Suspense` in `App.tsx`.

### 4.2 Nav extraction

`Layout.tsx` keeps every piece of chrome and gives up only the nav:

- `src/components/nav/platformNav.ts` — `buildPlatformNav({ hasPermission, isSuperAdmin }): NavItem[]`,
  the current lines 58–84 moved verbatim, filter included.
- `src/components/nav/clusterAdminNav.ts` — `buildClusterAdminNav(clusterId): NavItem[]`,
  three items: Cluster (`Network`), Business Units (`Building2`), Users (`Users`).
- `Layout` gains **optional** `navItems?: NavItem[]` and `headerSlot?: React.ReactNode`.
  Omitting `navItems` falls back to `buildPlatformNav(...)` from `useAuth()`, so the
  **27 pages that render `<Layout>` today need no change**.
- `ClusterAdminLayout.tsx` — a thin wrapper that composes the cluster nav and the switcher
  and renders `<Layout navItems={…} headerSlot={…}>`.

`headerSlot` renders the cluster switcher, shown only when `all === true` or more than one
cluster is administered. It reuses the `BuSwitcher` interaction pattern (command-dialog with
search and a recents list); a shared primitive is **not** extracted for two call sites.

`Breadcrumbs.tsx` gains `'cluster-admin': 'Cluster Admin'` in `SEGMENT_LABELS` and
`'cluster-admin'` in `NON_NAVIGABLE` (it has no index route). The `:clusterId` segment is an
opaque UUID and is already dropped by `isIdSegment`.

### 4.3 `AuthContext`

```ts
adminScope: { all: boolean; clusters: AdminCluster[] } | null
isClusterAdminOf: (clusterId: string) => boolean   // adminScope.all || clusters.some(c => c.id === clusterId)
```

Fetched from B1 alongside `fetchEffectivePermissions()` on mount and after login, persisted
to `localStorage` under `adminScope` on the same terms as `effectivePermissions`, and cleared
by `logout()`.

**The login gate** (`AuthContext.tsx:138-140`) becomes:

```ts
const hasAnyPermission = !!eff && (eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters).length > 0);
const hasClusterAdmin  = !!scope && (scope.all || scope.clusters.length > 0);
if (!hasAnyPermission && !hasClusterAdmin && !isBootstrap) { /* tear down, Access Denied */ }
```

**No dev-mock fallback for `adminScope`.** `effectivePermissions` has one
(`DEV_MOCK_EFFECTIVE_PERMISSIONS`) because it predates the roles being seeded. A mock here
would hand every dev session admin rights over every cluster and hide exactly the bugs this
guard exists to surface. A failed fetch resolves to `{ all: false, clusters: [] }`.

### 4.4 `ClusterAdminRoute`

```
not authenticated       → <Navigate to="/login" replace />
adminScope still null   → the existing route-loader spinner
!isClusterAdminOf(id)   → <Forbidden />        (rendered in place, per PrivateRoute's comment)
```

### 4.5 Service

`src/services/clusterAdminService.ts`, following the shape in `clusterService.ts`:

| Method | Call |
|---|---|
| `getMyAdminClusters(p)` | `GET /api-system/me/admin-clusters` |
| `listInvitations(clusterId, p)` | `GET /api-system/clusters/:clusterId/invitations` |
| `createInvitation(clusterId, payload)` | `POST /api-system/clusters/:clusterId/invitations` |
| `revokeInvitation(clusterId, invitationId)` | `DELETE /api-system/clusters/:clusterId/invitations/:invitationId` |
| `resendInvitation(clusterId, invitationId)` | `POST /api-system/clusters/:clusterId/invitations/:invitationId/resend` |

Reused unchanged: `clusterService.getById` / `update` / `uploadLogo` / `uploadAvatar` /
`getClusterUsers`, `businessUnitService.*`.

New types in `src/types/index.ts`: `AdminCluster`, `AdminScope`, `ClusterInvitation`,
`InvitationBusinessUnit`, `InvitationCreatePayload`. `cluster_role` and the per-BU `role`
mirror the backend enums `enum_cluster_user_role` and `enum_user_business_unit_role`.

### 4.6 View switching

`HeaderUserMenu` gains one item, rendered only when the other side is genuinely reachable:

- in the platform layout → "Cluster Admin view", shown when `adminScope.all || adminScope.clusters.length > 0`, links to `/cluster-admin`
- in the cluster-admin layout → "Platform Admin view", shown when `is_super_admin || platform.length > 0`, links to `/dashboard`

---

## 5. Screens

All four follow the repo's two page patterns. Copy the nearest existing example rather than
inventing layout.

### 5.1 `/cluster-admin/:clusterId/cluster` — cluster profile

Edit-page pattern. **Reuses `src/pages/clusterEdit/sections/DetailsSection.tsx` and
`BrandingSection.tsx` directly** — their props (`formData: ClusterFormData`, `fieldErrors`,
`canEdit`, `onCommit`, `onValidate`; and `logoUrl`, `avatarUrl`, `canEdit`, `onUploadLogo`,
`onUploadAvatar`) already fit.

Dropped: the BU section, the Users section, the Delete action.

One targeted change to `DetailsSection`: a new optional `canEditLicensing?: boolean`
(defaulting to `canEdit`) so the licensing field renders read-only for a cluster admin,
matching what B5 strips server-side. A control the server will ignore must not look editable.

**Which field, exactly.** Only `max_license_bu`. Corrected 2026-08-05 during backend
implementation: `max_license_users` is a **business-unit** column
(`schema.prisma:133`), not a cluster one — the cluster-level number is
`total_max_license_users`, a computed `groupBy` aggregate that is already read-only. The
frontend's cluster form matches that reality and renders only `max_license_bu`
(`DetailsSection.tsx:60`). B5's strip list names `max_license_users` too, which is inert
but harmless as defence in depth.

`doc_version` is threaded per **CLAUDE.md rule 17** — dedicated `docVersion` state, never in
`formData`, sent only when the GET returned one, `409` → `notifyVersionConflict()` + refetch.

### 5.2 `/cluster-admin/:clusterId/business-units` — list

Management-page pattern with everything **rule 13** requires: 400ms debounced search, filter
Sheet, server-side `DataTable`, CSV export via `generateCSV` + `downloadCSV`, dev-only debug
Sheet, `Ctrl/⌘+K`. `perpage` persists as `perpage_ca_business_units`.

Request: `businessUnitService.getAll({ …, advance: JSON.stringify({ where: { cluster_id: clusterId } }) })`.
The filter is sent **even though B3 scopes server-side** — an admin who administers two
clusters must see only the one named in the URL, which is narrower than their scope.

Columns: name, code, `is_hq`, `is_active` (as `<Badge variant="success" | "secondary">`),
`created_at`. `meta.card` hints for the sub-`lg` card layout.

### 5.3 `/cluster-admin/:clusterId/business-units/[new | :buId/edit]`

Edit-page pattern, derived from `BusinessUnitEdit.tsx` with these removals:

- the DB-connection section entirely — `GET .../reveal-db-connection` is gated on
  `RequirePlatformPermission('cluster.update')` and would 403. `db_connection` is optional in
  `BusinessUnitCreateSchema`, so creation works without it.
- `max_license_users` — a platform decision, and B5 strips its cluster-level sibling.
- the BU-users card — membership is managed on the Users page.

`cluster_id` is fixed from `useParams`, never a form field.

### 5.4 `/cluster-admin/:clusterId/users` — members and invitations

```
┌─ Members (12) ─┬─ Invitations (3) ─┐          [+ Invite user]
│ Name        Email          Role    BUs   Status │
│ Somchai K.  som@x.com      admin   3     ●      │
└─────────────────────────────────────────────────┘
```

**Members tab** — `clusterService.getClusterUsers(clusterId)` (already `isClusterAdmin`-gated).
Row actions: change cluster role, activate/deactivate, remove — via
`PUT` / `DELETE /api-system/user/clusters`. Removal goes through `<ConfirmDialog>`.

**Invitations tab** — `listInvitations` with the backend's computed status; per-row revoke
(confirmed) and resend.

**Invite dialog:**

```
┌──────────────────────────────────────┐
│ Invite to Grand Hotels               │
│ Email        [____________________]  │
│ Cluster role ( ) admin   (•) user    │
│ ── Business units ─────────────────  │
│ ☑ BKK Riverside      role [user  ▾] ★│   ★ = default BU
│ ☑ CNX Old City       role [user  ▾] ○│
│ ☐ HKT Beachfront                     │
│                  [Cancel]  [Send]    │
└──────────────────────────────────────┘
```

Payload matches `InvitationCreateSchema` exactly:
`{ email, cluster_role, business_units: [{ business_unit_id, role, is_default? }] }`.
At most one `is_default`. The BU options come from the same cluster-filtered query as §5.2;
the backend returns 400 for a BU outside the cluster.

---

## 6. Data flow and error handling

```
login / mount
   ├→ GET /api/user/permission/platform        (existing)
   └→ GET /api-system/me/admin-clusters        (B1)      ──┐
                                                           ├→ AuthContext
/cluster-admin            → all || >1 ? picker : <Navigate replace>
/cluster-admin/:clusterId/*
   → ClusterAdminRoute   (isClusterAdminOf)
   → ClusterAdminLayout  (nav bound to clusterId, switcher in headerSlot)
   → page reads clusterId from useParams() only — there is no global "current cluster"
```

Building every payload from `useParams()` is what makes two clusters in two browser tabs
safe: neither tab can read the other's selection because no shared selection exists.

| Case | Behaviour |
|---|---|
| any `catch` | `parseApiError(err)` + `toast.error()` (rule 12), `setFieldErrors(fields)` when returned |
| 403 mid-session (admin rights revoked while the page is open) | `<FetchErrorState>` with an action returning to `/cluster-admin` |
| 409 with a lock signal | `isVersionConflict(err)` → `notifyVersionConflict()` → refetch; page stays in edit mode (rule 17) |
| 409 on invite — email already a member | toast, then switch to the Members tab with that email prefilled in search |
| 429 on invite — rate limited | toast asking the user to retry later |
| `admin-clusters` fetch fails | fail-closed: `{ all: false, clusters: [] }`, no dev mock |

---

## 7. Out of scope

- **The invitation accept/decline screen.** `INVITATION_BASE_URL` defaults to
  `http://localhost:3000/invitations` (`micro-cluster/src/libs/config.env.ts:52`) — not this
  app's port 3304. The accept flow (`GET /api/invitations/mine`, `GET /api/invitations/:token`,
  `POST /api/invitations/:token/accept`, `POST .../decline`) belongs to whichever app that URL
  points at. This spec only issues and manages invitations.
- **Moving `INVITATION_BASE_URL` (and `INVITATION_EXPIRY_DAYS`) out of env into a
  platform-level settings page.** Deferred to its own spec, decided 2026-08-05. Both are read
  from `envConfig` in `micro-cluster/src/cluster/user-invitation/user-invitation.service.ts`
  (lines 231 and 236) and work as they are, so nothing here is blocked. There is no
  platform-wide settings table in `CARMEN_SYSTEM` today — the whole `tb_*` list holds none —
  and `app-config` (`/api/config/:bu_code/app-config`) is per-business-unit and lives in the
  tenant schema, so it is the wrong home for a single platform value. The follow-up spec
  should copy the `tb_email_sender_profile` pattern: a platform table in `CARMEN_SYSTEM`, an
  `/api-system/platform/…` surface, its own permission pair, and a config-page-pattern admin
  screen.
- **Creating or deleting clusters**, deleting business units, licensing changes, tenant
  migrations, data import, and everything in the Content and Platform nav groups.
- **Reworking `checkPermission`'s any-cluster fallback** (`src/utils/permissions.ts:47`). It
  keeps its current meaning for the platform layout. The cluster-admin layout does not use it.
- **Extracting a shared switcher primitive** from `BuSwitcher`. Two call sites is not enough
  evidence of the right abstraction.

---

## 8. Verification

Per the working preference in `~/.claude/CLAUDE.md`, the implementation plans carry no
test-authoring steps. Static checks and manual verification still apply.

**Frontend:** `bun run typecheck`, `bun run lint`, and `bun run test` — the existing suite
(1049 tests as of 0.2.0) must stay green. Changes to `Layout.tsx`, `AuthContext.tsx`,
`HeaderUserMenu.tsx`, and `Breadcrumbs.tsx` all have existing co-located tests that will
catch a regression.

**Backend:** `bun run check-types` plus the `micro-cluster` and `backend-gateway` Jest suites,
run **scoped and in the foreground**. `ClusterAdminAuthzService` has an existing
`.spec.ts` that must stay green.

**Pre-deploy data check for B3 (fail-closed).** Before deploying, count the users who have
neither a platform-role row nor an admin membership — the group whose business-unit list
goes from "all" to "none". Expected: zero on DEV. A non-empty result is a release blocker
until those users are assigned roles.

**Browser verification, signed in as a membership admin with no platform role:**

1. Login succeeds (the §4.3 gate change).
2. The sidebar shows exactly three items; no Content or Platform group.
3. Navigating to `/clusters` directly renders `<Forbidden />`, and the API returns 403.
4. The business-unit list contains only that cluster's BUs.
5. Editing the cluster saves; the licensing fields are read-only.
6. An invitation is issued and the email arrives.
7. As a super admin: the "Cluster Admin view" item appears, the switcher searches all
   clusters, and both directions of D4 work.
8. Both layouts at 375px, 768px, and 1440px — confirm `window.innerWidth`, not the
   screenshot, since page zoom can pin it.
