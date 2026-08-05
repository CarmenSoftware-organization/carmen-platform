# Cluster Admin Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give cluster administrators their own route-space, navigation, and four focused
pages — edit their cluster, manage its business units, invite users, and manage members —
instead of the 16-item platform nav they see today.

**Architecture:** The nav definition is lifted out of `Layout.tsx` so the same shell serves two
navigations. A new `/cluster-admin/:clusterId/*` route-space sits behind `ClusterAdminRoute`,
which resolves scope once from `AuthContext`; every page beneath it reads `clusterId` from
`useParams()` and holds no shared selection state.

**Tech Stack:** React 19, TypeScript strict, Vite 8, react-router-dom v6, shadcn/ui + Radix,
TanStack Table v8 via `DataTable`, axios, sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-05-cluster-admin-layout-design.md` (sections 2, 4, 5, 6)

## Global Constraints

- **No test-authoring steps.** Per the operator's working preferences, tasks implement,
  type-check, lint, and commit. Do **not** create `*.test.ts` / `*.test.tsx` files. The
  existing suite must stay green.
- **Never modify `src/components/ui/`** primitives.
- **Never** use `alert()`, `window.alert()`, or `window.confirm()` — use `toast.*` from sonner
  and `<ConfirmDialog>`.
- **Never** add a `#` row-index column to `DataTable` — it adds one itself.
- **Never** use raw green Tailwind classes for status — use `<Badge variant="success" | "secondary">`.
- **Never** add external libraries.
- Every `catch` uses `parseApiError(err)` + `toast.error()`, plus `setFieldErrors(fields)` when returned.
- Wrap column definitions in `useMemo` with correct deps.
- Wrap all debug-only code in `process.env.NODE_ENV === 'development'`.
- Shared types go in `src/types/index.ts`; page-local `FormData` interfaces stay in the page file.
- New fields are optional (`?`) unless the API guarantees them.
- Mobile-first; `md` is the sidebar pivot, `lg` the two-column form pivot.
- Versioned-entity edit pages thread `doc_version` via `src/utils/docVersion.ts` — dedicated
  `docVersion` state, **never** in `formData`, sent only when present, 409 →
  `notifyVersionConflict()` + refetch.
- Verification command set for every task: `bun run typecheck` then `bun run lint`.

## Dependency on the backend plan

`../../carmen-turborepo-backend-v2/docs/superpowers/plans/2026-08-05-cluster-admin-authz-and-scope.md`
must be **merged and deployed to DEV** before Task 11's browser verification can pass.
Tasks 1–10 can be written and type-checked before that; they will simply 403 or 404 at runtime
until the backend is live.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/types/index.ts` | `AdminCluster`, `AdminScope`, `ClusterInvitation`, `InvitationBusinessUnit`, `InvitationCreatePayload`; extend `AuthContextValue` | 1, 2 |
| `src/services/clusterAdminService.ts` (new) | admin-scope lookup + the four invitation calls | 1 |
| `src/context/AuthContext.tsx` | hold `adminScope`, expose `isClusterAdminOf`, widen the login gate | 2 |
| `src/components/nav/platformNav.ts` (new) | the current 16-item nav, moved verbatim | 3 |
| `src/components/nav/clusterAdminNav.ts` (new) | the three cluster-admin items | 3 |
| `src/components/Layout.tsx` | accept optional `navItems` + `headerSlot` | 3 |
| `src/components/ClusterAdminRoute.tsx` (new) | scope guard for `:clusterId` | 4 |
| `src/components/ClusterAdminLayout.tsx` (new) | compose cluster nav + switcher into `Layout` | 4 |
| `src/components/ClusterSwitcher.tsx` (new) | header cluster picker dialog | 4 |
| `src/pages/clusterAdmin/ClusterAdminEntry.tsx` (new) | `/cluster-admin` — redirect or picker | 4 |
| `src/pages/clusterAdmin/ClusterAccessLost.tsx` (new) | mid-session 403 recovery state | 4 |
| `src/App.tsx` | register the route-space | 4 |
| `src/pages/clusterAdmin/ClusterProfile.tsx` (new) | edit the cluster | 5 |
| `src/pages/clusterEdit/sections/DetailsSection.tsx` | add `canEditLicensing` | 5 |
| `src/pages/clusterAdmin/BusinessUnitList.tsx` (new) | BU management page | 6 |
| `src/pages/clusterAdmin/BusinessUnitForm.tsx` (new) | BU create/edit page | 7 |
| `src/pages/clusterAdmin/ClusterUsers.tsx` (new) | tab shell + members tab | 8 |
| `src/pages/clusterAdmin/MembersTable.tsx` (new) | members list + row actions | 8 |
| `src/pages/clusterAdmin/InvitationsTable.tsx` (new) | invitation list + revoke/resend | 9 |
| `src/pages/clusterAdmin/InviteUserDialog.tsx` (new) | issue an invitation | 9 |
| `src/components/HeaderUserMenu.tsx` | view-switch item | 10 |
| `src/components/Breadcrumbs.tsx` | `cluster-admin` label + non-navigable | 10 |

---

### Task 1: Types and `clusterAdminService`

Everything else consumes these. Written first so later tasks have exact names to import.

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/services/clusterAdminService.ts`

**Interfaces:**
- Consumes: `api` from `src/services/api.ts`, `QueryParams` from `src/utils/QueryParams`,
  `PaginateParams` / `ApiListResponse` from `src/types`.
- Produces: the five types below and the `clusterAdminService` default export with
  `getMyAdminClusters`, `listInvitations`, `createInvitation`, `revokeInvitation`, `resendInvitation`.

- [ ] **Step 1: Add the types**

Append to `src/types/index.ts`, near the existing `ClusterUser` block:

```ts
/** A cluster the signed-in user administers, as returned by GET /api-system/me/admin-clusters. */
export interface AdminCluster {
  id: string;
  name: string;
  code: string;
  is_active?: boolean;
}

/**
 * The caller's cluster-admin reach. Mirrors the backend's adminClusterScope: `all` is true
 * only for platform super admins, for whom `clusters` is a searchable page rather than the
 * complete set. For everyone else `clusters` is the whole truth.
 */
export interface AdminScope {
  all: boolean;
  clusters: AdminCluster[];
}

/** One business unit an invitation grants access to, and the role granted there on accept. */
export interface InvitationBusinessUnit {
  business_unit_id: string;
  role: string;              // enum_user_business_unit_role
  is_default?: boolean;
}

/** Request body for POST /api-system/clusters/:cluster_id/invitations. */
export interface InvitationCreatePayload {
  email: string;
  cluster_role: string;      // enum_cluster_user_role
  business_units: InvitationBusinessUnit[];
}

/** An issued invitation, with the status the backend computes from its expiry and acceptance. */
export interface ClusterInvitation {
  id: string;
  email: string;
  cluster_role?: string;
  status?: string;
  expires_at?: string;
  created_at?: string;
  business_units?: InvitationBusinessUnit[];
}
```

