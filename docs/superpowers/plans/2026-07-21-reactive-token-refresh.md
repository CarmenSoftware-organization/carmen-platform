# Reactive Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a `401`, silently exchange the refresh token for a new access token and transparently retry the original request, keeping the user's session alive across access-token expiry.

**Architecture:** A new testable module `src/services/tokenRefresh.ts` owns the single-flight refresh, session teardown, and the response-interceptor error handler. `src/services/api.ts` delegates its response-interceptor rejection to `handleResponseError(error, retry)`, injecting `(config) => api(config)` as the retry function so the retry branch is unit-testable without an HTTP mock adapter. `AuthContext` persists/clears `refresh_token`.

**Tech Stack:** React 19 + TypeScript, axios, Vitest (jsdom).

## Global Constraints

- **No new libraries** — use only existing deps (axios, vitest). No `axios-mock-adapter`. (CLAUDE.md rule 6)
- **Node 26 on this machine** despite declared Node 20 — `localStorage` is not a usable global in tests; stub it with `vi.stubGlobal('localStorage', makeLocalStorage())`. (memory: node-version-mismatch)
- **Vitest: explicit imports, no globals** — `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`. Co-locate `*.test.ts(x)` beside source. Assert behavior, not snapshots. (CLAUDE.md rule 18)
- **API naming:** backend JSON is `snake_case` (`access_token`, `refresh_token`); TS code is `camelCase`. The token payload keys stay `snake_case` as sent/received.
- **`tokenRefresh.ts` must NOT import `./api`** — avoids a circular import. The axios request interceptor already sets `Authorization` from `localStorage('token')` on every request, so a refresh only needs to write the new token to `localStorage`.
- **Refresh uses a bare `axios.post`** (not the `api` instance) so a `401` from `/api/auth/refresh-token` never re-enters the interceptor.
- **Run tests:** `bun run test <filter>` (one-shot Vitest). Typecheck via `bun run build`.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch: `feat/reactive-token-refresh` (already created).
- Spec: `docs/superpowers/specs/2026-07-21-reactive-token-refresh-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/services/tokenRefresh.ts` (new) | `getRefreshToken`, `refreshAccessToken` (single-flight), `clearSession`, `redirectToLogin`, `handleResponseError` |
| `src/services/tokenRefresh.test.ts` (new) | Unit tests for all of the above |
| `src/services/api.ts` (modify) | Response interceptor delegates to `handleResponseError` |
| `src/context/AuthContext.tsx` (modify) | Persist `refresh_token` on login; clear it on teardown/logout/no-token-mount |
| `src/context/AuthContext.test.tsx` (new) | Tests that login persists and logout clears `refresh_token` |

---

## Task 1: `getRefreshToken` + `refreshAccessToken` (single-flight)

**Files:**
- Create: `src/services/tokenRefresh.ts`
- Test: `src/services/tokenRefresh.test.ts`

**Interfaces:**
- Produces:
  - `getRefreshToken(): string | null`
  - `refreshAccessToken(): Promise<string>` — resolves the new access token; rejects on no-refresh-token / non-2xx / missing `access_token`. Persists `token` and (if returned) rotated `refresh_token` to `localStorage`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/tokenRefresh.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { getRefreshToken, refreshAccessToken } from './tokenRefresh';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const mockAxios = axios as unknown as { post: ReturnType<typeof vi.fn> };

