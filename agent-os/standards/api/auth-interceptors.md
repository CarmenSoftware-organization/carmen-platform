# Auth Interceptors

All auth lives in two files: `src/services/api.ts` (interceptor wiring) and `src/services/tokenRefresh.ts` (the logic). Pages never touch tokens.

## Status handling

| Status | Behaviour |
|---|---|
| **401** (non-login, first time) | single-flight refresh → retry the original request transparently |
| **401** (refresh failed, or `_retry` already set) | `clearSession()` + `redirectToLogin()` |
| **403** | **propagates untouched** — caller handles it with `parseApiError` + `toast.error` |

**403 is not a session problem.** It means authenticated-but-not-authorised. Tearing the session down would log the user out and discard unsaved form state over one authorisation boundary. Never add 403 to the teardown branch.

## Non-negotiables

- **`tokenRefresh.ts` must not import `./api`** — circular import. It uses bare `axios.post` for the refresh call, which also stops a 401 on the refresh endpoint from recursing through the interceptor.
- **`refreshPromise` is single-flight.** Concurrent 401s share one refresh; N parallel refreshes would race and invalidate each other's token.
- **`redirectToLogin()` must stay a hard `window.location.href` navigation.** `clearSession()` deliberately clears only `localStorage` — not `api.defaults` headers, not React auth state. The full page reload is what discards those. Changing this to `navigate()` turns a stale `Authorization` header and an un-reset auth context into real bugs; if you ever do, move the header/state reset into `AuthContext` first.
- **`_retry` on the request config is the loop guard.** One retry per request, never more.

## No-token requests

The request interceptor redirects to `/login` when there is no token, except for `/auth/login`. Intentional — every admin-app endpoint requires auth, so redirecting beats waiting for a guaranteed 401. There are no public endpoints; don't add exceptions.

## Testing

`handleResponseError(error, retry)` takes the retry function as a **parameter** rather than importing `api`. That is what makes it testable: `tokenRefresh.test.ts` passes `vi.fn()` and asserts on `retry.mock.calls[0][0]` (`_retry` flag, `Authorization` header) with no axios instance mocked. Keep the injection when editing — don't "simplify" it to a direct `api(config)` call.
