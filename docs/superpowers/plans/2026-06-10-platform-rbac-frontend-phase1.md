# Platform RBAC — Frontend Phase 1 (Foundation) Plan

> **For agentic workers:** Implement these as one cohesive, ADDITIVE foundation. Nothing here may break existing behavior — `hasRole`, `<PrivateRoute allowedRoles>`, and nav `roles` must keep working unchanged. The new permission primitives are added alongside them; the actual migration/enforcement happens later (Phase 4).

**Goal:** Add the client-side permission primitives so later phases can build Role/Permission UI and enforcement: types, a pure `hasPermission` resolver, `effectivePermissions` in `AuthContext` (from login/profile, with a dev mock fallback), a `<Can>` wrapper, an optional `requiredPermission` on `PrivateRoute`, and an optional `permission` field on nav items.

**Architecture:** Server-resolved permissions (Approach A). Backend returns `effective_permissions: { platform: string[]; clusters: Record<string,string[]> }` at login + profile. `AuthContext` stores it; a pure util in `src/utils/permissions.ts` does membership checks; UI consumes via `hasPermission`/`<Can>`.

**Repo:** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform` (frontend), branch `feat/platform-rbac-frontend-phase1`.

**Verify:** `bun run build` (or `CI=true bun run build` to treat warnings as errors) must pass. No unit-test runner exists yet (Vitest is pending) — `src/utils/permissions.ts` is written pure so it's testable later; for now verification is the build + manual.

---

## Task 1: Types

**File:** modify `src/types/index.ts`.

- [ ] Add new types (place near the other RBAC/auth types):
```ts
export type Scope = { type: 'platform' } | { type: 'cluster'; cluster_id: string };

export interface EffectivePermissions {
  platform: string[];                    // permission keys "resource.action"
  clusters: Record<string, string[]>;    // clusterId -> permission keys
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: string[];                 // permission keys
}

export interface PermissionCatalogItem {
  key: string;                           // "resource.action"
  resource: string;
  action: string;
  description?: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  role_name?: string;
  scope: Scope;
}
```
- [ ] Add `effective_permissions?: EffectivePermissions;` to BOTH `interface LoginResponse` and `interface User`.
- [ ] Extend `AuthContextValue` (keep all existing members, including `hasRole`):
```ts
  effectivePermissions: EffectivePermissions | null;
  hasPermission: (key: string, opts?: { clusterId?: string }) => boolean;
```

**Verify:** `bun run build` compiles (types only; no usage yet).

---

## Task 2: Pure permission resolver

**File:** create `src/utils/permissions.ts`.

- [ ] Write the pure resolver + a dev mock fixture:
```ts
import type { EffectivePermissions } from '../types';

/**
 * Pure membership check (no React, no context) so it can be unit-tested when Vitest lands.
 * Rules:
 *  - platform-scoped permission applies everywhere.
 *  - with clusterId: allowed if platform has it OR that cluster grants it.
 *  - without clusterId (broad "show a nav/page" check): allowed if it exists in platform OR ANY cluster.
 */
export function checkPermission(
  eff: EffectivePermissions | null | undefined,
  key: string,
  opts?: { clusterId?: string },
): boolean {
  if (!eff) return false;
  if (eff.platform?.includes(key)) return true;
  if (opts?.clusterId) {
    return !!eff.clusters?.[opts.clusterId]?.includes(key);
  }
  return Object.values(eff.clusters ?? {}).some((keys) => keys.includes(key));
}

/**
 * Dev-only fallback used when the backend response lacks effective_permissions
 * (e.g. building Phase 2–4 UI before roles are assigned). Grants every platform
 * action for the platform-management resources. Never used in production.
 */
