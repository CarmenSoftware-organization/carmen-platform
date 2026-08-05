# Cluster Admin View Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a user whose only authority is a cluster-admin membership inside `/cluster-admin`, and give them a profile page they can reach to change their password.

**Architecture:** One new check inside `PrivateRoute` redirects a membership-only admin to `/cluster-admin` before any platform page mounts, so all 30 platform routes are covered at once and no future route can forget. `/cluster-admin` moves to a new auth-only guard so that redirect cannot loop. `Profile` gains a route under `/cluster-admin/:clusterId` and picks its shell from the URL param. Recovery paths (`Layout`'s fallback nav, 403, 404) become authority-aware so the user is never handed a link they cannot follow.

**Tech Stack:** React 19 + TypeScript (strict), react-router-dom v6, Vitest + React Testing Library, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-06-cluster-admin-view-isolation-design.md`

## Global Constraints

- **Do NOT write new tests.** Per `~/.claude/CLAUDE.md`, plan execution skips test authoring. Do not create `*.test.ts` / `*.test.tsx` files. You **must** still repair existing test fixtures so the suite stays green — that is explicitly part of Tasks 2 and 4.
- **Static checks are not tests — always run them.** Every task ends with `bun run typecheck` and `bun run lint`, both clean, before the commit.
- The full suite (`bun run test`) must be green at the end of Tasks 2, 4, and 5.
- **Never** modify `src/components/ui/` primitives.
- Frontend only. No backend repo is touched in this plan.
- Work on branch `feature/cluster-admin-view-isolation` (already checked out, spec already committed there).
- Commit after every task. Do not squash tasks together.

---

### Task 1: `checkPlatformAuthority` and the two context booleans

The expression `is_super_admin || platform.length > 0 || Object.keys(clusters).length > 0` is
already written twice. Name it once, and expose it (plus the cluster-admin scope test) from
`AuthContext` so the guards in later tasks have a single source.

**One behaviour does change, deliberately.** `HeaderUserMenu`'s old local `canPlatformAdmin` did
not include the bootstrap escape hatch; `hasPlatformAuthority` does. So a bootstrap user (0–1
users on the install, no permission rows yet) sitting in `/cluster-admin` now sees the "Platform
Admin view" item where before it was hidden. That is a fix, not a regression: `hasPermission`
(`AuthContext.tsx:262`) already lets that user into every platform page, so the hidden menu item
was the thing that disagreed with reality. Task 2 also requires the hatch here — without it the
first administrator of a fresh install is redirected out of the view they exist to set up.
Ruled accepted by the human partner on 2026-08-06 after the Task 1 review raised it.

**Files:**
- Modify: `src/utils/permissions.ts` (add an exported function after `checkPermission`, which ends at line 48)
- Modify: `src/types/index.ts:472-486` (`AuthContextValue`)
- Modify: `src/context/AuthContext.tsx` (import, line 170, lines 258-283)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `checkPlatformAuthority(eff: EffectivePermissions | null | undefined): boolean` from `src/utils/permissions.ts`
  - `useAuth().hasPlatformAuthority: boolean`
  - `useAuth().hasClusterAdminScope: boolean`

- [ ] **Step 1: Add the pure helper to `src/utils/permissions.ts`**

Append directly below the existing `checkPermission` function (it ends with the closing brace on
line 48, just before the `DEV_MOCK_EFFECTIVE_PERMISSIONS` doc comment):

```ts
/**
 * Does this user have any business in the platform-administration view?
 *
 * True for a super admin, for any platform-wide grant, and for any cluster-scoped grant — the
 * same line the login gate has always drawn. Deliberately NOT true for a user whose only
 * authority is a `tb_cluster_user.role = 'admin'` membership: every list in the platform view is
 * platform-wide, and the server refuses them.
 *
 * The bootstrap escape hatch (userCount <= 1) is applied by the caller in AuthContext, not here,
 * so this stays a pure function of the permission payload.
 */
export function checkPlatformAuthority(eff: EffectivePermissions | null | undefined): boolean {
  if (!eff) return false;
  return eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters ?? {}).length > 0;
}
```

- [ ] **Step 2: Widen `AuthContextValue` in `src/types/index.ts`**

Add two fields after `isClusterAdminOf` (line 485):

```ts
export interface AuthContextValue {
  // ...existing fields unchanged...
  adminScope: AdminScope | null;
  isClusterAdminOf: (clusterId: string) => boolean;
  /** May this user use the platform-administration view at all? See checkPlatformAuthority. */
  hasPlatformAuthority: boolean;
  /** Does this user administer at least one cluster (or all of them)? */
  hasClusterAdminScope: boolean;
}
```

- [ ] **Step 3: Derive both values in `src/context/AuthContext.tsx`**

Change the import on line 7 to pull in the new helper:

```ts
import { checkPermission, checkPlatformAuthority, DEV_MOCK_EFFECTIVE_PERMISSIONS } from '../utils/permissions';
```

Then, immediately after `const isSuperAdmin = ...` (line 258) and before `hasPermission`:

```ts
  // The bootstrap escape hatch belongs here rather than in checkPlatformAuthority: the very
  // first administrator of a fresh install has no permission rows yet, and hasPermission
  // (below) already treats that state as full access. The two must agree, or the first admin
  // is bounced out of the view they exist to set up.
  const hasPlatformAuthority =
    (userCount !== null && userCount <= 1) || checkPlatformAuthority(effectivePermissions);

  const hasClusterAdminScope =
    !!adminScope && (adminScope.all || adminScope.clusters.length > 0);