- [ ] **Step 2: Create the service**

Create `src/services/clusterAdminService.ts`, following the shape of `src/services/clusterService.ts`:

```ts
import api from './api';
import QueryParams from '../utils/QueryParams';
import type {
  AdminScope,
  ApiListResponse,
  ClusterInvitation,
  InvitationCreatePayload,
  PaginateParams,
} from '../types';

const clusterSearchFields = ['name', 'code'];

const clusterAdminService = {
  /**
   * Which clusters the signed-in user administers. `all` short-circuits every scope check —
   * a super admin administers everything, so `clusters` is only a searchable page.
   */
  getMyAdminClusters: async (paginate: PaginateParams = {}): Promise<AdminScope> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      clusterSearchFields,
      {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(`/api-system/me/admin-clusters?${q.toQueryString()}`);
    const body = response.data;
    return {
      // `all` travels inside `summary`, not at the top level: the gateway's response envelope
      // rebuilds any `{ data, paginate }`-shaped payload from those two keys alone and drops
      // every other top-level field. `summary` is the one extra key it preserves.
      all: body?.summary?.all === true,
      clusters: Array.isArray(body?.data) ? body.data : [],
    };
  },

  listInvitations: async (
    clusterId: string,
    paginate: PaginateParams = {},
  ): Promise<ApiListResponse<ClusterInvitation>> => {
    const q = new QueryParams(
      paginate.page,
      paginate.perpage,
      paginate.search,
      paginate.searchfields,
      ['email'],
      {},
      paginate.sort,
      paginate.advance,
    );
    const response = await api.get(
      `/api-system/clusters/${clusterId}/invitations?${q.toQueryString()}`,
    );
    return response.data;
  },

  createInvitation: async (clusterId: string, payload: InvitationCreatePayload) => {
    const response = await api.post(`/api-system/clusters/${clusterId}/invitations`, payload);
    return response.data;
  },

  revokeInvitation: async (clusterId: string, invitationId: string) => {
    const response = await api.delete(
      `/api-system/clusters/${clusterId}/invitations/${invitationId}`,
    );
    return response.data;
  },

  resendInvitation: async (clusterId: string, invitationId: string) => {
    const response = await api.post(
      `/api-system/clusters/${clusterId}/invitations/${invitationId}/resend`,
    );
    return response.data;
  },
};

export default clusterAdminService;
```

> `getMyAdminClusters` reads `response.data` directly — **no** `?? response.data.data` fallback.
> This route's payload is the envelope: `data`, `paginate`, and `summary` are its top-level keys.
> The `Array.isArray` guard is the only defence needed. (An earlier draft of this plan described
> a tolerant double-unwrap copied from `applicationService`; that pattern does not apply here and
> would read the wrong object.)

- [ ] **Step 3: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/services/clusterAdminService.ts
git commit -m "feat(cluster-admin): add admin-scope and invitation types and service"
```

---

### Task 2: `AuthContext` holds the admin scope and the login gate widens

Today a user whose only authority is a cluster-admin membership is rejected at login, because
the gate reads platform permissions alone.

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Modify: `src/types/index.ts` (the `AuthContextValue` interface, around line 439)

**Interfaces:**
- Consumes: `clusterAdminService.getMyAdminClusters` (Task 1).
- Produces: on the auth context — `adminScope: AdminScope | null` and
  `isClusterAdminOf: (clusterId: string) => boolean`.

- [ ] **Step 1: Extend `AuthContextValue`**

Add to the interface in `src/types/index.ts`:

```ts
  adminScope: AdminScope | null;
  isClusterAdminOf: (clusterId: string) => boolean;
```

- [ ] **Step 2: Add the state and fetcher**

In `AuthContext.tsx`, beside the existing `effectivePermissions` state:

```ts
  const [adminScope, setAdminScope] = useState<AdminScope | null>(null);
```

Add the fetcher beside `fetchEffectivePermissions`:

```ts
  /**
   * Resolve which clusters this user administers.
   *
   * Deliberately has no dev-mock fallback, unlike fetchEffectivePermissions. A mock here would
   * hand every dev session admin rights over every cluster and hide exactly the scoping bugs
   * this value exists to surface. A failed fetch means "administers nothing".
   */
  const fetchAdminScope = async (): Promise<AdminScope | null> => {
    try {
      const scope = await clusterAdminService.getMyAdminClusters({ page: 1, perpage: 100 });
      setAdminScope(scope);
      localStorage.setItem('adminScope', JSON.stringify(scope));
      return scope;
    } catch {
      const empty: AdminScope = { all: false, clusters: [] };
      setAdminScope(empty);
      localStorage.removeItem('adminScope');
      return empty;
    }
  };
```

- [ ] **Step 3: Load it on mount, at login, and clear it on logout**

In the mount effect, beside `fetchEffectivePermissions()`:

```ts
      const storedAdminScope = localStorage.getItem('adminScope');
      if (storedAdminScope) {
        setAdminScope(JSON.parse(storedAdminScope));
      }
```

and add `fetchAdminScope();` next to the existing `fetchEffectivePermissions();` call.

In `logout()`, beside the other removals:

```ts
    localStorage.removeItem('adminScope');
