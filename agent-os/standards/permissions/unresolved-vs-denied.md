# Unresolved ≠ Denied

`effectivePermissions` and `adminScope` are `T | null`. **`null` means "not resolved yet"**,
not "holds nothing" — an empty payload is `{ platform: [], clusters: {} }` / `{ all: false,
clusters: [] }`. Treating the two as the same is how a single failed request ejects an
administrator for the rest of the session.

## In a guard

Render a loading state while `null`; decide only once a value exists.

```tsx
if (adminScope === null) return <div className="loading">Loading...</div>;
if (!isClusterAdminOf(clusterId)) return <Forbidden />;
```

Rendering the page "just for a frame" is not free: on `/dashboard` it mounts a burst of
platform-wide list requests that all 403.

## In `PrivateRoute`, the boundary is deliberately degraded-tolerant

The view-boundary redirect only fires when `effectivePermissions !== null` — i.e. when a
payload actually resolved. A failed permission fetch nulls the value, and the guard then falls
through to the plain permission checks instead of redirecting. This is intentional: a transient
network failure must not push a platform admin into the cluster-admin space with no way back.

## The bootstrap escape hatch

`userCount <= 1` ⇒ `hasPermission` returns `true` for everything, and `hasPlatformAuthority`
reads true. It lives in `AuthContext`, **not** in `checkPermission` / `checkPlatformAuthority`
— those stay pure functions of the payload. The two must agree, or the first administrator of a
fresh install is bounced out of the view they exist to set up.

`userCount` is **never cached**, so on every cold reload it starts `null` and
`hasPlatformAuthority` reads false until the request lands. Any new check built on it must
tolerate that window rather than deciding inside it.

## In a component

`hasPermission` returns `false` for an unresolved payload — safe for hiding a button, wrong for
"you have no access" copy. If a page renders an explicit denial message, gate it on the value
having resolved, not on the boolean alone.
