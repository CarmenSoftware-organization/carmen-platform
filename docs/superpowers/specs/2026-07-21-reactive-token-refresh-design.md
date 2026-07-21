# Reactive Token Refresh — Design

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation
**Author:** brainstormed with Claude

## Problem

When the `access_token` expires, the backend returns `401` and the app's axios
response interceptor (`src/services/api.ts`) immediately clears the session and
hard-redirects to `/login`. The user is kicked out mid-task even though a valid
`refresh_token` is already available.

The backend exposes `POST /api/auth/refresh-token` to exchange a refresh token
for a fresh access token, but the frontend never calls it.

## Goal

Keep the user's session alive across access-token expiry: on a `401`, silently
exchange the refresh token for a new access token and transparently retry the
original request. Only force logout when the refresh itself fails (refresh token
missing / expired / revoked).

**Strategy:** Reactive (on-401). No proactive timer. Chosen because it is the
simplest robust SPA pattern and matches the user's intent ("re-activate after
expired").

## Backend contract (verified against DEV swagger)

`POST /api/auth/refresh-token`

- **Request body:** `{ "refresh_token": string }` (required)
- **Headers:** `x-app-id` (already sent by the axios instance)
- **Query:** `version` (optional, default `latest`)
- **Response 200:** new token set, same shape as login — `{ access_token,
  refresh_token?, expires_in?, token_type? }`, wrapped in the `{ data: { ... } }`
  envelope (unwrap tolerantly as `resp.data.data || resp.data`).
- **Response 400:** missing/malformed refresh token.
- **Response 401:** refresh token missing, expired, or revoked → must log in again.

Note: `refresh_token` is opaque (`rfr-<uuid>`), not a JWT. The backend stores it
server-side and **may rotate** it — the refresh response can carry a new
`refresh_token` that must replace the stored one.

## Current state (what exists today)

- `src/services/api.ts`
  - Request interceptor: attaches `Bearer <token>`; redirects to `/login` if no
    token (except the login request).
  - Response interceptor: on `401` **or** `403` (non-login) → clears `token` +
    `user`, hard-redirects to `/login`.
- `src/context/AuthContext.tsx`
  - `login()` stores `access_token` under `localStorage('token')` and the full
    login payload under `localStorage('loginResponse')` (so `refresh_token` is
    already present in storage but unused).
  - `logout()` clears `token`, `user`, `loginResponse`, `effectivePermissions`.
- `src/types/index.ts` — `LoginResponse` already has `refresh_token?` and
  `expires_in?`. No type change needed.

## Design

### New module: `src/services/tokenRefresh.ts`

Holds the reusable, independently testable pieces so `api.ts` stays thin.

- `getRefreshToken(): string | null` — reads `localStorage('refresh_token')`.
- `refreshAccessToken(): Promise<string>` — **single-flight**. Exchanges the
  refresh token for a new access token, persists both, updates the axios default
  Authorization header, and resolves the new access token. Throws on any failure
  (no refresh token, non-200, missing `access_token`).
- `clearSession(): void` — removes `token`, `refresh_token`, `user`,
  `loginResponse`, `effectivePermissions`; deletes the axios default
  Authorization header.
- `redirectToLogin(): void` — thin wrapper over `window.location.href = '/login'`
  (wrapped so tests can spy).

**Single-flight implementation:**

```ts
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
```

`doRefresh()`:
1. `const rt = getRefreshToken()`; if absent → `throw`.
2. Call `/api/auth/refresh-token` with a **bare axios** call (not the `api`
   instance) so the request/response interceptors do not recurse. Send the
   `x-app-id` header from `import.meta.env.REACT_APP_API_APP_ID` and body
   `{ refresh_token: rt }`.
3. Unwrap `resp.data.data || resp.data`. Read `access_token` (required) and
   `refresh_token` (optional, rotation).
4. Persist: `localStorage('token') = access_token`; if `refresh_token` present,
   `localStorage('refresh_token') = refresh_token`. Set
   `api.defaults.headers.common.Authorization = Bearer <access_token>`.
5. Return `access_token`.