export const DEV_MOCK_EFFECTIVE_PERMISSIONS: EffectivePermissions = {
  platform: [
    'cluster.read', 'cluster.create', 'cluster.update', 'cluster.delete',
    'user.read', 'user.create', 'user.update', 'user.delete', 'user.manage_roles',
    'report_template.read', 'report_template.create', 'report_template.update', 'report_template.delete',
    'print_template_mapping.read', 'print_template_mapping.create', 'print_template_mapping.update', 'print_template_mapping.delete',
    'application.read', 'application.create', 'application.update', 'application.delete',
    'news.read', 'news.create', 'news.update', 'news.delete',
    'broadcast.read', 'broadcast.send',
    'role.read', 'role.create', 'role.update', 'role.delete',
  ],
  clusters: {},
};
```

**Verify:** `bun run build` compiles.

---

## Task 3: AuthContext — store effectivePermissions + hasPermission

**File:** modify `src/context/AuthContext.tsx`.

Keep ALL existing behavior (`hasRole`, `ALLOWED_ROLES`, login gate, `userCount` escape hatch). Add alongside:

- [ ] Import the util:
```ts
import { checkPermission, DEV_MOCK_EFFECTIVE_PERMISSIONS } from '../utils/permissions';
import type { EffectivePermissions } from '../types';
```
- [ ] Add state: `const [effectivePermissions, setEffectivePermissions] = useState<EffectivePermissions | null>(null);`
- [ ] On mount (the `useEffect` that reads localStorage), restore it: read `localStorage.getItem('effectivePermissions')` and `setEffectivePermissions(JSON.parse(...))` if present (mirror how `loginResponse` is restored).
- [ ] Add a helper to derive + persist effective permissions from a response object, applying the dev fallback:
```ts
const applyEffectivePermissions = (eff?: EffectivePermissions | null) => {
  let value: EffectivePermissions | null = eff ?? null;
  if ((!value || (value.platform.length === 0 && Object.keys(value.clusters).length === 0)) && isDev) {
    value = DEV_MOCK_EFFECTIVE_PERMISSIONS;
  }
  setEffectivePermissions(value);
  if (value) localStorage.setItem('effectivePermissions', JSON.stringify(value));
  else localStorage.removeItem('effectivePermissions');
};
```
(`isDev` already exists in this file = `import.meta.env.DEV`.)
- [ ] In `login()`, after `setLoginResponse(loginData)`, call `applyEffectivePermissions(loginData.effective_permissions);`
- [ ] In `fetchProfile()`, after building `merged`, call `applyEffectivePermissions((data as { effective_permissions?: EffectivePermissions }).effective_permissions);` (the profile response may carry it; fall back to dev mock in dev).
- [ ] In `logout()`, add `localStorage.removeItem('effectivePermissions'); setEffectivePermissions(null);`
- [ ] Add the `hasPermission` function (keep `hasRole` exactly as-is):
```ts
const hasPermission = (key: string, opts?: { clusterId?: string }): boolean => {
  // Same bootstrap escape hatch as hasRole: 0–1 users => allow everything.
  if (userCount !== null && userCount <= 1) return true;
  return checkPermission(effectivePermissions, key, opts);
};
```
- [ ] Add `effectivePermissions` and `hasPermission` to the `value` object passed to the provider.

**Verify:** `bun run build` compiles; existing auth flows unchanged (hasRole/login gate untouched).

---

## Task 4: `<Can>` component

**File:** create `src/components/Can.tsx`.

- [ ] 
```tsx
import React from 'react';
import { useAuth } from '../context/AuthContext';

interface CanProps {
  permission: string;
  clusterId?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders children only when the current user holds `permission`
 * (optionally scoped to `clusterId`). Renders `fallback` (default null) otherwise.
 */
const Can: React.FC<CanProps> = ({ permission, clusterId, fallback = null, children }) => {
  const { hasPermission } = useAuth();
  return <>{hasPermission(permission, clusterId ? { clusterId } : undefined) ? children : fallback}</>;
};

export default Can;
```

**Verify:** `bun run build` compiles.

---

## Task 5: PrivateRoute — optional requiredPermission

**File:** modify `src/components/PrivateRoute.tsx`.

Keep `allowedRoles` working. Add an optional `requiredPermission` that gates the same way (shows the existing `<AccessDenied>`).

- [ ] Extend the props interface:
```ts
interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermission?: string;
}
```
- [ ] In the component, destructure `hasPermission` from `useAuth()` (alongside the existing `hasRole`), and after the existing `allowedRoles` check add:
```ts
if (requiredPermission && !hasPermission(requiredPermission)) {
  return <AccessDenied />;
}
```
Order: auth check → loading → allowedRoles check (existing) → requiredPermission check (new) → render children.

**Verify:** `bun run build` compiles; existing routes (which pass `allowedRoles` only) behave identically.

---

## Task 6: Nav item `permission` field + Layout filter

**Files:** modify `src/components/Sidebar.tsx` and `src/components/Layout.tsx`.

- [ ] In `src/components/Sidebar.tsx`, extend `NavItem`:
```ts
export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
  permission?: string;
}
```
- [ ] In `src/components/Layout.tsx`, destructure `hasPermission` from `useAuth()` (alongside the existing `hasRole`) and update the filter to honor BOTH (an item passes if it satisfies its role gate AND its permission gate; missing gate = pass):
```ts
const navItems = allNavItems.filter(
  (item) =>
    (!item.roles || hasRole(item.roles)) &&
    (!item.permission || hasPermission(item.permission)),
);
```
Do NOT change the existing items' `roles` yet (that migration is Phase 4). No item sets `permission` in Phase 1 — this just enables the capability.

**Verify:** `bun run build` compiles; the sidebar renders exactly as before (no item uses `permission` yet).

---

## Final verification

- [ ] `CI=true bun run build` passes (warnings-as-errors), confirming no unused imports / type errors across all changes.
- [ ] Sanity: grep that `hasRole`, `allowedRoles`, and nav `roles` are still present and unchanged in usage — Phase 1 is purely additive.
- [ ] Commit:
```bash
git add src/types/index.ts src/utils/permissions.ts src/context/AuthContext.tsx src/components/Can.tsx src/components/PrivateRoute.tsx src/components/Sidebar.tsx src/components/Layout.tsx
git commit -m "feat(rbac): Phase 1 frontend permission foundation (hasPermission, Can, requiredPermission, effectivePermissions)"
```

## Coverage vs spec §5.1–5.2
- §5.1 types → Task 1 ✓
- §5.2 hasPermission + effectivePermissions in AuthContext (+ escape hatch) → Task 3 ✓
- §5.2 `<Can>` → Task 4 ✓
- §5.2 PrivateRoute.requiredPermission → Task 5 ✓
- §5.2 nav permission field → Task 6 ✓
- pure utils/permissions.ts for later unit testing → Task 2 ✓
- dev mock fixture (build/test before assignments) → Task 2 + Task 3 ✓
