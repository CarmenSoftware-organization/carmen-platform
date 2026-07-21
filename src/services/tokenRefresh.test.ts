import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  getRefreshToken,
  refreshAccessToken,
  clearSession,
  redirectToLogin,
  handleResponseError,
} from './tokenRefresh';

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
