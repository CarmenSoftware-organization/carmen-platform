# Cluster Admin view isolation — one gate, and a profile they can reach

**Date:** 2026-08-06
**Status:** Approved (design reviewed section by section)
**Repo:** `carmen-platform` (frontend only — no backend change)
**Builds on:** `docs/superpowers/specs/2026-08-05-cluster-admin-layout-design.md`
**Touches:** `src/utils/permissions.ts`, `src/context/AuthContext.tsx`,
`src/components/PrivateRoute.tsx`, `src/components/AuthedRoute.tsx` (new),
`src/components/Layout.tsx`, `src/components/HeaderUserMenu.tsx`, `src/pages/Profile.tsx`,
`src/pages/Forbidden.tsx`, `src/pages/NotFound.tsx`, `src/App.tsx`, `src/types/index.ts`

---

## 1. Problem

The cluster-admin layout shipped yesterday (PR #73) built the `/cluster-admin` route-space and
its scope guard, but never closed the platform side. A user whose only authority is
`tb_cluster_user.role = 'admin'` can still be dropped into the platform view, and once there has
no way to reach their own profile.

Verified in code on 2026-08-06:

| Location | What happens today |
|---|---|
| `Login.tsx:56`, `Login.tsx:96`, `Landing.tsx:60` | always `navigate('/dashboard', { replace: true })` — authority is never consulted, so a membership-only admin lands on the platform Dashboard. Fixed downstream by §4.1, not here — see §6.3 for why these three lines stay untouched |
| `App.tsx:73` `/dashboard` | bare `<PrivateRoute>` — no permission, no gate at all |
| `App.tsx:329` `/profile` | bare `<PrivateRoute>`, and `Profile.tsx:285` / `Profile.tsx:359` hardcode `<Layout>` — the platform shell, with no route back to `/cluster-admin` |
| `platformNav.ts:8` | the Dashboard nav item carries **no `permission`**, so it renders for everyone — a membership-only admin's sidebar is one link to a page they cannot use |
| `Forbidden.tsx:21,37`, `NotFound.tsx:26,46` | recovery is hardcoded to `/dashboard` — for a cluster admin every escape route is a dead end |
| `AuthContext.tsx:75-77` | `DEV_MOCK_EFFECTIVE_PERMISSIONS` fires whenever the backend returns no permissions in dev, handing a membership-only admin all 31 platform keys — **the feature cannot be observed in dev at all** |

The pieces that already work and are not touched: `ClusterAdminRoute` resolves scope correctly;
`ClusterAdminEntry` handles its own `adminScope` and renders `<Layout navItems={[]}>` so it leaks
no platform navigation; `Profile` calls `/api/user/profile`, which any authenticated user may
call, so password change works for a cluster admin the moment they can reach the page.

### 1.1 Scope of "cluster admin", for this spec

The narrow definition: a user with **no platform role row whatsoever** —
`is_super_admin === false`, `platform === []`, `clusters === {}` — who holds at least one
`tb_cluster_user.role = 'admin'` membership.

A user with cluster-scoped RBAC (`clusters` non-empty) keeps their current platform access. That
is the same line the login gate (`AuthContext.tsx:170`) and `HeaderUserMenu.tsx:45-48` already
draw, and it leaves §1 of the 2026-08-05 spec — the any-cluster `checkPermission` fallback —
deliberately untouched (§7).

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Lock only the narrow definition in §1.1 | Smallest change that satisfies the ask; no existing user's access changes. The broad reading (everyone without a platform-wide grant) would strand a user who has cluster-scoped RBAC but no membership-admin row — no platform view, and no cluster-admin view either |
| D2 | One check inside `PrivateRoute`, not per-route | It covers all 30 platform routes and every route added later. A per-route flag is something a new page can forget |
| D3 | Redirect to `/cluster-admin`, not `<Forbidden />` | For this user every platform route is permanently unreachable, so a 403 whose recovery button leads to another 403 is a trap. `PrivateRoute`'s existing comment argues against redirecting to `/403`; redirecting to a page the user *can* use is a different thing and does not trap Back |
| D4 | Profile gets a route under `/cluster-admin/:clusterId` | Keeps D3 of the prior spec — `clusterId` lives in the URL, never in hidden global state — and lets the page reuse `ClusterAdminLayout` unchanged |
| D5 | Delete `DEV_MOCK_EFFECTIVE_PERMISSIONS` | Its own comment scopes it to "building Phase 2–4 UI before roles are assigned". Roles are seeded on DEV (31 permissions, 5 roles). Keeping it means dev and prod disagree about exactly the boundary this feature draws |
| D6 | No backend change | Every endpoint under `/cluster-admin` already enforces `isClusterAdmin` server-side, and every platform endpoint already refuses this user. This is navigation, not security |

---

## 3. `hasPlatformAuthority` — naming the expression

`is_super_admin || platform.length > 0 || Object.keys(clusters).length > 0` is written twice
already and would become three times. Name it once.

```ts
// src/utils/permissions.ts
export function checkPlatformAuthority(eff: EffectivePermissions | null | undefined): boolean {
  if (!eff) return false;
  return eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters ?? {}).length > 0;
}
```

`AuthContext` exposes two derived booleans on `AuthContextValue` (add both to
`src/types/index.ts`):

```ts
hasPlatformAuthority: boolean   // checkPlatformAuthority(effectivePermissions) || (userCount !== null && userCount <= 1)
hasClusterAdminScope: boolean   // !!adminScope && (adminScope.all || adminScope.clusters.length > 0)
```

**The bootstrap hatch is part of platform authority.** `hasPermission` already returns `true` for
everything when `userCount <= 1` (`AuthContext.tsx:262`). Omitting it here would bounce the very
first administrator of a fresh install out of the platform view they are there to set up.

Then replace the duplicates:

- `AuthContext.tsx:170` — `hasAnyPermission` becomes `checkPlatformAuthority(eff)`. Same
  expression, one name.
- `HeaderUserMenu.tsx:45-48` — `canPlatformAdmin` becomes the context's `hasPlatformAuthority`;
  `canClusterAdmin` (line 40) becomes `hasClusterAdminScope`.

---

## 4. The gate

### 4.1 `PrivateRoute` becomes the platform-view route

```tsx
if (loading) return <div className="loading">Loading...</div>;
if (!isAuthenticated) return <Navigate to="/login" replace />;

if (effectivePermissions !== null && !hasPlatformAuthority) {
  if (adminScope === null) return <div className="loading">Loading...</div>;
  if (hasClusterAdminScope) return <Navigate to="/cluster-admin" replace />;
  // Neither authority — falls through, deliberately. See below.
}

if (requiredPermission && !hasPermission(requiredPermission)) return <Forbidden />;
if (requireSuperAdmin && !isSuperAdmin) return <Forbidden />;
```

A user whose only authority is a cluster-admin membership has nothing to do in the platform view:
every list here is platform-wide and refuses them server-side. Sending them to a page they can use
beats a 403 whose only recovery button leads to another 403.

**Three of the conditions above are about *not knowing yet*, and each was corrected during
implementation after a review traced a concrete failure. The pattern behind all three:
`hasPlatformAuthority` reads `false` for a user who has none AND for a session that has not
resolved. Only the first is a boundary decision.**

- **`effectivePermissions !== null` gates the whole block.** Without it, a platform admin who is
  also a cluster admin hits a transient `fetchEffectivePermissions` failure — which nulls the value
  *and deletes its cache* (`AuthContext.tsx`) — and is redirected into the cluster-admin space with
  `replace`, where nothing sends them back and the "Platform Admin view" menu item is hidden for the
  same reason. A degraded session falls through instead, exactly as it behaved before this guard.
  Verified against the backend on 2026-08-06: `GET /api/user/permission/platform` carries only
  `KeycloakGuard` and returns `200 {platform: [], clusters: {}, is_super_admin: false}` for a user
  with zero platform role rows, so a membership-only cluster admin's payload is a **non-null empty
  object** and the boundary does fire for them. That is load-bearing — were the endpoint to 403
  instead, this precondition would silently disable the whole feature.
- **`adminScope === null` holds a loader.** The scope is fetched separately from the permissions and
  may still be in flight. Without it a membership-only admin renders the platform page for one frame,
  and `<Dashboard>` mounting means a burst of platform-wide list requests that all 403. It blocks
  only users who lack platform authority; everyone else never waits on `adminScope`.
- **The neither-authority case falls through rather than returning `<Forbidden />`.** An
  implementation that returned there regressed the bootstrap role: `userCount` is the guard's other
  input and is **never cached in `localStorage`**, so on every cold reload it is `null` while its
  fetch is in flight — and `AuthContext` calls `setLoading(false)` before that resolves. The first
  administrator of a fresh install would have been 403'd on `/dashboard`, the page they exist to set
  up, and permanently so if that one request failed (`fetchUserCount`'s catch never sets the value).
  Falling through reproduces the pre-guard behaviour for a state the login gate already refuses to
  create. It does not weaken the boundary: a membership-only cluster admin has
  `hasClusterAdminScope === true` and is redirected by the branch above, never reaching that line.

### 4.2 Three guards, one job each

`/cluster-admin` currently uses `<PrivateRoute>`, which under §4.1 would redirect to itself —
an infinite loop. It needs authentication only; `ClusterAdminEntry` already resolves scope
itself, including the empty-scope empty state.

```
AuthedRoute        authenticated only              → /cluster-admin
PrivateRoute       platform view + permission      → the 30 existing routes
ClusterAdminRoute  cluster scope for :clusterId    → /cluster-admin/:clusterId/*
```

`src/components/AuthedRoute.tsx` is `PrivateRoute`'s first two branches and nothing else.

---

## 5. Profile

### 5.1 Route and shell

```tsx
// App.tsx
<Route path="/cluster-admin/:clusterId/profile"
       element={<ClusterAdminRoute><Profile /></ClusterAdminRoute>} />
```

`Profile.tsx` picks its own shell, keeping the repo convention that a page renders its own
`<Layout>`:

```tsx
const { clusterId } = useParams<{ clusterId: string }>();
const Shell = clusterId ? ClusterAdminLayout : Layout;
```

Both `<Layout>` sites (`Profile.tsx:285` — the loading branch — and `Profile.tsx:359`) become
`<Shell>`. `ClusterAdminLayout` reads `clusterId` from `useParams` itself, so it needs no props.

Breadcrumbs already work: `Breadcrumbs.tsx:24` maps `cluster-admin` → "Cluster Admin" and marks
it non-navigable, `Breadcrumbs.tsx:25` maps `profile` → "Profile", and the UUID segment is
dropped by `isIdSegment`. Result: `Cluster Admin › Profile`.

Profile is **not** added to `clusterAdminNav` — on the platform side it lives only in the user
menu, and this side matches.

### 5.2 Where the user menu points

```ts
const fallbackClusterId = hasPlatformAuthority ? undefined : adminScope?.clusters[0]?.id;
const target = clusterId ?? fallbackClusterId;
const profileTo = target ? `/cluster-admin/${target}/profile` : '/profile';
```

Read in order:

1. **A `clusterId` in the URL wins outright**, whatever the user's platform authority. A super
   admin who has switched into the cluster-admin view is *in* that view; opening Profile must not
   silently eject them into the platform shell. Leaving is what the "Platform Admin view" item
   above is for.
2. **No `clusterId`, no platform authority** (the picker page, `/cluster-admin`) — fall back to
   `clusters[0]`. Arbitrary and harmless: Profile's content is identical under every cluster, only
   the sidebar differs, and the alternative — a third shell mode for a profile with no cluster —
   is more machinery than the case is worth.
3. **Otherwise** `/profile`, unchanged.

`clusterId` comes from `useParams()` — `HeaderUserMenu` renders inside `Layout`, which
`ClusterAdminLayout` renders beneath the `:clusterId` route, so the param resolves there and is
`undefined` on `/cluster-admin` itself and everywhere in the platform view.

---

## 6. No dead ends

### 6.1 The sidebar

`platformNav.ts:8` gives the Dashboard item no `permission`, so `buildPlatformNav` returns it to
everyone. For a membership-only admin that is a one-item sidebar pointing at a page §4.1 bounces
them out of — visible on `NotFound` and `Forbidden`, the two pages that still render the default
shell for this user.

Fix it once, at the fallback in `Layout.tsx:76`:

```ts
const navItems = navItemsProp ?? (hasPlatformAuthority ? buildPlatformNav({ hasPermission, isSuperAdmin }) : []);
```

Same reasoning as D2 — one place, and no future page can forget it. An explicit `navItems` prop
still wins, so `ClusterAdminLayout` and `ClusterAdminEntry` are unaffected.

### 6.2 Recovery targets

`Forbidden.tsx` and `NotFound.tsx` both hardcode `/dashboard` twice — as the
`useBackOrFallback` fallback (`:21` / `:26`) and as the second action button (`:37` / `:46`).
Both become authority-aware:

```ts
const home = hasPlatformAuthority ? '/dashboard' : '/cluster-admin';
const goBack = useBackOrFallback(home);
```

The button label follows: "Go to Dashboard" or "Go to Cluster Admin", with the icon changing
from `LayoutDashboard` to `Network` to match `HeaderUserMenu`'s existing choice for that
destination.

`Forbidden.tsx:9-17`'s header comment claims the shell is unconditional because both entry paths
guarantee an authenticated user. That stays true — only the destination changes, not the shell.

### 6.3 Entry points stay as they are

`Login.tsx:56`, `Login.tsx:96`, and `Landing.tsx:60` keep navigating to `/dashboard`. An earlier
draft of this spec had them compute `home` too; that is wrong, and the reason is worth recording.

`Login.tsx:96` runs in the same tick as the `login()` that just resolved. The `hasPlatformAuthority`
this component closed over is the *pre-login* value — `false` for everyone, since
`effectivePermissions` was null a moment ago — so a platform admin would be sent to
`/cluster-admin`. `Landing.tsx:60` has a milder version of the same hole: a session restored with
no cached `effectivePermissions` reads `false` while the fetch is still in flight.

§4.1 has no such problem because it is the only place that *waits*: it holds the loader until
`adminScope` resolves and re-renders when the permissions land, so it decides once, on complete
data. Adding a second decision point upstream can only be wrong more often than it is right.

The cost is one extra `<Navigate replace>` — invisible, and `replace` leaves no history entry.
`<Dashboard>` never mounts, so the unscoped list requests it would fire are not issued either.

---

## 7. Deleting the dev mock

- Remove `DEV_MOCK_EFFECTIVE_PERMISSIONS` from `src/utils/permissions.ts`.
- `AuthContext.applyEffectivePermissions` (`AuthContext.tsx:71-82`) loses the `isDev` branch and
  becomes a plain setter: store the value, or clear the key when null.
- `isDev` stays imported — `AuthContext.tsx:213` still uses it for verbose login errors.
- Four test files mention the constant **in comments only**
  (`ApplicationManagement.test.tsx:37,112`, `ReportTemplateManagement.test.tsx:37,100`,
  `RoleManagement.test.tsx:39,110`, `UserManagement.test.tsx:95`) — no imports, no behavioural
  coupling. Update the comments to describe the permission set directly.
- `AuthContext.test.tsx` resolves `is_super_admin: true`, which never entered the mock branch.

**Accepted consequence.** A developer pointed at a backend with no seeded roles can no longer sign
in; the bootstrap hatch (`userCount <= 1`) is the only remaining escape, and it only covers a
genuinely fresh install. This matches DEV today, where 3 of 40 users can sign into this app at all.

---

## 8. Out of scope

- **The backend.** Every route this feature touches is already enforced server-side (D6).
- **`checkPermission`'s any-cluster fallback** (`permissions.ts:47`). Per D1 it keeps its current
  meaning; a user with cluster-scoped RBAC still reaches the platform view.
- **Profile in the cluster-admin sidebar** (§5.1).
- **A neutral no-sidebar shell** for `/profile`. Two shell modes cover every reachable case.
- **Anything under `/cluster-admin/:clusterId/*` beyond profile** — the four pages from the
  2026-08-05 spec are unchanged.

---

## 9. Verification

Per the working preference in `~/.claude/CLAUDE.md` the implementation plan carries no
test-authoring steps. Static checks and manual verification still apply.

**Static:** `bun run typecheck`, `bun run lint`, `bun run test` — the existing suite must stay
green.

Three existing specs mock `useAuth` with a partial object and will need their fixture widened,
because a field this spec adds reads back as `undefined` (falsy) from those mocks:

| Spec | Why it breaks | Fixture change |
|---|---|---|
| `PrivateRoute.test.tsx:6-11` | `hasPlatformAuthority` undefined enters the new branch | add `hasPlatformAuthority: true` |
| `NotFound.test.tsx:17` | asserts `navigate('/dashboard')` at `:72` and `:89` | add `hasPlatformAuthority: true` |
| `Forbidden.test.tsx` | mocks **no** AuthContext at all — `Forbidden` gains a `useAuth()` call and would throw "useAuth must be used within an AuthProvider" | add the `vi.mock('../context/AuthContext', …)` block, matching `NotFound.test.tsx:17-18` |

`Login.test.tsx` and `Landing.test.tsx` are untouched — §6.3 leaves both pages alone.

These are fixture repairs to keep the suite green, not new test coverage. The redirect itself is
covered by the browser checks below.

**Browser, signed in as a membership-only cluster admin (no platform role row):**

1. Login lands on `/cluster-admin` — not `/dashboard`, and with no platform frame in between.
2. Typing `/dashboard`, `/clusters`, `/users`, `/profile`, or `/403` each replaces with
   `/cluster-admin`. In the network tab, no **page-driven** list request is issued — the guard
   returns before `<Dashboard>` mounts. Do not read `GET /api-system/users` as a failure: typing a
   URL reloads the app, and `AuthContext`'s mount effect fires `fetchUserCount()` unconditionally
   for every restored session. That call predates this branch and the login gate depends on it.
3. The user menu shows **no** "Platform Admin view" item.
4. User menu → Profile lands on `/cluster-admin/:clusterId/profile` with the three-item cluster
   sidebar and the breadcrumb `Cluster Admin › Profile`.
5. Change password succeeds from that page.
6. A bad URL renders 404 with an empty sidebar and a "Go to Cluster Admin" button that works.
7. Both layouts at 375px, 768px, and 1440px — confirm `window.innerWidth`, not the screenshot,
   since page zoom can pin it.

**Signed in as a platform super admin:** `/dashboard` behaves exactly as before, the full nav
renders, `/profile` keeps the platform shell, and both directions of view switching still work.

**Signed in as a user with cluster-scoped RBAC but no admin membership:** unchanged — still
reaches the platform view (D1). This is the case a broader reading would have broken.
