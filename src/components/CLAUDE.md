# Component conventions (`src/components/`)

Loaded when working under `src/components/`. **Never modify `src/components/ui/`
primitives without an explicit ask** (root `CLAUDE.md`, rule 2).

## Sidebar Layout

`Layout.tsx` owns sidebar state (persisted to `localStorage('sidebar-collapsed')`); `Sidebar.tsx` renders desktop fixed sidebar (`w-60` / `w-16`) and a mobile Sheet drawer. Main content margin: `md:ml-16` ↔ `md:ml-60`. Transitions via `.sidebar-transition`.

Add a nav item by editing `ALL_PLATFORM_NAV_ITEMS` in **`src/components/nav/platformNav.ts`** (`Layout.tsx` only calls `buildPlatformNav`; the cluster-admin view has its own list in `nav/clusterAdminNav.ts`). Items carry a `groupKey` (a `TKey` translated at render, e.g. `'navGroup.organization' | 'navGroup.licenseManagement' | 'navGroup.content' | 'navGroup.analytics' | 'navGroup.platform' | 'navGroup.database'`) and gate on either a single `permission` or `superAdminOnly`:
```tsx
{ path: '/clusters', labelKey: 'nav.clusters', icon: Network, permission: 'cluster.read', groupKey: 'navGroup.organization' }
{ path: '/platform/super-admins', labelKey: 'nav.superAdmins', icon: ShieldAlert, superAdminOnly: true, groupKey: 'navGroup.platform' }
```
Filtered via `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)` from `AuthContext`. Items with no `groupKey` (e.g. Dashboard) render ungrouped at top. Collapsed state shows icons only, with right-side tooltips (`delayDuration={200}`). **Keep a group's items contiguous in the array** — `Sidebar` groups by consecutive runs of `groupKey`, so splitting them renders the heading twice.

Adding a nav item is only one of the three places a gate lives — see `agent-os/standards/permissions/gating-a-page.md`.