```

Add both to the `value` object (lines 269-283), after `isClusterAdminOf`:

```ts
    isClusterAdminOf,
    hasPlatformAuthority,
    hasClusterAdminScope,
  };
```

- [ ] **Step 4: Replace the duplicated expression at the login gate**

`AuthContext.tsx:170` currently reads:

```ts
      const hasAnyPermission = !!eff && (eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters).length > 0);
```

Replace with:

```ts
      const hasAnyPermission = checkPlatformAuthority(eff);
```

Leave the `hasClusterAdmin` and `isBootstrap` lines below it exactly as they are — `isBootstrap`
is a separate clause in that condition and must stay separate.

- [ ] **Step 5: Replace the duplicated expressions in `HeaderUserMenu`**

In `src/components/HeaderUserMenu.tsx`, change line 37 to destructure the new values and delete
the two local derivations on lines 40-48 (keep `inClusterAdmin` on line 39):

```ts
  const { hasPlatformAuthority, hasClusterAdminScope } = useAuth();
```

Then update the two conditional menu items (lines 77 and 83):

```tsx
        {inClusterAdmin && hasPlatformAuthority && (
```
```tsx
        {!inClusterAdmin && hasClusterAdminScope && (
```

`adminScope`, `effectivePermissions`, and `isSuperAdmin` are no longer read here — remove them
from the destructure so lint does not flag unused bindings. (Task 3 re-adds `adminScope`.)

- [ ] **Step 6: Verify static checks**

Run: `bun run typecheck && bun run lint`
Expected: both clean. If `tsc` reports that a test file's `useAuth` mock is missing
`hasPlatformAuthority`, that is expected only where the mock is typed as `AuthContextValue` —
in this repo the mocks are untyped object literals, so no test should fail typecheck here.

- [ ] **Step 7: Commit**

```bash
git add src/utils/permissions.ts src/types/index.ts src/context/AuthContext.tsx src/components/HeaderUserMenu.tsx
git commit -m "refactor(auth): name the platform-authority test and expose it from context

The expression is_super_admin || platform.length > 0 || clusters non-empty was
written at the login gate and again in the header menu, and the new route guard
needs it a third time. checkPlatformAuthority() is that expression; AuthContext
derives it once, folding in the bootstrap hatch so it agrees with hasPermission.

No behaviour change — nothing consumes the new booleans yet."
```

---

### Task 2: The gate

`PrivateRoute` becomes the platform-view guard. `/cluster-admin` needs a guard that checks
authentication only, or the new redirect points at itself and loops forever.

> **AMENDED DURING EXECUTION — the guard in Step 2 is not the one that shipped.** Two reviews found
> concrete failures in it. The block gained an `effectivePermissions !== null` precondition (a
> transient permission-fetch failure would otherwise eject a platform admin into the cluster-admin
> space for the rest of the session, with no way back), and its neither-authority case is a
> deliberate fall-through rather than a `<Forbidden />` (returning there 403'd the bootstrap role on
> every cold reload, because `userCount` is the guard's other input and is never cached). Read
> **spec §4.1** for the guard that shipped and the reasoning behind all three not-yet-resolved
> conditions. Step 2's code block is kept as the instruction the implementer was actually given.

**Files:**
- Create: `src/components/AuthedRoute.tsx`
- Modify: `src/components/PrivateRoute.tsx:18-38`
- Modify: `src/App.tsx:6` (import) and `src/App.tsx:344-347` (the `/cluster-admin` route)
- Modify: `src/components/PrivateRoute.test.tsx:6-11` (fixture repair only)

**Interfaces:**
- Consumes: `useAuth().hasPlatformAuthority`, `useAuth().hasClusterAdminScope`, `useAuth().adminScope` (Task 1).
- Produces: `AuthedRoute` — default export, props `{ children: React.ReactNode }`.

- [ ] **Step 1: Create `src/components/AuthedRoute.tsx`**

```tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Authentication only — no permission check and no view boundary.
 *
 * The one route that needs this is `/cluster-admin`, which `PrivateRoute` cannot guard: that
 * guard redirects a membership-only cluster admin *to* `/cluster-admin`, so using it here would
 * redirect the route to itself forever. `ClusterAdminEntry` resolves `adminScope` itself,
 * including the administers-nothing empty state, so nothing is lost by checking less here.
 */
const AuthedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthedRoute;
```

- [ ] **Step 2: Add the view boundary to `src/components/PrivateRoute.tsx`**

Extend the doc comment above the component and add the new branch. The whole component becomes:

```tsx
/**
 * Guard for the platform-administration view.
 *
 * A failed permission check renders <Forbidden /> **in place**, leaving the URL untouched, so the
 * 403 page's "Go Back" returns to a page the user could actually reach. Redirecting to /403
 * instead would trap them: back would land on the blocked route and bounce forward again.
 *
 * A user with no platform authority is *redirected* rather than shown a 403, because for them
 * every route behind this guard is permanently unreachable — a 403 whose recovery button leads
 * to another 403 is the trap the paragraph above is about.
 *
 * This is also the only place that decides the boundary, which is what makes it correct: it can
 * wait for `adminScope` to resolve. Entry points like Login and Landing cannot — they read a
 * pre-login snapshot of the context — so they keep sending everyone to /dashboard and let this
 * guard route the ones who do not belong there.
 */
const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, requiredPermission, requireSuperAdmin }) => {
  const {
    isAuthenticated,
    loading,
    hasPermission,
    isSuperAdmin,
    hasPlatformAuthority,
    hasClusterAdminScope,
    adminScope,
  } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPlatformAuthority) {
    // Still resolving. Rendering the page for even one frame mounts it — for /dashboard that
    // means a burst of platform-wide list requests that all 403.
    if (adminScope === null) {
      return <div className="loading">Loading...</div>;
    }
    if (hasClusterAdminScope) {
      return <Navigate to="/cluster-admin" replace />;
    }
    // Neither authority. Normally unreachable — the login gate refuses this user — but a stale
    // localStorage session can produce it. Fall through to <Forbidden /> below.
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Forbidden />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Forbidden />;
  }

  return <>{children}</>;
};
```

- [ ] **Step 3: Point `/cluster-admin` at the new guard in `src/App.tsx`**

Add the import beside the existing guard imports (line 6):

```tsx
import AuthedRoute from "./components/AuthedRoute";
```

Change the `/cluster-admin` route (lines 344-347) from `PrivateRoute` to `AuthedRoute`:

```tsx
            <Route
              path="/cluster-admin"
              element={<AuthedRoute><ClusterAdminEntry /></AuthedRoute>}
            />
```

Leave every other route alone. `/403` (lines 336-343) stays on `PrivateRoute` deliberately — a
membership-only admin who types it should be redirected like any other platform URL.

- [ ] **Step 4: Repair the `PrivateRoute` test fixture**

`src/components/PrivateRoute.test.tsx:6-11` builds a partial `useAuth` mock. Without
`hasPlatformAuthority` it reads `undefined` (falsy) and every existing test would enter the new
branch. Add the field — `true` is what a platform user has, which is what these tests are about:

```ts
const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  loading: false,
  isSuperAdmin: false,
  hasPermission: vi.fn((_perm: string) => true),
  hasPlatformAuthority: true,
}));
```

Do **not** add new test cases. This is a fixture repair.

- [ ] **Step 5: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all clean, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/components/AuthedRoute.tsx src/components/PrivateRoute.tsx src/components/PrivateRoute.test.tsx src/App.tsx
git commit -m "feat(auth): keep a membership-only cluster admin out of the platform view

One check in PrivateRoute covers all 30 platform routes and every route added
later — the alternative, a flag per route, is something a new page can forget.
It redirects rather than 403s because for this user every route behind the guard
is permanently unreachable, so a 403 whose recovery leads to another 403 is the
trap PrivateRoute's own comment warns about.

/cluster-admin moves to a new auth-only AuthedRoute; under PrivateRoute the
redirect would target the route it is guarding and loop."
```

