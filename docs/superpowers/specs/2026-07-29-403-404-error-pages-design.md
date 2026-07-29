# 403 / 404 Error Pages — Design

Date: 2026-07-29
Status: Approved (design gate passed)
Branch: `feature/403-404-error-pages`

## Problem

Three separate gaps in how the app reports "you can't see this":

1. **No 403 page.** `AccessDenied` is a private component declared inline inside
   `src/components/PrivateRoute.tsx:9-37`. It cannot be reached by URL, cannot be
   linked to, and cannot be reused by anything other than the route guard.
2. **No 404 page.** `src/App.tsx:310` ends with `<Route path="*" element={<Navigate to="/" replace />} />`.
   A typo in the URL silently teleports the user to the Landing page with no
   explanation — indistinguishable from a working link.
3. **An API 403 logs the user out.** `src/services/tokenRefresh.ts:103-108` treats
   `403` the same as an unrecoverable `401`: `clearSession()` + hard redirect to
   `/login`. But `403` means "authenticated, not authorised" — the session is
   perfectly valid. A user who hits one authorisation boundary loses their
   session and any unsaved form state.

## Goal

- A real `403` page with two escape hatches: **Go Back** and **Go to Dashboard**.
- A real `404` page replacing the silent redirect, with the same two escape hatches.
- An API `403` stops tearing down the session; it propagates to the caller's
  existing `parseApiError` + `toast.error` handling.

## Decisions taken (design gate)