```

and `setAdminScope(null);` beside `setEffectivePermissions(null);`.

- [ ] **Step 4: Widen the login gate**

In `login()`, replace the two-promise `Promise.all` and the gate that follows it:

```ts
      const [eff, count, scope] = await Promise.all([
        fetchEffectivePermissions(),
        fetchUserCount(),
        fetchAdminScope(),
      ]);
      const hasAnyPermission =
        !!eff && (eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters).length > 0);
      // A cluster-admin membership is authority in its own right — it is what gates every
      // invitation and membership route on the server. Without this clause a user whose only
      // authority is that membership cannot enter the app at all.
      const hasClusterAdmin = !!scope && (scope.all || scope.clusters.length > 0);
      const isBootstrap = count !== null && count <= 1; // first-admin escape hatch
      if (!hasAnyPermission && !hasClusterAdmin && !isBootstrap) {
```

In the teardown block inside that `if`, add:

```ts
        localStorage.removeItem('adminScope');
        setAdminScope(null);
```

- [ ] **Step 5: Expose the derived check on the context value**

```ts
  const isClusterAdminOf = (clusterId: string): boolean =>
    !!adminScope && (adminScope.all || adminScope.clusters.some((c) => c.id === clusterId));
```

and add `adminScope` and `isClusterAdminOf` to the `value` object.

- [ ] **Step 6: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 7: Run the existing suite**

Run: `bun run test`
Expected: PASS. `src/context/AuthContext.test.tsx` mocks services — if it fails because
`clusterAdminService` is unmocked, add it to that file's existing `vi.mock` block with
`getMyAdminClusters` resolving `{ all: false, clusters: [] }`. Do not weaken any assertion.

- [ ] **Step 8: Commit**

```bash
git add src/context/AuthContext.tsx src/types/index.ts
git commit -m "feat(auth): hold cluster-admin scope and admit membership admins at login"
```

---

### Task 3: Lift the navigation out of `Layout`

`Layout.tsx` hardcodes the 16-item nav at lines 58–84. That list is the only part of the shell
that differs between the two layouts.

**Files:**
- Create: `src/components/nav/platformNav.ts`
- Create: `src/components/nav/clusterAdminNav.ts`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: `NavItem` from `src/components/Sidebar`.
- Produces:
  - `buildPlatformNav(opts: { hasPermission: (key: string) => boolean; isSuperAdmin: boolean }): NavItem[]`
  - `buildClusterAdminNav(clusterId: string): NavItem[]`
  - `Layout` props `navItems?: NavItem[]` and `headerSlot?: React.ReactNode`

- [ ] **Step 1: Create `platformNav.ts`**

Move lines 58–84 of `Layout.tsx` verbatim — the same paths, labels, icons, permissions, and
groups, and the same filter.

```ts
import {
  LayoutDashboard, Network, Building2, Users, FileText, Newspaper, Megaphone, AppWindow,
  ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database, LayoutGrid, Mail, FileSpreadsheet,
} from 'lucide-react';
import type { NavItem } from '../Sidebar';

const ALL_PLATFORM_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  // Organization
  { path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' },
  { path: '/business-units', label: 'Business Units', icon: Building2, permission: 'cluster.read', group: 'Organization' },
  { path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' },
  { path: '/tenant-imports', label: 'Data Import', icon: FileSpreadsheet, permission: 'data_import.manage', group: 'Organization' },
  { path: '/users', label: 'Users', icon: Users, permission: 'user.read', group: 'Organization' },
  // Content
  { path: '/report-templates', label: 'Report Templates', icon: FileText, permission: 'report_template.read', group: 'Content' },
  { path: '/report-form-groups', label: 'Form Groups', icon: LayoutGrid, permission: 'report_template.read', group: 'Content' },
  { path: '/news', label: 'News', icon: Newspaper, permission: 'news.read', group: 'Content' },
  { path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, permission: 'broadcast.send', group: 'Content' },
  // Platform
  { path: '/applications', label: 'Applications', icon: AppWindow, permission: 'application.read', group: 'Platform' },
  { path: '/platform/email-settings', label: 'Email Settings', icon: Mail, permission: 'email_setting.read', group: 'Platform' },
  { path: '/platform/roles', label: 'Roles', icon: ShieldCheck, permission: 'role.read', group: 'Platform' },
  { path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' },
  { path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' },
  { path: '/sql-workbench', label: 'SQL Workbench', icon: Database, permission: 'sql_workbench.read', group: 'Platform' },
];

/** The platform-administration navigation, filtered to what this user may reach. */
export function buildPlatformNav(opts: {
  hasPermission: (key: string) => boolean;
  isSuperAdmin: boolean;
}): NavItem[] {
  return ALL_PLATFORM_NAV_ITEMS.filter(
    (item) =>
      (!item.permission || opts.hasPermission(item.permission)) &&
      (!item.superAdminOnly || opts.isSuperAdmin),
  );
}
```

- [ ] **Step 2: Create `clusterAdminNav.ts`**

```ts
import { Building2, Network, Users } from 'lucide-react';
import type { NavItem } from '../Sidebar';

/**
 * The cluster-administration navigation. Every path carries the cluster id, so the sidebar
 * itself cannot navigate out of the cluster the URL names. No permission filtering: reaching
 * this navigation already required clearing ClusterAdminRoute.
 */
export function buildClusterAdminNav(clusterId: string): NavItem[] {
  const base = `/cluster-admin/${clusterId}`;
  return [
    { path: `${base}/cluster`, label: 'Cluster', icon: Network },
    { path: `${base}/business-units`, label: 'Business Units', icon: Building2 },
    { path: `${base}/users`, label: 'Users', icon: Users },
  ];
}
```

- [ ] **Step 3: Make `Layout` accept the nav**

In `Layout.tsx`: delete the `allNavItems` array and the `navItems` filter (lines 58–84), delete
the now-unused lucide icon imports, and replace with:

```ts
interface LayoutProps {
  children: React.ReactNode;
  /** Omit to render the platform navigation. */
  navItems?: NavItem[];
  /** Rendered at the left of the desktop header bar, before the account controls. */
  headerSlot?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children, navItems: navItemsProp, headerSlot }) => {
```

```ts
  const navItems = navItemsProp ?? buildPlatformNav({ hasPermission, isSuperAdmin });
```

Import `buildPlatformNav` from `./nav/platformNav` and keep the `NavItem` type import from
`./Sidebar`.

Render `headerSlot` in the desktop header bar, between `<Breadcrumbs />` and the `ml-auto`
block:

```tsx
          <Breadcrumbs />
          {headerSlot}
          {isDesktop && (
```

- [ ] **Step 4: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors. Lint catches any lucide import left behind by Step 3.

- [ ] **Step 5: Run the existing suite**

Run: `bun run test`
Expected: PASS — all 27 pages render `<Layout>` with no `navItems`, so they keep the platform
nav unchanged. `src/components/Sidebar.test.tsx` passes `navItems` directly and is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/ src/components/Layout.tsx
git commit -m "refactor(layout): lift the nav definition out of the shell"
```

---

### Task 4: The route-space, its guard, its shell, and the entry point

**Files:**
- Create: `src/components/ClusterAdminRoute.tsx`
- Create: `src/components/ClusterAdminLayout.tsx`
- Create: `src/components/ClusterSwitcher.tsx`
- Create: `src/pages/clusterAdmin/ClusterAdminEntry.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuth().adminScope` / `isClusterAdminOf` (Task 2), `buildClusterAdminNav` (Task 3),
  `clusterAdminService.getMyAdminClusters` (Task 1).
- Produces: `<ClusterAdminRoute>`, `<ClusterAdminLayout>`, `<ClusterSwitcher>`,
  `<ClusterAccessLost />` (no props), and the routes listed in Step 6. Later tasks render their
  page inside `<ClusterAdminLayout>` and render `<ClusterAccessLost />` on a 403.

- [ ] **Step 1: Create the guard**

```tsx
import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';

/**
 * Scope guard for /cluster-admin/:clusterId/*. Resolves once, here, so every page beneath it
 * inherits the answer instead of re-deriving it.
 *
 * This is navigation, not security: each request underneath still meets isClusterAdmin on the
 * server. That is what makes deciding from the cached scope acceptable.
 *
 * A failed check renders <Forbidden /> in place rather than redirecting, matching PrivateRoute —
 * redirecting to /403 would trap the user, since Back returns to the blocked route.
 */
const ClusterAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, adminScope, isClusterAdminOf } = useAuth();
  const { clusterId } = useParams<{ clusterId: string }>();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminScope === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!clusterId || !isClusterAdminOf(clusterId)) {
    return <Forbidden />;
  }

  return <>{children}</>;
};

export default ClusterAdminRoute;
```

- [ ] **Step 2: Create the switcher**

A dialog listing the administered clusters, with search. For a super admin (`all`) the search
box queries the server, since the local list is only one page.

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clusterAdminService from '../services/clusterAdminService';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import type { AdminCluster } from '../types';

interface ClusterSwitcherProps {
  currentClusterId: string;
}

/**
 * Header control for moving between administered clusters. Navigates rather than setting state:
 * the cluster identity lives in the URL, so switching is a route change and nothing else.
 */
const ClusterSwitcher = ({ currentClusterId }: ClusterSwitcherProps) => {
  const { adminScope } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [remote, setRemote] = useState<AdminCluster[] | null>(null);

  const local = adminScope?.clusters ?? [];
  const current = local.find((c) => c.id === currentClusterId);

  // Super admins hold only a page of clusters locally, so their search must reach the server.
  useEffect(() => {
    if (!open || !adminScope?.all) return;
    let cancelled = false;
    const t = setTimeout(() => {
      clusterAdminService
        .getMyAdminClusters({ page: 1, perpage: 50, search: term })
        .then((s) => { if (!cancelled) setRemote(s.clusters); })
        .catch(() => { if (!cancelled) setRemote([]); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, term, adminScope?.all]);

  const items = useMemo(() => {
    if (adminScope?.all) return remote ?? local;
    const q = term.trim().toLowerCase();
    if (!q) return local;
    return local.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [adminScope?.all, remote, local, term]);

  if (!adminScope || (!adminScope.all && adminScope.clusters.length <= 1)) return null;

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <span className="max-w-[16rem] truncate">{current?.name ?? 'Select cluster'}</span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Switch cluster</DialogTitle>
          <DialogDescription className="sr-only">
            Choose which cluster to administer
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search clusters..."
              className="h-11 border-0 focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {items.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No clusters found.</p>
            )}
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/cluster-admin/${c.id}/cluster`);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{c.name}</span>
                <span className="ml-3 shrink-0 font-mono text-xs text-muted-foreground">{c.code}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClusterSwitcher;
```

- [ ] **Step 3: Create the layout wrapper**

```tsx
import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from './Layout';
import ClusterSwitcher from './ClusterSwitcher';
import { buildClusterAdminNav } from './nav/clusterAdminNav';

/**
 * The cluster-administration shell. Reuses Layout for every piece of chrome and supplies only
 * the navigation and the header switcher.
 */
const ClusterAdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { clusterId } = useParams<{ clusterId: string }>();
  const navItems = React.useMemo(
    () => buildClusterAdminNav(clusterId ?? ''),
    [clusterId],
  );

  return (
    <Layout navItems={navItems} headerSlot={<ClusterSwitcher currentClusterId={clusterId ?? ''} />}>
      {children}
    </Layout>
  );
};

export default ClusterAdminLayout;
```

- [ ] **Step 4: Create the entry page**

`/cluster-admin` has no cluster id yet, so it decides where to send the user.

```tsx
import { Navigate, useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import EmptyState from '../../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

/**
 * Entry point for the cluster-administration space. One administered cluster goes straight in;
 * several (or super-admin reach) present a picker. None is a 403 in substance, shown as an
 * empty state because the user is authenticated and simply administers nothing.
 */
const ClusterAdminEntry = () => {
  const { adminScope } = useAuth();
  const navigate = useNavigate();

  if (adminScope === null) {
    return <div className="loading">Loading...</div>;
  }

  if (!adminScope.all && adminScope.clusters.length === 1) {
    return <Navigate to={`/cluster-admin/${adminScope.clusters[0].id}/cluster`} replace />;
  }

  return (
    <Layout navItems={[]}>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cluster Admin</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Choose a cluster to administer.
          </p>
        </div>

        {adminScope.clusters.length === 0 ? (
          <EmptyState
            icon={Network}
            title="No clusters to administer"
            description="You are not an administrator of any cluster. Ask a platform administrator to grant you access."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminScope.clusters.map((c) => (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/cluster-admin/${c.id}/cluster`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/cluster-admin/${c.id}/cluster`);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-accent"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="truncate text-base">{c.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ClusterAdminEntry;
```

- [ ] **Step 5: Create the mid-session access-lost state**

`ClusterAdminRoute` decides once, from the scope cached at login. If a platform administrator
revokes the membership while a page is open, the guard still passes and the next request
returns 403. Pages render this instead of an empty table.

Create `src/pages/clusterAdmin/ClusterAccessLost.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/ui/button';

/**
 * Shown when a request under /cluster-admin returns 403 after the guard already let the page
 * mount — the caller's admin membership was revoked mid-session. The guard cannot catch this:
 * it decides once, from the scope resolved at login.
 */
const ClusterAccessLost = () => {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You no longer administer this cluster"
      description="Your administrator access to this cluster was removed. Choose another cluster, or ask a platform administrator to restore it."
      action={
        <Button onClick={() => navigate('/cluster-admin', { replace: true })}>
          Back to my clusters
        </Button>
      }
    />
  );
};

export default ClusterAccessLost;
```

Check `src/components/EmptyState.tsx` for the exact prop used to render an action — if it is not
named `action`, use the name that file defines rather than changing the shared component.

- [ ] **Step 6: Register the routes**

In `src/App.tsx`, add the lazy imports beside the existing ones:

```ts
const ClusterAdminEntry = lazy(() => import("./pages/clusterAdmin/ClusterAdminEntry"));
const ClusterProfile = lazy(() => import("./pages/clusterAdmin/ClusterProfile"));
const ClusterAdminBusinessUnitList = lazy(() => import("./pages/clusterAdmin/BusinessUnitList"));
const ClusterAdminBusinessUnitForm = lazy(() => import("./pages/clusterAdmin/BusinessUnitForm"));
const ClusterAdminUsers = lazy(() => import("./pages/clusterAdmin/ClusterUsers"));
```

and the routes, before the `path="*"` catch-all:

```tsx
            <Route
              path="/cluster-admin"
              element={<PrivateRoute><ClusterAdminEntry /></PrivateRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/cluster"
              element={<ClusterAdminRoute><ClusterProfile /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units"
              element={<ClusterAdminRoute><ClusterAdminBusinessUnitList /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units/new"
              element={<ClusterAdminRoute><ClusterAdminBusinessUnitForm /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/business-units/:buId/edit"
              element={<ClusterAdminRoute><ClusterAdminBusinessUnitForm /></ClusterAdminRoute>}
            />
            <Route
              path="/cluster-admin/:clusterId/users"
              element={<ClusterAdminRoute><ClusterAdminUsers /></ClusterAdminRoute>}
            />
```

Import `ClusterAdminRoute` eagerly beside `PrivateRoute` — it is a guard, not a page.

> `ClusterAdminRoute` performs the authentication check itself, so it is not nested inside
> `PrivateRoute`. Nesting both would run the redirect twice.

- [ ] **Step 7: Create placeholder page modules so the build resolves**

Tasks 5–9 fill these in. Create each of the four files with a minimal default export so
Step 7's type-check passes:

```tsx
const Placeholder = () => null;
export default Placeholder;
```

Files: `src/pages/clusterAdmin/ClusterProfile.tsx`, `BusinessUnitList.tsx`,
`BusinessUnitForm.tsx`, `ClusterUsers.tsx`.

- [ ] **Step 8: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/ClusterAdminRoute.tsx src/components/ClusterAdminLayout.tsx src/components/ClusterSwitcher.tsx src/pages/clusterAdmin/ src/App.tsx
git commit -m "feat(cluster-admin): add the route-space, guard, shell, and entry point"
```

---

### Task 5: Cluster profile page

**Files:**
- Rewrite: `src/pages/clusterAdmin/ClusterProfile.tsx` (the Task 4 placeholder)
- Modify: `src/pages/clusterEdit/sections/DetailsSection.tsx`

**Interfaces:**
- Consumes: `clusterService.getById` / `update` / `uploadLogo` / `uploadAvatar`,
  `DetailsSection`, `BrandingSection`, `getDocVersion` / `isVersionConflict` /
  `notifyVersionConflict` from `src/utils/docVersion`, `ClusterAdminLayout` (Task 4).
- Produces: `DetailsSection` gains `canEditLicensing?: boolean`.

- [ ] **Step 1: Add `canEditLicensing` to `DetailsSection`**

```ts
export interface DetailsSectionProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  /**
   * Licensing fields are a platform decision — the server strips them from a membership
   * admin's update. Defaults to canEdit so existing call sites are unchanged.
   */
  canEditLicensing?: boolean;
  onCommit: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
}
```

```ts
export function DetailsSection({
  formData,
  fieldErrors,
  canEdit,
  canEditLicensing = canEdit,
  onCommit,
  onValidate,
}: DetailsSectionProps) {
  const disabled = !canEdit;
  const licensingDisabled = !canEditLicensing;
```

Then change `disabled={disabled}` to `disabled={licensingDisabled}` on the **`max_license_bu`**
`InlineField` only (`DetailsSection.tsx:60`). Leave every other field on `disabled`.

There is no `max_license_users` field on this form and there should not be one:
`max_license_users` is a **business-unit** column, and the cluster-level figure is
`total_max_license_users`, a computed aggregate that is already read-only. An earlier draft of
this plan named both fields; only the first exists.

- [ ] **Step 2: Write the page**

Base it on `src/pages/ClusterEdit.tsx` — the same load/save/edit-toggle orchestration, minus the
business-unit section, the users section, and the delete action. Required state, per the Edit
page pattern: `formData`, `savedFormData`, `fieldErrors`, `loading`, `editing`, `saving`,
`error`, `rawResponse`, `copied`, and a dedicated `docVersion`.

The three things that differ from `ClusterEdit.tsx`, spelled out:

```tsx
  const { clusterId } = useParams<{ clusterId: string }>();
```

```tsx
      <DetailsSection
        formData={formData}
        fieldErrors={fieldErrors}
        canEdit={editing}
        canEditLicensing={false}
        onCommit={handleCommit}
        onValidate={handleValidate}
      />
```

```tsx
  const handleSave = async () => {
    setSaving(true);
    try {
      await clusterService.update(clusterId!, {
        ...payload,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      toast.success('Cluster updated');
      setEditing(false);
      await fetchCluster();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchCluster();
      } else {
        const { message, fields } = parseApiError(err);
        toast.error('Failed to update cluster', { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSaving(false);
    }
  };
```

Wrap the page in `<ClusterAdminLayout>`. Include the Edit/Cancel toggle (stash `formData` into
`savedFormData` on Edit, restore on Cancel), `useUnsavedChanges(hasChanges)`,
`useGlobalShortcuts({ onSave, onCancel })`, and the dev-only debug Sheet with tabs.

- [ ] **Step 3: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 4: Run the existing suite**

Run: `bun run test`
Expected: PASS. `src/pages/clusterEdit/sections/DetailsSection.test.tsx` (if present) still
passes — `canEditLicensing` defaults to `canEdit`, so existing renders are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterAdmin/ClusterProfile.tsx src/pages/clusterEdit/sections/DetailsSection.tsx
git commit -m "feat(cluster-admin): add the cluster profile page"
```

---

### Task 6: Business-unit list page

**Files:**
- Rewrite: `src/pages/clusterAdmin/BusinessUnitList.tsx`

**Interfaces:**
- Consumes: `businessUnitService.getAll`, `DataTable`, `TableSkeleton`, `EmptyState`,
  `generateCSV` / `downloadCSV`, `ClusterAdminLayout`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the page**

Copy `src/pages/ClusterManagement.tsx` — it is the canonical Management page — and change the
entity. Everything **rule 13** requires must be present: 400ms debounced search, filter Sheet,
active-filter badges, server-side `DataTable`, CSV export, dev-only debug Sheet, `Ctrl/⌘+K`.

Required state shape: `items`, `totalRows`, `loading`, `error`, `searchTerm`, `statusFilter`,
`showFilters`, `rawResponse`, `copied`, `paginate`.

The cluster filter, which is what differs from `ClusterManagement.tsx`:

```ts
  const { clusterId } = useParams<{ clusterId: string }>();

  // Sent even though the server already scopes the caller to their administered clusters:
  // an admin of two clusters must see only the one this URL names, which is narrower.
  const buildAdvance = (): string => {
    const where: Record<string, unknown> = { cluster_id: clusterId };
    if (statusFilter.length === 1) where.is_active = statusFilter[0] === 'true';
    return JSON.stringify({ where });
  };
```

Columns, wrapped in `useMemo` with `[clusterId]` in the deps: `name`, `code`, `is_hq`,
`is_active` rendered as `<Badge variant={row.original.is_active ? 'success' : 'secondary'}>`,
and `created_at` through the inline datetime formatter. Add `meta.card` hints (`title: 'name'`,
`badge: 'is_active'`) for the sub-`lg` card layout. Do **not** add a `#` column.

Persist per-page size as `localStorage.setItem('perpage_ca_business_units', String(perpage))`.

Row click and the Add button navigate to
`/cluster-admin/${clusterId}/business-units/${id}/edit` and `.../new`.

Loading states follow the decision table exactly: `loading && items.length === 0` →
`<TableSkeleton>`; `loading && items.length > 0` → `DataTable` with the absolute overlay;
`!loading && items.length === 0` → `<EmptyState>` with the Add action; otherwise `DataTable`.

Wrap the page in `<ClusterAdminLayout>`.

- [ ] **Step 2: Render the access-lost state on a mid-session 403**

Add an `accessLost` flag set by the fetch, and render `<ClusterAccessLost />` ahead of the
loading-state decision table — an empty table would read as "this cluster has no business
units", which is a different and misleading answer.

```ts
  const [accessLost, setAccessLost] = useState(false);
```

In the fetch's catch:

```ts
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setAccessLost(true);
        return;
      }
      const { message } = parseApiError(err);
      setError(message);
      toast.error('Failed to load business units', { description: message });
    }
```

In the render, before the skeleton/overlay/empty branches:

```tsx
        {accessLost ? (
          <ClusterAccessLost />
        ) : loading && items.length === 0 ? (
```

- [ ] **Step 3: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitList.tsx
git commit -m "feat(cluster-admin): add the business-unit list page"
```

---

### Task 7: Business-unit create/edit page

**Files:**
- Rewrite: `src/pages/clusterAdmin/BusinessUnitForm.tsx`

**Interfaces:**
- Consumes: `businessUnitService.getById` / `create` / `update`, `docVersion` helpers,
  `ClusterAdminLayout`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Write the page**

Base it on `src/pages/BusinessUnitEdit.tsx` and its `src/pages/businessUnitEdit/sections/`
components, with three removals:

- **the DB-connection section entirely.** `GET .../reveal-db-connection` is gated on
  `RequirePlatformPermission('cluster.update')` and returns 403 here. `db_connection` is
  optional in the backend's create schema, so creation works without it.
- **`max_license_users`.** A platform decision, consistent with the cluster page.
- **the BU-users card.** Membership is managed on the Users page.

Required state: `buId` and `clusterId` from `useParams`, `isNew = !buId`, `formData`,
`savedFormData`, `fieldErrors`, `loading`, `editing` (new ⇒ `true`; existing ⇒ `false` until
Edit), `saving`, `error`, `rawResponse`, `copied`, `docVersion`.

`cluster_id` comes from the URL and is never a form field:

```ts
      const created = await businessUnitService.create({ ...payload, cluster_id: clusterId });
      navigate(`/cluster-admin/${clusterId}/business-units/${created.id}/edit`, { replace: true });
```

The update path threads `doc_version` and branches on conflict exactly as Task 5 Step 2 shows,
substituting `businessUnitService.update(buId!, …)` and `fetchBusinessUnit()`.

Include `useUnsavedChanges(hasChanges)`, `useGlobalShortcuts({ onSave, onCancel })`, the back
button, and the dev-only debug Sheet with tabs. Wrap in `<ClusterAdminLayout>`.

- [ ] **Step 2: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/clusterAdmin/BusinessUnitForm.tsx
git commit -m "feat(cluster-admin): add the business-unit create/edit page"
```

---

### Task 8: Users page — shell and members tab

**Files:**
- Rewrite: `src/pages/clusterAdmin/ClusterUsers.tsx`
- Create: `src/pages/clusterAdmin/MembersTable.tsx`

**Interfaces:**
- Consumes: `clusterService.getClusterUsers`, `businessUnitService.updateUserBusinessUnit` is
  **not** used here — cluster membership uses the user-cluster routes below.
- Produces:
  - `clusterService.updateClusterUser(id, data)` and `clusterService.deleteClusterUser(id)`
  - `<MembersTable clusterId members loading searchTerm onChanged />` — `searchTerm: string`
    filters the already-loaded rows client-side; Task 9 sets it when a duplicate invitation is
    rejected. Pass `''` from this task.
  - `ClusterUsers.tsx` state that Task 9 extends: `tab`, `memberSearch`, `fetchMembers`, and the
    `[+ Invite user]` button.

- [ ] **Step 1: Add the two user-cluster methods to `clusterService`**

`src/services/clusterService.ts` has `getClusterUsers` but no membership writes. Append:

```ts
  updateClusterUser: async (
    id: string,
    data: { role?: string; is_active?: boolean },
  ) => {
    const response = await api.put(`/api-system/user/clusters/${id}`, data);
    return response.data;
  },

  deleteClusterUser: async (id: string) => {
    const response = await api.delete(`/api-system/user/clusters/${id}`);
    return response.data;
  },
```

> The `id` is the `tb_cluster_user` membership row id (`ClusterUser.id`), **not** the user's id —
> the existing `ClusterUser` type comment in `src/types/index.ts` says so explicitly.

- [ ] **Step 2: Write `MembersTable`**

A `DataTable` over `ClusterUser[]`, with columns: name (composed from `userInfo.firstname` /
`middlename` / `lastname`, falling back to `name` then `username`), `email`, `role`,
`is_active` as `<Badge variant={... ? 'success' : 'secondary'}>`, and a row-action menu.

Props and the client-side filter — `getClusterUsers` returns the whole list, so narrowing it
needs no request:

```tsx
interface MembersTableProps {
  clusterId: string;
  members: ClusterUser[];
  loading: boolean;
  /** Narrows the already-loaded rows. Task 9 sets this when a duplicate invitation is rejected. */
  searchTerm: string;
  onChanged: () => void;
}
```

```ts
  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.email ?? '').toLowerCase().includes(q) ||
        (m.username ?? '').toLowerCase().includes(q) ||
        (m.name ?? '').toLowerCase().includes(q),
    );
  }, [members, searchTerm]);
```

Row actions:

```tsx
  const handleRoleChange = async (member: ClusterUser, role: string) => {
    try {
      await clusterService.updateClusterUser(member.id, { role });
      toast.success('Role updated');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to update role', { description: message });
    }
  };

  const handleToggleActive = async (member: ClusterUser) => {
    try {
      await clusterService.updateClusterUser(member.id, { is_active: !member.is_active });
      toast.success(member.is_active ? 'Member deactivated' : 'Member activated');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      toast.error('Failed to update member', { description: message });
    }
  };
```

Removal goes through `<ConfirmDialog>` calling `clusterService.deleteClusterUser(member.id)`,
then `onChanged()`. Never `window.confirm()`.

Column defs in `useMemo`. `meta.card` hints for the sub-`lg` layout.

- [ ] **Step 3: Write the page shell**

`ClusterUsers.tsx` owns the tab state, the fetch, and the `[+ Invite user]` button. Task 9
fills the second tab.

```tsx
  const { clusterId } = useParams<{ clusterId: string }>();
  const [tab, setTab] = useState<'members' | 'invitations'>('members');
  const [members, setMembers] = useState<ClusterUser[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);

  const fetchMembers = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    try {
      const data = await clusterService.getClusterUsers(clusterId);
      setRawResponse(data);
      const items = data.data || data;
      setMembers(Array.isArray(items) ? items : []);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open — the guard
      // decided once, at mount. An empty member list would read as "this cluster has no members".
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setAccessLost(true);
        setMembers([]);
        return;
      }
      const { message } = parseApiError(err);
      toast.error('Failed to load members', { description: message });
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [clusterId]);
```

Render `<ClusterAccessLost />` in place of the tabs when `accessLost` is true, and pass
`searchTerm={memberSearch}` to `<MembersTable>`.

Render `<Tabs value={tab} onValueChange={…}>` from `src/components/ui/tabs` with triggers
labelled `Members (n)` and `Invitations (n)`. Wrap in `<ClusterAdminLayout>`. Include the
dev-only debug Sheet holding `rawResponse`.

- [ ] **Step 4: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/clusterService.ts src/pages/clusterAdmin/ClusterUsers.tsx src/pages/clusterAdmin/MembersTable.tsx
git commit -m "feat(cluster-admin): add the cluster members tab"
```

---

### Task 9: Users page — invitations tab and the invite dialog

**Files:**
- Create: `src/pages/clusterAdmin/InvitationsTable.tsx`
- Create: `src/pages/clusterAdmin/InviteUserDialog.tsx`
- Modify: `src/pages/clusterAdmin/ClusterUsers.tsx`

**Interfaces:**
- Consumes: `clusterAdminService.listInvitations` / `createInvitation` / `revokeInvitation` /
  `resendInvitation` (Task 1), `businessUnitService.getAll`, the `tab` state from Task 8.
- Produces: `<InvitationsTable clusterId invitations loading onChanged />` and
  `<InviteUserDialog clusterId open onOpenChange onInvited onAlreadyMember />`.

- [ ] **Step 1: Write `InvitationsTable`**

A `DataTable` over `ClusterInvitation[]` with columns `email`, `cluster_role`, `status` as a
`<Badge>`, `expires_at` and `created_at` through the inline formatter, and row actions Resend
and Revoke. Revoke uses `<ConfirmDialog>`.

```tsx
  const handleResend = async (invitation: ClusterInvitation) => {
    try {
      await clusterAdminService.resendInvitation(clusterId, invitation.id);
      toast.success('Invitation resent');
      onChanged();
    } catch (err: unknown) {
      const { message } = parseApiError(err);
      const description =
        (err as { response?: { status?: number } })?.response?.status === 429
          ? 'Invitation rate limit reached. Please try again later.'
          : message;
      toast.error('Failed to resend invitation', { description });
    }
  };
```

- [ ] **Step 2: Write `InviteUserDialog`**

Loads the cluster's business units with the same filter Task 6 uses, then posts the payload.

```tsx
interface InviteUserDialogProps {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
  /** Called with the email when the backend reports it already has membership (409). */
  onAlreadyMember: (email: string) => void;
}
```

Form state: `email`, `clusterRole` (`'admin' | 'user'`, default `'user'`), and
`selected: Record<string, { role: string; is_default: boolean }>` keyed by business-unit id.
At most one entry may carry `is_default: true` — setting it on one clears the others.

Validate the email with `isValidEmail` from `src/utils/validation` before submitting, and show
the error inline as `<p className="text-xs text-destructive">`.

```tsx
  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setFieldErrors({ email: 'Enter a valid email address' });
      return;
    }
    setSending(true);
    try {
      await clusterAdminService.createInvitation(clusterId, {
        email,
        cluster_role: clusterRole,
        business_units: Object.entries(selected).map(([business_unit_id, v]) => ({
          business_unit_id,
          role: v.role,
          ...(v.is_default ? { is_default: true } : {}),
        })),
      });
      toast.success('Invitation sent', { description: email });
      onOpenChange(false);
      onInvited();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const { message, fields } = parseApiError(err);
      if (status === 409) {
        // The address is already a member, so the answer is on the Members tab, not here.
        toast.error('Already a member', {
          description: `${email} already has membership in this cluster.`,
        });
        onOpenChange(false);
        onAlreadyMember(email);
      } else if (status === 429) {
        toast.error('Rate limited', {
          description: 'Invitation rate limit reached. Please try again later.',
        });
      } else {
        toast.error('Failed to send invitation', { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSending(false);
    }
  };
```

The Send button follows the loading-button pattern:

```tsx
<Button onClick={handleSubmit} disabled={sending}>
  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
  {sending ? 'Sending...' : 'Send'}
</Button>
```

- [ ] **Step 3: Wire both into `ClusterUsers.tsx`**

Add invitation state and fetch beside the members state, render `<InvitationsTable>` in the
second tab, and mount `<InviteUserDialog>` behind the `[+ Invite user]` button.

`onAlreadyMember` is what makes D7 pay off — it moves the user to the answer instead of leaving
them with a 409:

```tsx
  const handleAlreadyMember = (email: string) => {
    setTab('members');
    setMemberSearch(email);
  };
```

`memberSearch` and its `searchTerm` wiring into `<MembersTable>` already exist from Task 8;
this handler only sets them.

- [ ] **Step 4: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterAdmin/
git commit -m "feat(cluster-admin): add invitations tab and the invite dialog"
```

---

### Task 10: View switching and breadcrumbs

**Files:**
- Modify: `src/components/HeaderUserMenu.tsx`
- Modify: `src/components/Breadcrumbs.tsx`

**Interfaces:**
- Consumes: `useAuth().adminScope` / `effectivePermissions` / `isSuperAdmin`.
- Produces: nothing other tasks import.

- [ ] **Step 1: Add the view-switch item**

`HeaderUserMenu` currently takes only `userInfo`, `onLogout`, and `compact`. Read the auth
context directly rather than threading more props through `Layout`:

```tsx
  const location = useLocation();
  const { adminScope, effectivePermissions, isSuperAdmin } = useAuth();

  const inClusterAdmin = location.pathname.startsWith('/cluster-admin');
  const canClusterAdmin = !!adminScope && (adminScope.all || adminScope.clusters.length > 0);
  const canPlatformAdmin = isSuperAdmin || (effectivePermissions?.platform.length ?? 0) > 0;
```

Render one item above the existing Profile entry, only when the other side is genuinely
reachable:

```tsx
        {inClusterAdmin && canPlatformAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Platform Admin view
          </DropdownMenuItem>
        )}
        {!inClusterAdmin && canClusterAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/cluster-admin')}>
            <Network className="mr-2 h-4 w-4" />
            Cluster Admin view
          </DropdownMenuItem>
        )}
```

Import `LayoutDashboard` and `Network` from `lucide-react`, `useLocation` from
`react-router-dom`, and `useAuth` from `../context/AuthContext`.

- [ ] **Step 2: Teach `Breadcrumbs` the new segment**

In `SEGMENT_LABELS` add:

```ts
  'cluster-admin': 'Cluster Admin',
```

and add `'cluster-admin'` to the `NON_NAVIGABLE` set — `/cluster-admin` does have a route, but
linking to it from a breadcrumb would bounce an admin of one cluster straight back into the
cluster they are already in.

The `:clusterId` segment is an opaque UUID and is already dropped by the existing
`isIdSegment` check — verify this by reading that function; if it labels rather than drops,
leave it alone and report, rather than changing shared breadcrumb behaviour.

- [ ] **Step 3: Type-check and lint**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 4: Run the existing suite**

Run: `bun run test`
Expected: PASS. `src/components/HeaderUserMenu` is covered by `Layout`/header tests that render
inside a router and an `AuthProvider`; if any test renders it bare, wrap it in `MemoryRouter`
and the existing auth mock rather than removing the new hooks.

- [ ] **Step 5: Commit**

```bash
git add src/components/HeaderUserMenu.tsx src/components/Breadcrumbs.tsx
git commit -m "feat(cluster-admin): add two-way view switching and breadcrumb labels"
```

---

### Task 11: Whole-change verification

**Files:** none modified.

**Prerequisite:** the backend plan is merged and deployed to DEV. Without it, steps 3–9 fail
with 403 or 404 and that failure is expected, not a defect in this work.

- [ ] **Step 1: Static checks**

Run: `bun run typecheck` then `bun run lint`
Expected: no errors.

- [ ] **Step 2: Full suite**

Run: `bun run test`
Expected: PASS, no fewer tests than the 1049 in 0.2.0. Report the count.

- [ ] **Step 3: Start the dev server against DEV**

Run: `bun run dev:dev`
Expected: Vite serves on `:3304` with no `[env] Missing …` error.

- [ ] **Step 4–9: Browser verification as a membership admin with no platform role**

Sign in as a user who is `tb_cluster_user.role='admin'` on exactly one cluster and holds no
platform role, then confirm each of:

- [ ] **Step 4:** Login succeeds and lands in the app (the Task 2 gate change).
- [ ] **Step 5:** `/cluster-admin` redirects straight into that cluster; the sidebar shows
  exactly three items — Cluster, Business Units, Users — with no Content or Platform group.
- [ ] **Step 6:** Navigating to `/clusters` renders the 403 page, and the Network tab shows the
  API returned 403 rather than data.
- [ ] **Step 7:** The business-unit list contains only that cluster's business units. Create one,
  then edit it; confirm no DB-connection section is present.
- [ ] **Step 8:** Editing the cluster saves successfully and the licensing fields are read-only.
- [ ] **Step 9:** Sending an invitation succeeds and the email arrives. Sending the same address
  again lands on the Members tab with that email in the search box.

- [ ] **Step 10: Verify as a super admin**

Confirm the "Cluster Admin view" item appears in the user menu, the switcher searches across all
clusters, and "Platform Admin view" returns to `/dashboard`.

- [ ] **Step 11: Responsive check**

Check both layouts at 375px, 768px, and 1440px. **Confirm `window.innerWidth` matches the
intended width before trusting a screenshot** — a resized window whose page zoom is not 100%
reports the old `innerWidth`, and the screenshot looks right while the breakpoint never changed.
Compare `window.innerWidth` against `window.outerWidth`.

- [ ] **Step 12: Report**

Report: the typecheck/lint result, the test count, and each browser step as pass or fail with
what was observed. Do not claim completion for any step that was not actually run.