---

### Task 3: A profile the cluster admin can reach

**Files:**
- Modify: `src/App.tsx` (add one route beside the other `/cluster-admin/:clusterId/*` routes, after line 367)
- Modify: `src/pages/Profile.tsx:1-15` (imports), `:285`, `:359`
- Modify: `src/components/HeaderUserMenu.tsx` (the Profile menu item, line 90)

**Interfaces:**
- Consumes: `useAuth().hasPlatformAuthority` (Task 1), `ClusterAdminRoute` and `ClusterAdminLayout` (already in the repo, unchanged).
- Produces: route `/cluster-admin/:clusterId/profile`.

- [ ] **Step 1: Register the route in `src/App.tsx`**

Add directly after the `/cluster-admin/:clusterId/users` route (which ends at line 367):

```tsx
            <Route
              path="/cluster-admin/:clusterId/profile"
              element={<ClusterAdminRoute><Profile /></ClusterAdminRoute>}
            />
```

`Profile` is already imported at line 32. No new import.

- [ ] **Step 2: Let `Profile` pick its shell**

In `src/pages/Profile.tsx`, add to the imports (after line 3):

```tsx
import { useParams } from 'react-router-dom';
import ClusterAdminLayout from '../components/ClusterAdminLayout';
```

Inside the component, alongside the other hooks, add:

```tsx
  // Rendered at two routes: /profile in the platform view, and
  // /cluster-admin/:clusterId/profile inside the cluster-admin view. The param is the only
  // difference — the page's content and data source are identical — so the shell follows it.
  const { clusterId } = useParams<{ clusterId: string }>();
  const Shell = clusterId ? ClusterAdminLayout : Layout;
```

Replace `<Layout>` with `<Shell>` at line 285 (the `fetchingProfile` skeleton branch) and at
line 359 (the main return), and both matching `</Layout>` closers at lines 354 and 704.

Both `Layout` and `ClusterAdminLayout` accept `{ children }`, so no props change.

- [ ] **Step 3: Point the user menu at the right profile**

In `src/components/HeaderUserMenu.tsx`, re-add `adminScope` to the `useAuth()` destructure from
Task 1 Step 5, add `useParams` to the `react-router-dom` import on line 1, and compute the target
next to `inClusterAdmin`:

```tsx
  const { clusterId } = useParams<{ clusterId: string }>();

  // A clusterId in the URL wins outright, whatever the user's platform authority: a super admin
  // who has switched into the cluster-admin view is *in* it, and opening Profile must not
  // silently eject them into the platform shell — that is what the "Platform Admin view" item
  // above is for. On the picker page (/cluster-admin, no param) a membership-only admin falls
  // back to their first cluster; the choice is arbitrary and harmless, since Profile's content
  // is identical under every cluster and only the sidebar differs.
  const fallbackClusterId = hasPlatformAuthority ? undefined : adminScope?.clusters[0]?.id;
  const profileClusterId = clusterId ?? fallbackClusterId;
  const profileTo = profileClusterId ? `/cluster-admin/${profileClusterId}/profile` : '/profile';
```