// Node 26 has no usable `localStorage` global; stub an in-memory one.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: (_: number) => null,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  vi.stubGlobal('location', { href: '' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshAccessToken', () => {
  it('exchanges the refresh token, persists the new access token, and rotates the refresh token', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    mockAxios.post.mockResolvedValue({
      data: { data: { access_token: 'new-access', refresh_token: 'rfr-new' } },
    });

    const token = await refreshAccessToken();

    expect(token).toBe('new-access');
    expect(localStorage.getItem('token')).toBe('new-access');
    expect(localStorage.getItem('refresh_token')).toBe('rfr-new');
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh-token'),
      { refresh_token: 'rfr-old' },
      expect.any(Object),
    );
  });

  it('keeps the old refresh token when the response does not rotate it', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    mockAxios.post.mockResolvedValue({ data: { data: { access_token: 'new-access' } } });

    await refreshAccessToken();

    expect(localStorage.getItem('refresh_token')).toBe('rfr-old');
  });

  it('tolerates a bare (non-enveloped) response body', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    mockAxios.post.mockResolvedValue({ data: { access_token: 'bare-access' } });

    expect(await refreshAccessToken()).toBe('bare-access');
  });

  it('throws without calling the network when there is no refresh token', async () => {
    await expect(refreshAccessToken()).rejects.toThrow();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('is single-flight: concurrent callers trigger exactly one refresh call', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    let resolvePost!: (v: unknown) => void;
    mockAxios.post.mockReturnValue(new Promise((res) => { resolvePost = res; }));

    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();
    resolvePost({ data: { data: { access_token: 'shared' } } });
    const [a, b] = await Promise.all([p1, p2]);

    expect(a).toBe('shared');
    expect(b).toBe('shared');
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
  });
});

