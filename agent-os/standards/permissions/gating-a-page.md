# Gating a Page — three places, every time

A permission gate is not one edit. Changing or adding one means touching all three, or a user
sees a door that opens onto Access Denied.

## Checklist

- [ ] **Route** — `<PrivateRoute requiredPermission="x">` in `src/App.tsx`
- [ ] **Nav item** — `ALL_PLATFORM_NAV_ITEMS` in `src/components/nav/platformNav.ts`
      (*not* `Layout.tsx` — the list moved)
- [ ] **Every link/button that navigates there** — wrap in `<Can permission="x">`.
      `grep` the path string; a page with no nav item is reached from somewhere.

All three must name the **same** key.

## The case that proves it

`/platform/permissions` has **no nav item at all** — its only entry is a button in
`RoleManagement`, which was ungated. That worked while the route and the button both meant
`role.read`. Changing the route to `rbac.read` (what the backend actually enforces) left users
holding only `role.read` clicking a visible button into Access Denied. Checking the nav list was
not enough, because the nav list never mentioned the page.

## Adding a nav item

```ts
{ path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' }
{ path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' }
```

Filtered by `(!item.permission || hasPermission(item.permission)) && (!item.superAdminOnly || isSuperAdmin)`.
Items with no `group` render ungrouped at the top.

**Keep a group's items contiguous in the array.** `Sidebar` groups by *consecutive runs* of the
same `group` label — splitting them renders the same heading twice.