Change the Profile menu item (line 90) to use it:

```tsx
        <DropdownMenuItem onClick={() => navigate(profileTo)}>
```

- [ ] **Step 4: Verify static checks**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Profile.tsx src/components/HeaderUserMenu.tsx
git commit -m "feat(cluster-admin): give the cluster admin a profile page they can reach

The route carries :clusterId like every other page in this space, so two tabs on
two clusters cannot collide, and Profile reads the param to choose between the
platform shell and ClusterAdminLayout. Nothing else about the page changes —
/api/user/profile is open to any authenticated user, so password change already
worked; it was only unreachable."
```

---

### Task 4: No dead ends

Two things still hand this user a link they cannot follow: the Dashboard nav item, which carries
no permission and so renders for everybody, and the hardcoded `/dashboard` recovery on the 403
and 404 pages.

> **AMENDED DURING EXECUTION.** The whole-branch review found a third: `Layout`'s `brandTo` still
> defaulted to `/dashboard`, so the most prominent element in the chrome pointed at a page the
> guard bounces a cluster admin out of — it now defaults from `hasPlatformAuthority` beside the nav
> fallback. The `home` derivation in Steps 2 and 3 also gained a second condition: `!hasPlatformAuthority
> && hasClusterAdminScope`, so only a user *confined* to the cluster-admin space is sent there. With
> Task 2's fall-through restored, a user with neither authority can reach `/dashboard` again, and
> sending them to the picker's "No clusters to administer" empty state would be a second dead end.

**Files:**
- Modify: `src/components/Layout.tsx:36` (destructure) and `:76` (nav fallback)
- Modify: `src/pages/Forbidden.tsx:1-45`
- Modify: `src/pages/NotFound.tsx:1-50`
- Modify: `src/pages/Forbidden.test.tsx` and `src/pages/NotFound.test.tsx` (fixture repair only)

**Interfaces:**
- Consumes: `useAuth().hasPlatformAuthority` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Make `Layout`'s fallback nav authority-aware**

In `src/components/Layout.tsx`, add `hasPlatformAuthority` to the destructure on line 36:

```tsx
  const { user, logout, hasPermission, isSuperAdmin, hasPlatformAuthority } = useAuth();
```

and change line 76:

```tsx
  // `platformNav`'s Dashboard entry carries no `permission`, so it renders for everyone —
  // including a membership-only cluster admin, whose sidebar would be a single link to a page
  // PrivateRoute bounces them out of. Deciding here rather than in each page means no future
  // page can forget. An explicit navItems prop still wins, so ClusterAdminLayout is unaffected.
  const navItems = navItemsProp ?? (hasPlatformAuthority ? buildPlatformNav({ hasPermission, isSuperAdmin }) : []);
