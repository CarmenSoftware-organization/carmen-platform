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
import clusterAdminService from '../services/clusterAdminService';

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

describe('AuthContext loginWithTokens (Google sign-in)', () => {
  const jwt = ['h', btoa(JSON.stringify({ email: 'jane@example.com' })), 's'].join('.');

  function TokenProbe({ onResult }: { onResult: (result: unknown) => void }) {
    const { loginWithTokens, isAuthenticated } = useAuth();
    return (
      <div>
        <span data-testid="authed">{String(isAuthenticated)}</span>
        <button onClick={async () => onResult(await loginWithTokens(jwt, 'rfr-g'))}>google</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.stubGlobal('location', { href: '', pathname: '/login/callback' });
    mockApi.get.mockResolvedValue({ data: { data: {} } });
    mockUser.getAll.mockResolvedValue({ paginate: { total: 5 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps /login/callback public: with no token yet it must not bounce to /login and lose the fragment', () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: true, platform: [], clusters: {} });

    render(<AuthProvider><TokenProbe onResult={() => undefined} /></AuthProvider>);

    expect(window.location.href).toBe('');
  });

  it('stores both tokens and labels the user from the token email when authority is present', async () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: true, platform: [], clusters: {} });
    // The background profile fetch would overwrite the stored user with the server profile; let it fail
    // so the assertion sees the label built from the token (the fetch failing is silent by design).
    mockApi.get.mockRejectedValue(new Error('profile unavailable'));
    const results: unknown[] = [];

    render(<AuthProvider><TokenProbe onResult={(r) => results.push(r)} /></AuthProvider>);
    await userEvent.click(screen.getByText('google'));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toEqual({ success: true });
    expect(localStorage.getItem('token')).toBe(jwt);
    expect(localStorage.getItem('refresh_token')).toBe('rfr-g');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ email: 'jane@example.com' });
  });

  it('refuses a Google user with no Platform authority and leaves no session behind', async () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: false, platform: [], clusters: {} });
    vi.spyOn(clusterAdminService, 'getMyAdminClusters').mockResolvedValue({ all: false, clusters: [] });
    const results: Array<{ success: boolean; code?: string }> = [];

    render(<AuthProvider><TokenProbe onResult={(r) => results.push(r as { success: boolean; code?: string })} /></AuthProvider>);
    await userEvent.click(screen.getByText('google'));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toMatchObject({ success: false, code: 'access_denied_platform' });
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('AuthContext loginWithTokens — an earlier session is still stored', () => {
  const jwt = ['h', btoa(JSON.stringify({ email: 'jane@example.com' })), 's'].join('.');

  function Probe2({ onResult }: { onResult: (result: unknown) => void }) {
    const { loginWithTokens, isAuthenticated } = useAuth();
    return (
      <div>
        <span data-testid="authed">{String(isAuthenticated)}</span>
        <button onClick={async () => onResult(await loginWithTokens(jwt, 'rfr-g'))}>google</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.stubGlobal('location', { href: '', pathname: '/login/callback' });
    mockApi.get.mockRejectedValue(new Error('profile unavailable'));
    mockUser.getAll.mockResolvedValue({ paginate: { total: 5 } });
    // A previous user's leftovers, as an expired session would leave them.
    localStorage.setItem('token', 'old-token');
    localStorage.setItem('user', JSON.stringify({ id: 'old', email: 'old@example.com', name: 'old' }));
    localStorage.setItem('loginResponse', JSON.stringify({ access_token: 'old-token' }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a refused Google user does not end up signed in as the previous user', async () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: false, platform: [], clusters: {} });
    vi.spyOn(clusterAdminService, 'getMyAdminClusters').mockResolvedValue({ all: false, clusters: [] });
    const results: Array<{ success: boolean }> = [];

    render(<AuthProvider><Probe2 onResult={(r) => results.push(r as { success: boolean })} /></AuthProvider>);
    await userEvent.click(screen.getByText('google'));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(results[0].success).toBe(false);
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('loginResponse')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('an accepted Google user replaces the previous identity instead of inheriting it', async () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: true, platform: [], clusters: {} });
    const results: unknown[] = [];

    render(<AuthProvider><Probe2 onResult={(r) => results.push(r)} /></AuthProvider>);
    await userEvent.click(screen.getByText('google'));

    await waitFor(() => expect(results).toHaveLength(1));
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ email: 'jane@example.com' });
    expect(localStorage.getItem('token')).toBe(jwt);
  });
});