describe('getRefreshToken', () => {
  it('reads the refresh_token key', () => {
    localStorage.setItem('refresh_token', 'rfr-x');
    expect(getRefreshToken()).toBe('rfr-x');
  });

  it('returns null when absent', () => {
    expect(getRefreshToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tokenRefresh.test`
Expected: FAIL — `tokenRefresh.ts` does not exist / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/tokenRefresh.ts`:

```ts
import axios from 'axios';

const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const baseURL = import.meta.env.REACT_APP_API_BASE_URL;
  const resp = await axios.post(
    `${baseURL}/api/auth/refresh-token`,
    { refresh_token: refreshToken },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': import.meta.env.REACT_APP_API_APP_ID,
      },
    },
  );

  const data = resp.data?.data ?? resp.data;
  const newAccess: string | undefined = data?.access_token;
  if (!newAccess) {
    throw new Error('Refresh response missing access_token');
  }

  localStorage.setItem(TOKEN_KEY, newAccess);
  const newRefresh: string | undefined = data?.refresh_token;
  if (newRefresh) {
    localStorage.setItem(REFRESH_KEY, newRefresh);
  }
  return newAccess;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tokenRefresh.test`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/tokenRefresh.ts src/services/tokenRefresh.test.ts
git commit -m "feat(auth): add single-flight refreshAccessToken

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `clearSession` + `redirectToLogin`

**Files:**
- Modify: `src/services/tokenRefresh.ts`
- Test: `src/services/tokenRefresh.test.ts`

**Interfaces:**
- Produces:
  - `clearSession(): void` — removes `token`, `refresh_token`, `user`, `loginResponse`, `effectivePermissions` from `localStorage`.
  - `redirectToLogin(): void` — `window.location.href = '/login'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/services/tokenRefresh.test.ts` (add the import and two describes):

```ts
// add to the existing import from './tokenRefresh'
import { clearSession, redirectToLogin } from './tokenRefresh';

describe('clearSession', () => {
  it('removes every session key', () => {
    ['token', 'refresh_token', 'user', 'loginResponse', 'effectivePermissions']
      .forEach((k) => localStorage.setItem(k, 'v'));

    clearSession();

    ['token', 'refresh_token', 'user', 'loginResponse', 'effectivePermissions']
      .forEach((k) => expect(localStorage.getItem(k)).toBeNull());
  });
});

describe('redirectToLogin', () => {
  it('navigates to /login', () => {
    redirectToLogin();
    expect(window.location.href).toBe('/login');
  });
});
```

Update the existing top-of-file import line to include the new names:

```ts
import {
  getRefreshToken,
  refreshAccessToken,
  clearSession,
  redirectToLogin,
} from './tokenRefresh';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tokenRefresh.test`
Expected: FAIL — `clearSession` / `redirectToLogin` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/tokenRefresh.ts`:

```ts
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('loginResponse');
  localStorage.removeItem('effectivePermissions');
}

export function redirectToLogin(): void {
  window.location.href = '/login';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tokenRefresh.test`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/services/tokenRefresh.ts src/services/tokenRefresh.test.ts
git commit -m "feat(auth): add clearSession and redirectToLogin helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `handleResponseError(error, retry)`

**Files:**
- Modify: `src/services/tokenRefresh.ts`
- Test: `src/services/tokenRefresh.test.ts`

**Interfaces:**
- Consumes (module-local): `refreshAccessToken`, `clearSession`, `redirectToLogin`.
- Produces:
  - `handleResponseError(error: AxiosError, retry: (config: AxiosRequestConfig) => Promise<unknown>): Promise<unknown>`
    - `401` + not `/auth/login` + not already retried → refresh, set `Authorization: Bearer <new>` and `_retry: true` on the config, `return retry(config)`. On refresh failure → `clearSession()` + `redirectToLogin()` + reject original error.
    - `403`, or `401` already retried (both non-login) → `clearSession()` + `redirectToLogin()`, reject.
    - login-request errors, or any other status → reject unchanged (no teardown).

- [ ] **Step 1: Write the failing tests**

Append to `src/services/tokenRefresh.test.ts` (and add `handleResponseError` to the top import):

```ts
// helper to fabricate an axios-style rejection
const err = (status: number, url: string, extra: Record<string, unknown> = {}) =>
  ({ config: { url, headers: {}, ...extra }, response: { status } } as unknown as import('axios').AxiosError);

describe('handleResponseError', () => {
  it('refreshes then retries the original request on a non-login 401', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    mockAxios.post.mockResolvedValue({ data: { data: { access_token: 'fresh' } } });
    const retry = vi.fn().mockResolvedValue({ data: 'ok' });

    const result = await handleResponseError(err(401, '/api/config'), retry);

    expect(result).toEqual({ data: 'ok' });
    expect(retry).toHaveBeenCalledTimes(1);
    const passed = retry.mock.calls[0][0] as { _retry?: boolean; headers: Record<string, string> };
    expect(passed._retry).toBe(true);
    expect(passed.headers.Authorization).toBe('Bearer fresh');
  });

  it('tears down the session when the refresh call fails', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    localStorage.setItem('token', 'stale');
    mockAxios.post.mockRejectedValue({ response: { status: 401 } });
    const retry = vi.fn();
    const error = err(401, '/api/config');

    await expect(handleResponseError(error, retry)).rejects.toBe(error);
    expect(retry).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });

  it('tears down without a network call when no refresh token exists', async () => {
    const retry = vi.fn();
    const error = err(401, '/api/config');

    await expect(handleResponseError(error, retry)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });

  it('does not retry a request that was already retried (loop guard)', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    const retry = vi.fn();
    const error = err(401, '/api/config', { _retry: true });

    await expect(handleResponseError(error, retry)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });

  it('does not refresh on 403; it tears down (unchanged behavior)', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    const retry = vi.fn();
    const error = err(403, '/api/config');

    await expect(handleResponseError(error, retry)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });

  it('leaves the session intact on a login-request 401', async () => {
    localStorage.setItem('token', 'keep');
    const retry = vi.fn();
    const error = err(401, '/api/auth/login');

    await expect(handleResponseError(error, retry)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('keep');
    expect(window.location.href).toBe('');
  });

  it('refreshes only once when multiple requests 401 concurrently', async () => {
    localStorage.setItem('refresh_token', 'rfr-old');
    let resolvePost!: (v: unknown) => void;
    mockAxios.post.mockReturnValue(new Promise((res) => { resolvePost = res; }));
    const retry = vi.fn().mockResolvedValue({ data: 'ok' });

    const p1 = handleResponseError(err(401, '/api/a'), retry);
    const p2 = handleResponseError(err(401, '/api/b'), retry);
    resolvePost({ data: { data: { access_token: 'fresh' } } });
    await Promise.all([p1, p2]);

    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
```

Update the top import to include `handleResponseError`:

```ts
import {
  getRefreshToken,
  refreshAccessToken,
  clearSession,
  redirectToLogin,
  handleResponseError,
} from './tokenRefresh';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test tokenRefresh.test`
Expected: FAIL — `handleResponseError` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/services/tokenRefresh.ts` and append the function:

```ts
import type { AxiosError, AxiosRequestConfig } from 'axios';

type RetryConfig = AxiosRequestConfig & { _retry?: boolean };

export async function handleResponseError(
  error: AxiosError,
  retry: (config: AxiosRequestConfig) => Promise<unknown>,
): Promise<unknown> {
  const original = (error.config ?? {}) as RetryConfig;
  const status = error.response?.status;
  const url = original.url ?? '';
  const isLoginRequest = url.includes('/auth/login');

  if (status === 401 && !isLoginRequest && !original._retry) {
    original._retry = true;
    try {
      const newToken = await refreshAccessToken();
      original.headers = original.headers ?? {};
      (original.headers as Record<string, unknown>).Authorization = `Bearer ${newToken}`;
      return await retry(original);
    } catch {
      clearSession();
      redirectToLogin();
      return Promise.reject(error);
    }
  }

  if ((status === 401 || status === 403) && !isLoginRequest) {
    // 403, or a 401 whose retry already failed. A fresh non-login 401 always
    // returns from the block above and never falls through here.
    clearSession();
    redirectToLogin();
  }

  return Promise.reject(error);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test tokenRefresh.test`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/services/tokenRefresh.ts src/services/tokenRefresh.test.ts
git commit -m "feat(auth): add handleResponseError with reactive 401 refresh + retry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire `api.ts` response interceptor to `handleResponseError`

**Files:**
- Modify: `src/services/api.ts`

**Interfaces:**
- Consumes: `handleResponseError` from `./tokenRefresh`.

- [ ] **Step 1: Replace the response interceptor**

Replace the entire contents of `src/services/api.ts` with:

```ts
import axios from "axios";
import { handleResponseError } from "./tokenRefresh";

const api = axios.create({
  baseURL: import.meta.env.REACT_APP_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "x-app-id": import.meta.env.REACT_APP_API_APP_ID,
  },
  // Disable SSL verification for development (not recommended for production)
  httpsAgent: import.meta.env.DEV
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

// Request interceptor - redirect to login if no token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (!config.url?.includes("/auth/login")) {
      // No access_token and not a login request - redirect to login
      window.location.href = "/login";
      return Promise.reject(new Error("No access token"));
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor - reactive token refresh on 401 (logic in tokenRefresh.ts).
// On a non-login 401 the original request is retried transparently after refresh;
// 403 and failed refreshes tear the session down and redirect to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => handleResponseError(error, (config) => api(config)),
);

export default api;
```

- [ ] **Step 2: Typecheck**

Run: `bun run build`
Expected: build succeeds (no TS errors). If TS objects to `api(config)`, cast: `handleResponseError(error, (config) => api(config as never))`.

- [ ] **Step 3: Run the full test suite (no regression)**

Run: `bun run test`
Expected: PASS — all pre-existing tests plus the 16 `tokenRefresh` tests. No suite regresses.

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts
git commit -m "feat(auth): delegate response interceptor to reactive refresh handler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Persist / clear `refresh_token` in `AuthContext`

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Test: `src/context/AuthContext.test.tsx`

**Interfaces:**
- `login()` writes `localStorage('refresh_token')` from `loginData.refresh_token` when present.
- `logout()`, the login teardown-on-unauthorized path, and the no-token mount path all remove `localStorage('refresh_token')`.

- [ ] **Step 1: Write the failing tests**

Create `src/context/AuthContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
  },
}));
vi.mock('../services/permissionService', () => ({
  default: { getMyPlatformPermissions: vi.fn() },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn() },
}));

import api from '../services/api';
import permissionService from '../services/permissionService';
import userService from '../services/userService';

const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  defaults: { headers: { common: Record<string, string> } };
};
const mockPerm = permissionService as unknown as { getMyPlatformPermissions: ReturnType<typeof vi.fn> };
const mockUser = userService as unknown as { getAll: ReturnType<typeof vi.fn> };

const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: (_: number) => null,
  };
};

function Probe() {
  const { login, logout } = useAuth();
  return (
    <div>
      <button onClick={() => login({ username: 'a@b.com', password: 'p' })}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthContext refresh_token handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorage());
    // pathname '/login' is public → the no-token mount effect won't navigate.
    vi.stubGlobal('location', { href: '', pathname: '/login' });
    mockApi.get.mockResolvedValue({ data: { data: {} } });
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: true, platform: [], clusters: {} });
    mockUser.getAll.mockResolvedValue({ paginate: { total: 5 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login persists refresh_token from the login response', async () => {
    mockApi.post.mockResolvedValue({
      data: { data: { access_token: 'acc', refresh_token: 'rfr-1', expires_in: 900 } },
    });

    render(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByText('login'));

    await waitFor(() => expect(localStorage.getItem('refresh_token')).toBe('rfr-1'));
    expect(localStorage.getItem('token')).toBe('acc');
  });

  it('logout clears refresh_token', async () => {
    localStorage.setItem('token', 'acc');
    localStorage.setItem('refresh_token', 'rfr-1');

    render(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(localStorage.getItem('refresh_token')).toBeNull());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test AuthContext.test`
Expected: FAIL — `login` does not persist `refresh_token` (it is never written today).

- [ ] **Step 3: Write minimal implementation**

In `src/context/AuthContext.tsx`, make three edits.

(a) In `login()`, right after `localStorage.setItem('token', token);` (currently line ~129), add:

```tsx
      localStorage.setItem('token', token);
      if (loginData.refresh_token) {
        localStorage.setItem('refresh_token', loginData.refresh_token);
      }
```

(b) In the same `login()` teardown-on-unauthorized block (the "Access Denied" path, currently removing `token` and `effectivePermissions`), add the `refresh_token` removal:

```tsx
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('effectivePermissions');
```

(c) In `logout()`, add the `refresh_token` removal alongside the other removals:

```tsx
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginResponse');
    localStorage.removeItem('effectivePermissions');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setLoginResponse(null);
    setEffectivePermissions(null);
  };
```

(d) In the mount `useEffect` no-token branch (currently removing `token` and `user`), add the `refresh_token` removal for consistency:

```tsx
    if (!token) {
      // No access_token found - clear everything and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      delete api.defaults.headers.common['Authorization'];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test AuthContext.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `bun run test`
Expected: PASS — whole suite green.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/context/AuthContext.tsx src/context/AuthContext.test.tsx
git commit -m "feat(auth): persist and clear refresh_token in AuthContext

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Backend contract / bare-axios refresh → Task 1 (`doRefresh`).
- New module `tokenRefresh.ts` (`getRefreshToken`/`refreshAccessToken`/`clearSession`/`redirectToLogin`) → Tasks 1–2.
- Single-flight → Task 1 (tests: single-flight; Task 3: concurrent 401s).
- Interceptor 401→refresh→retry, refresh-fail→teardown → Task 3 + wiring Task 4.
- 403 unchanged → Task 3 (403 test).
- Loop guard (`_retry`) + refresh-endpoint-401 not recursing (bare axios) → Task 3.
- Rotation persisted → Task 1 (rotation test).
- No refresh token → immediate teardown → Task 3.
- `AuthContext` persist/clear `refresh_token` → Task 5.
- Types unchanged (`LoginResponse` already has the fields) → no task needed.
- All 8 spec test cases mapped to concrete tests across Tasks 1, 3, 5.

**Placeholder scan:** none — every step has real code/commands.

**Type consistency:** `refreshAccessToken(): Promise<string>`, `handleResponseError(error, retry)`, `clearSession()`, `redirectToLogin()`, `getRefreshToken()` used identically in impl, tests, and `api.ts`. Storage keys `token` / `refresh_token` consistent across `tokenRefresh.ts` and `AuthContext.tsx`.