```

- [ ] **Step 2: Make `Forbidden` recover somewhere useful**

In `src/pages/Forbidden.tsx`: change the lucide import on line 3 to bring in `Network`, add the
`useAuth` import, and derive the destination.

```tsx
import { ArrowLeft, LayoutDashboard, Network, ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
```

Inside the component, replacing line 21:

```tsx
  const { hasPlatformAuthority } = useAuth();
  const home = hasPlatformAuthority ? '/dashboard' : '/cluster-admin';
  const goBack = useBackOrFallback(home);
```

and the second action button (lines 37-40):

```tsx
            <Button variant="ghost" onClick={() => navigate(home)}>
              {hasPlatformAuthority
                ? <LayoutDashboard className="mr-2 h-4 w-4" />
                : <Network className="mr-2 h-4 w-4" />}
              {hasPlatformAuthority ? 'Go to Dashboard' : 'Go to Cluster Admin'}
            </Button>
```

`Network` matches the icon `HeaderUserMenu` already uses for the "Cluster Admin view" item.

The header comment on lines 9-17 stays accurate — the shell is still unconditional; only the
destination varies. Do not change the title string "Access Denied": `SuperAdminManagement.test.tsx`
asserts it through the live guard.

- [ ] **Step 3: Do the same in `NotFound`**

`src/pages/NotFound.tsx` already imports `useAuth` (line 7) and reads `loading` from it (line 25).
Change the lucide import on line 3 to add `Network`, widen the destructure, and derive `home`:

```tsx
import { ArrowLeft, FileQuestion, LayoutDashboard, Network } from 'lucide-react';
```
```tsx
  const { loading, hasPlatformAuthority } = useAuth();
  const home = hasPlatformAuthority ? '/dashboard' : '/cluster-admin';
  const goBack = useBackOrFallback(home);
```

and the second action button (lines 46-49):

```tsx
            <Button variant="ghost" onClick={() => navigate(home)}>
              {hasPlatformAuthority
                ? <LayoutDashboard className="mr-2 h-4 w-4" />
                : <Network className="mr-2 h-4 w-4" />}
              {hasPlatformAuthority ? 'Go to Dashboard' : 'Go to Cluster Admin'}
            </Button>
```

- [ ] **Step 4: Repair the two test fixtures**

`src/pages/NotFound.test.tsx:17` — the mock currently carries only `loading`. Its tests assert
`navigate('/dashboard')` (line 72) and `navigate('/dashboard', { replace: true })` (line 89), so
the fixture must say this user has platform authority:

```ts
const auth = vi.hoisted(() => ({ loading: false, hasPlatformAuthority: true }));
```

`src/pages/Forbidden.test.tsx` mocks **no** AuthContext at all — `Forbidden` did not call
`useAuth` before this task, and now it does, so the real hook would throw "useAuth must be used
within an AuthProvider". Add the mock beside the existing `vi.mock` calls, above the
`vi.mock('../components/Layout', …)` block on line 19:

```ts
const auth = vi.hoisted(() => ({ hasPlatformAuthority: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
```

Its existing assertions on `/dashboard` (lines 58 and 66) then keep passing unchanged. Do not add
new test cases.

- [ ] **Step 5: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all clean, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/components/Layout.tsx src/pages/Forbidden.tsx src/pages/NotFound.tsx src/pages/Forbidden.test.tsx src/pages/NotFound.test.tsx
git commit -m "fix(auth): stop offering a cluster admin links they cannot follow

The Dashboard nav item carries no permission, so buildPlatformNav returned it to
everyone — a membership-only admin's sidebar was one link to a page the guard
bounces them out of. Layout's fallback now yields an empty nav for them, which
also covers the two pages that still render the default shell: 403 and 404.
Both now recover to /cluster-admin instead of /dashboard."
```

---

### Task 5: Delete the dev permission mock

`DEV_MOCK_EFFECTIVE_PERMISSIONS` grants all 31 platform keys whenever the backend returns no
permissions in dev. That is exactly the state a membership-only cluster admin is in, so with it
in place this whole feature is invisible in development and cannot be verified in a browser.
Its own comment scopes it to "building Phase 2–4 UI before roles are assigned"; roles have been
seeded on DEV since.

**Files:**
- Modify: `src/utils/permissions.ts` (delete the constant and its doc comment)
- Modify: `src/context/AuthContext.tsx:7` (import) and `:71-82` (`applyEffectivePermissions`)
- Modify: `src/pages/ApplicationManagement.test.tsx:37,112`, `src/pages/ReportTemplateManagement.test.tsx:37,100`, `src/pages/RoleManagement.test.tsx:39,110`, `src/pages/UserManagement.test.tsx:95` (comments only)

**Interfaces:**
- Consumes: `checkPlatformAuthority` (Task 1) — already wired, nothing new.
- Produces: nothing.

- [ ] **Step 1: Delete the constant**

Remove `DEV_MOCK_EFFECTIVE_PERMISSIONS` and its doc comment from `src/utils/permissions.ts`
entirely. `PERMISSIONS`, `UNRESOLVED_CLUSTER_ID`, `checkPermission`, and `checkPlatformAuthority`
all stay.

- [ ] **Step 2: Simplify `applyEffectivePermissions`**

In `src/context/AuthContext.tsx`, drop the constant from the line 7 import:

```ts
import { checkPermission, checkPlatformAuthority } from '../utils/permissions';
```

Replace `applyEffectivePermissions` (lines 71-82) with a plain setter:

```ts
  const applyEffectivePermissions = (eff?: EffectivePermissions | null): EffectivePermissions | null => {
    const value: EffectivePermissions | null = eff ?? null;
    setEffectivePermissions(value);
    if (value) localStorage.setItem('effectivePermissions', JSON.stringify(value));
    else localStorage.removeItem('effectivePermissions');
    return value;
  };
```

The `// dev-mock fallback applies in dev; null in prod` comment on line 89 is now wrong — change
it to `// no permissions resolved`.

Do **not** remove the `isDev` constant on line 12: line 213 still uses it for verbose login errors.

- [ ] **Step 3: Fix the four stale test comments**

Each of these mentions the deleted constant in a comment only — no imports, no behavioural
coupling. Rewrite each to describe the permission set directly rather than naming the constant.
For example, `src/pages/ApplicationManagement.test.tsx:37` currently reads:

```
// `application.*` is platform-scoped (DEV_MOCK_EFFECTIVE_PERMISSIONS.platform,
```

Make it:

```
// `application.*` is a platform-scoped permission (never granted per-cluster),
```

Apply the same treatment at `ApplicationManagement.test.tsx:112`,
`ReportTemplateManagement.test.tsx:37` and `:100`, `RoleManagement.test.tsx:39` and `:110`, and
`UserManagement.test.tsx:95`. Keep each comment's meaning; only stop naming a symbol that no
longer exists.

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all clean, full suite green. `AuthContext.test.tsx` resolves `is_super_admin: true`, so
it never exercised the deleted branch.

- [ ] **Step 5: Commit**

```bash
git add src/utils/permissions.ts src/context/AuthContext.tsx src/pages/ApplicationManagement.test.tsx src/pages/ReportTemplateManagement.test.tsx src/pages/RoleManagement.test.tsx src/pages/UserManagement.test.tsx
git commit -m "chore(auth): delete DEV_MOCK_EFFECTIVE_PERMISSIONS

It granted all 31 platform keys whenever the backend returned none in dev —
precisely the state of a membership-only cluster admin, so the boundary this
branch draws was invisible in development and could not be verified in a
browser. Its comment scoped it to building UI before roles were seeded; DEV has
had 31 permissions and 5 roles seeded for some time.

The bootstrap hatch (userCount <= 1) remains the escape valve for a genuinely
fresh install. A dev pointed at an unseeded backend can no longer sign in."
```

---

## Manual verification

Static checks do not prove the boundary holds; the browser does. Run `bun run dev:dev` and work
through the spec's §9 list. The checks that matter most, in order:

1. Sign in as a membership-only cluster admin (no platform role row). Login lands on
   `/cluster-admin`, not `/dashboard`.
2. Type `/dashboard`, `/clusters`, `/users`, `/profile`, and `/403` in turn. Each replaces with
   `/cluster-admin`. **Watch the network tab** — no *page-driven* list request should be issued;
   if you see one, `<Dashboard>` mounted before the guard ran. `GET /api-system/users` is **not**
   one: typing a URL reloads the app, and `AuthContext`'s mount effect fires `fetchUserCount()`
   unconditionally for every restored session, which predates this branch.
3. The user menu shows no "Platform Admin view" item.
4. User menu → Profile lands on `/cluster-admin/:clusterId/profile`, with the three-item cluster
   sidebar and the breadcrumb `Cluster Admin › Profile`. Change the password from there.
5. A nonsense URL renders 404 with an empty sidebar and a working "Go to Cluster Admin" button.
6. Sign in as a super admin: `/dashboard` and the full nav are unchanged, `/profile` keeps the
   platform shell, and switching into the cluster-admin view then opening Profile keeps you in
   that view (this is the case Task 3 Step 3's comment is about).
7. Both layouts at 375px, 768px, and 1440px — read `window.innerWidth` to confirm the viewport,
   since page zoom can pin it while a screenshot looks right.