| Question | Decision |
|---|---|
| Scope | 403 **and** 404, plus the API-403 fix |
| Route-guard 403 | Render in place at the original URL, **and** register a real `/403` route |
| Back button | Two buttons — "Go Back" (history) and "Go to Dashboard" |
| API 403 | Propagate the error; do not clear session or redirect |
| 404 shell | ~~`<Layout>` when authenticated; bare centered page when not~~ → **always `<Layout>`** (see [Correction](#correction-the-anonymous-404-variant-is-unreachable)) |
| Code structure | Shared presentational `StatusPage` + two page files + one hook |

### Why render-in-place *and* a `/403` route

Redirecting the route guard to `/403` creates a trap: a "Go Back" that calls
`navigate(-1)` returns to the blocked route, which the guard immediately bounces
back to `/403`. Rendering in place keeps the browser history entry pointing at a
page the user could actually reach, so `navigate(-1)` is safe.

The standalone `/403` route still exists so that the page is linkable — which is
what a future API-driven or deep-linked 403 would need. Both entry points render
the same `Forbidden` component.

## Current state

| Location | Today |
|---|---|
| `src/components/PrivateRoute.tsx:9-37` | inline `AccessDenied`, `<Layout>`-wrapped card, single "Back to Dashboard" button |
| `src/components/PrivateRoute.tsx:56-62` | `requiredPermission` / `requireSuperAdmin` failure → `<AccessDenied />` |
| `src/App.tsx:310` | `<Route path="*" element={<Navigate to="/" replace />} />` — the only use of `Navigate` in the file |
| `src/services/tokenRefresh.ts:103-108` | `401`-after-retry **or** `403` → `clearSession()` + `redirectToLogin()` |
| `src/services/api.ts:36-38` | interceptor comment documents the 403-tears-down behaviour |
| `src/services/tokenRefresh.test.ts:173` | test pins the 403 teardown: `'does not refresh on 403; it tears down (unchanged behavior)'` |
| `src/components/Layout.tsx:77-116` | reads `user?.…` with optional chaining throughout — renders without auth, but with an empty sidebar and an avatar reading "User" |
| `src/pages/SuperAdminManagement.test.tsx:130,150` | renders the **real** `PrivateRoute` and asserts on the text `Access Denied` |

There is no `src/components/PrivateRoute.test.tsx`. The only existing coverage of
the guard's denial path is the `SuperAdminManagement` route-gate test above.

### Constraint: keep the 403 title exactly `Access Denied`

`SuperAdminManagement.test.tsx` asserts `findByText('Access Denied')` against the
live guard. Keeping that string as the `Forbidden` page title is therefore a
contract, not a stylistic carry-over — renaming it breaks that test.

The `Access Denied` strings in `src/context/AuthContext.tsx:149` and
`src/pages/Login.tsx:105` are unrelated: they are the login-rejection message and
a substring check on it. Neither is touched by this work.

`src/components/EmptyState.tsx` is **not** reused: it is sized and typed for an
empty list inside a card (`py-12`, `text-base` heading, no status code). Widening
it to also serve as a full-page status would turn one component that does one
thing into one that half-does two.

## Design

### New: `src/components/StatusPage.tsx`

Presentational only. No router hooks, no auth, no `Layout`. Callers own all of that.

```tsx
interface StatusPageProps {
  icon: LucideIcon;
  tone: 'danger' | 'neutral';
  code: string;              // "403" | "404"
  title: string;
  description: string;
  actions: React.ReactNode;  // caller supplies the buttons
}
```

Renders a centered `Card` (`min-h-[60vh]`, `max-w-md`), matching the existing
`AccessDenied` shape so the visual change is minimal:

- circular icon badge — `bg-destructive/10` + `text-destructive` for `danger`,
  `bg-muted` + `text-muted-foreground` for `neutral`
- the status code as muted mono meta text above the title
- `<CardTitle>` for the title, `text-muted-foreground` paragraph for the description
- `actions` in a `flex flex-col sm:flex-row gap-3 justify-center` row

Uses existing tokens only (`--destructive`, `--muted`, `--muted-foreground`). No
raw Tailwind colors.

### New: `src/hooks/useBackOrFallback.ts`

```ts
export function useBackOrFallback(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    // react-router sets key === 'default' only on the first history entry
    // (fresh tab, pasted URL, hard reload). navigate(-1) there would leave the app.
    if (location.key === 'default') navigate(fallback, { replace: true });
    else navigate(-1);
  }, [navigate, location.key, fallback]);
}
```

`location.key` is checked rather than `window.history.length`, which counts
entries from other sites in the same tab and therefore cannot answer "does going
back stay inside this app?". The fallback uses `replace: true` so the error page
is not left in history for the browser's own Back button to land on again.

### New: `src/pages/Forbidden.tsx`

Always wrapped in `<Layout>` — both entry points (the route guard and the `/403`
route, which is itself behind `PrivateRoute`) guarantee an authenticated user.

- icon `ShieldX`, tone `danger`, code `403`
- title `Access Denied`
- description `You don't have permission to access this page.`
- actions: `Go Back` (`variant="outline"`, `useBackOrFallback('/dashboard')`) and
  `Go to Dashboard` (`variant="ghost"`, `navigate('/dashboard')`)

### New: `src/pages/NotFound.tsx`

> **Corrected after browser verification — see [Correction](#correction-the-anonymous-404-variant-is-unreachable) below.** The auth-conditional shell described here was built, then removed: an anonymous visitor cannot reach this page at all.

Reads `{ loading }` from `AuthContext`.

- `loading` → render the same loading placeholder `PrivateRoute` uses. Without
  this gate the shell flashes an empty sidebar during the window where
  `AuthProvider` is still deciding whether to redirect to `/login`.
- otherwise → `<Layout>{status}</Layout>`, back-fallback `/dashboard`, second
  button `Go to Dashboard`

Icon `FileQuestion`, tone `neutral`, code `404`, title `Page Not Found`,
description `The page you're looking for doesn't exist or may have been moved.`

### Changed: `src/components/PrivateRoute.tsx`

Delete the inline `AccessDenied` (lines 9-37) and its now-unused imports
(`Layout`, `Button`, `Card*`, `ShieldX`, `ArrowLeft`, `useNavigate`). Both guard
failures return `<Forbidden />`.

### Changed: `src/App.tsx`

Add, alongside the other lazy page imports:

```tsx
<Route path="/403" element={<PrivateRoute><Forbidden /></PrivateRoute>} />
```

Wrapping `/403` in `PrivateRoute` (with no permission requirement) means an
anonymous visitor pasting `/403` is sent to `/login` rather than shown an
authenticated-looking shell. There is no loop risk: `PrivateRoute` only renders
`Forbidden` when a `requiredPermission`/`requireSuperAdmin` check fails, and this
route declares neither.

Replace the catch-all:

```tsx
<Route path="*" element={<NotFound />} />
```

### Changed: `src/services/tokenRefresh.ts`

Line 103 becomes:

```ts
if (status === 401 && !isLoginRequest) {
  // A 401 whose refresh+retry already failed. A fresh non-login 401 always
  // returns from the block above and never falls through here.
  clearSession();
  redirectToLogin();
}
```

`403` now falls through to the trailing `return Promise.reject(error)` untouched.
Nothing else in the module changes.

### Changed: `src/services/api.ts`

The interceptor comment at lines 36-38 documents the old behaviour and must be
corrected: 403 no longer tears the session down; only 401 (after a failed
refresh) does.

## Edge cases

| Case | Behaviour |
|---|---|
| Paste `/403` directly into a fresh tab | `location.key === 'default'` → "Go Back" goes to `/dashboard` with `replace` |
| Paste `/403` while logged out | `PrivateRoute` redirects to `/login` |
| Blocked route reached by clicking a sidebar link | in-place 403; "Go Back" returns to the previous, reachable page |
| Blocked route reached *from another blocked route* | "Go Back" lands on the second 403; pressing again continues up the history. Accepted — no loop, each press makes progress |
| Unknown URL while auth is still resolving | loading placeholder, then the shell — no flash of an empty sidebar |
| Unknown URL while logged out | `AuthProvider` redirects to `/login`; the 404 page never renders (see Correction) |
| API 403 during a form save | error propagates; the page's existing `parseApiError` + `toast.error` runs; form state survives |
| API 401 | unchanged — refresh, retry, and tear down only if the retry fails |

## Correction: the anonymous 404 variant is unreachable

Found during manual browser verification on 2026-07-29, after the branch was
already built and reviewed.

This spec originally called for the 404 page to render a shell-less variant with
a "Go to Home" button for logged-out visitors, on the reasoning that `Layout`
would otherwise show an anonymous visitor an empty sidebar and an avatar reading
"User". That reasoning about `Layout` is correct. The premise is not: **an
anonymous visitor never reaches the 404 page.**

`src/context/AuthContext.tsx` hard-redirects on mount, before routing renders
anything:

```ts
const publicPaths = ['/', '/login', '/changelog'];
if (!publicPaths.includes(window.location.pathname)) {
  window.location.href = '/login';
}
```

Verified in the browser: logged out, `/no-such-page` lands on `/login`, not on
the 404 page. This behaviour predates the branch — before the catch-all changed,
an anonymous unknown URL went `* → Landing → /login` by the same mechanism — so
it is not a regression. But it made roughly fifteen lines of `NotFound.tsx`, and
two tests that exercised them through a mocked `useAuth`, unreachable in the
running app.

**Resolution:** the conditional was removed. `NotFound` now always renders inside
`<Layout>` and offers "Go Back" and "Go to Dashboard". The `loading` gate stays —
during the resolve-and-redirect window `isAuthenticated` is false, and rendering
the shell then would flash the empty sidebar this spec set out to avoid.

The alternative — adding the catch-all to `publicPaths` so logged-out visitors
see a real 404 instead of a silent bounce to `/login` — is arguably better UX,
but it changes authentication behaviour and was out of scope for this work.

**Method note:** every task-scoped review and the whole-branch review passed this
code. Mocking `useAuth` made the unreachable branch look reachable to every test
and every reviewer. Only running the app found it.

## Non-goals (YAGNI)

- No 500 / generic error page.
- No `ErrorBoundary` work.
- No change to `parseApiError`, `Can.tsx`, `EmptyState`, Landing, or Login.
- No automatic navigation to `/403` on an API 403 — the toast is the feedback.
- No per-permission messaging on the 403 page ("you need `cluster.read`") — the
  page is shown to end users, not operators.

## Testing (Vitest, co-located, explicit imports)

| File | Cases |
|---|---|
| `src/hooks/useBackOrFallback.test.ts` | `key === 'default'` → `navigate(fallback, { replace: true })`; any other key → `navigate(-1)` |
| `src/pages/Forbidden.test.tsx` | renders `403` + title + description; "Go Back" invokes history back; "Go to Dashboard" navigates to `/dashboard` |
| `src/pages/NotFound.test.tsx` | loading → placeholder, no status card and no shell; resolved → `Layout` mock present with the 404 card; exactly two ways out ("Go Back", "Go to Dashboard") and no "Go to Home" |
| `src/services/tokenRefresh.test.ts` | **flip line 173**: 403 must NOT call `clearSession`/`redirectToLogin`, and must reject with the original error |
| `src/components/PrivateRoute.test.tsx` (new) | unauthenticated → redirect to `/login`; failed `requiredPermission` → 403 content at the **original URL** (asserts the render-in-place decision); failed `requireSuperAdmin` → same; all checks passing → children render |
| `src/pages/SuperAdminManagement.test.tsx` | **must keep passing unchanged** — it is the regression guard on the `Access Denied` title |

`StatusPage` gets **no test file of its own** — it holds no logic, and every
prop combination it supports is covered through the `Forbidden` and `NotFound`
tests. Adding a separate file would only re-assert that props reach the DOM.

Page tests mock `Layout` and `AuthContext`, keep routing real via `MemoryRouter`,
and assert behavior/roles/text — per `CLAUDE.md` rule 18.

## Files touched

**New**
- `src/components/StatusPage.tsx`
- `src/hooks/useBackOrFallback.ts`
- `src/pages/Forbidden.tsx`
- `src/pages/NotFound.tsx`
- `src/hooks/useBackOrFallback.test.ts`
- `src/pages/Forbidden.test.tsx`
- `src/pages/NotFound.test.tsx`
- `src/components/PrivateRoute.test.tsx`

**Modified**
- `src/components/PrivateRoute.tsx`
- `src/App.tsx`
- `src/services/tokenRefresh.ts`
- `src/services/api.ts` (comment only)
- `src/services/tokenRefresh.test.ts`

**Unchanged but load-bearing**
- `src/pages/SuperAdminManagement.test.tsx` — must still pass as-is
