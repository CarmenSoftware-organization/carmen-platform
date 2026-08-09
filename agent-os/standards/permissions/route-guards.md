# Route Guards

Three guards. Pick by what is being protected — they are not interchangeable.

| Guard | Checks | Use for |
|---|---|---|
| `PrivateRoute` | auth + platform authority + optional `requiredPermission` / `requireSuperAdmin` | every platform-admin route |
| `AuthedRoute` | auth only | `/cluster-admin` **only** |
| `ClusterAdminRoute` | auth + `isClusterAdminOf(:clusterId)` | everything under `/cluster-admin/:clusterId/*` |

```tsx
<Route path="/x"     element={<PrivateRoute requiredPermission="role.read"><X /></PrivateRoute>} />
<Route path="/y"     element={<PrivateRoute requireSuperAdmin><Y /></PrivateRoute>} />
<Route path="/cluster-admin" element={<AuthedRoute><ClusterAdminEntry /></AuthedRoute>} />
```

## Why `AuthedRoute` exists

`PrivateRoute` *redirects* a membership-only cluster admin **to** `/cluster-admin`. Guarding
that route with `PrivateRoute` would redirect it to itself forever. `ClusterAdminEntry` resolves
`adminScope` itself, so checking less there loses nothing.

## Denial renders in place

A failed permission check returns `<Forbidden />` **at the current URL**. Never
`navigate('/403')`: the 403 page's "Go Back" would return to the blocked route and bounce
forward again — a trap with no exit.

The one deliberate exception is the *view boundary*: a user with no platform authority is
redirected to `/cluster-admin`, because for them every route behind `PrivateRoute` is
permanently unreachable, and a 403 whose recovery button leads to another 403 is the same trap.

## `key` on a param-scoped subtree

`ClusterAdminRoute` returns `<React.Fragment key={clusterId}>`. React Router reuses the
component instance when only a route param changes, so a history jump from one cluster's page
straight to another's (the browser's long-press Back menu does this in one popstate) would
otherwise leave the previous cluster's state mounted. One `key` at the guard spares every page
beneath it from remembering this.