### `src/services/api.ts` — response interceptor

```
onRejected(error):
  original = error.config
  status   = error.response?.status
  url      = original?.url ?? ''
  isLoginRequest = url includes '/auth/login'

  if status === 401 && !isLoginRequest && !original._retry:
     original._retry = true
     try:
        newToken = await refreshAccessToken()          // single-flight
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)                            // transparent retry
     catch:
        clearSession(); redirectToLogin()
        return Promise.reject(error)

  if (status === 401 || status === 403) && !isLoginRequest:
     // reaches here for: 403 (any), or a 401 whose retry already failed
     // (_retry set). A fresh 401 always returns from the block above, so it
     // never falls through here.
     clearSession(); redirectToLogin()

  return Promise.reject(error)
```

The request interceptor is unchanged.

Note: `refreshAccessToken()` calls `/api/auth/refresh-token` with a **bare
axios** call, not the `api` instance — so a `401` from the refresh endpoint
itself never reaches this interceptor. It rejects inside `doRefresh()`, is caught
by the `try/catch` above, and results in `clearSession() + redirectToLogin()`.
That is why the interceptor only needs to special-case `/auth/login`.

### `src/context/AuthContext.tsx`

- `login()`: after resolving `loginData`, also
  `localStorage.setItem('refresh_token', loginData.refresh_token)` when present.
- `login()` teardown-on-unauthorized block (the "Access Denied" path): also
  remove `refresh_token`.
- `logout()`: also `localStorage.removeItem('refresh_token')`.
  (Prefer reusing `clearSession()` from `tokenRefresh.ts` to avoid drift, while
  keeping the React state resets — `setUser(null)` etc. — in the context.)

## Edge cases

| Case | Behavior |
|------|----------|
| No `refresh_token` in storage on 401 | `refreshAccessToken()` throws → logout + redirect, no network call |
| 401 returned by `/auth/refresh-token` itself | Treated as refresh failure → logout (no recursion) |
| Retried request 401s again (`_retry` set) | Not retried again → logout |
| Concurrent requests all 401 at once | Single shared `refreshPromise` → one refresh call; all retried with new token |
| Backend rotates refresh token | New `refresh_token` from response replaces the stored one |
| 403 (permission denied) | Unchanged from today: logout + redirect. Not treated as expiry. |

## Non-goals (YAGNI)

- Proactive timer / pre-emptive refresh using `expires_in`.
- Changing 403 handling (permission errors stay as-is).
- `returnUrl` / redirect-back-to-page after re-login.
- Moving tokens to httpOnly cookies (requires backend changes).

## Security note

`refresh_token` is stored in `localStorage` (key `refresh_token`), consistent
with the existing `access_token` storage. This does not increase XSS exposure
beyond the current posture. httpOnly-cookie storage would be more secure but
requires backend work and is out of scope.

## Testing (Vitest, no new libraries)

Unit-test `tokenRefresh.ts` with `vi.mock('axios')` and spies on `localStorage`
and `redirectToLogin`. Interceptor behavior is exercised by invoking the
response-interceptor error handler with fabricated error objects (delegating to
the mocked `tokenRefresh` module).

Cases:
1. 401 → refresh succeeds → original request retried and resolves.
2. 401 → refresh returns 401 → logout + redirect, original error rejected.
3. No refresh token in storage → immediate logout, no refresh network call.
4. Concurrent 401s (≥2) → `refreshAccessToken` fires exactly one refresh call;
   all callers retried.
5. Loop guard: request already carrying `_retry` that 401s → logout, not retried.
6. 403 → unchanged (logout + redirect), no refresh attempt.
7. Rotation: refresh response includes a new `refresh_token` → persisted.
8. `AuthContext.login()` persists `refresh_token`; `logout()` clears it.

## Files touched

- `src/services/tokenRefresh.ts` — **new**
- `src/services/api.ts` — response interceptor
- `src/context/AuthContext.tsx` — persist/clear `refresh_token`
- `src/services/tokenRefresh.test.ts` — **new** (unit tests)
- `src/services/api.test.ts` — **new** or extend (interceptor tests)
