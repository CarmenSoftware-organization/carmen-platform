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
