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
  const { login, logout, loginWithTokens } = useAuth();
  return (
    <div>
      <button onClick={() => login({ username: 'a@b.com', password: 'p' })}>login</button>
      <button onClick={() => logout()}>logout</button>
      <button onClick={() => loginWithTokens('gacc', 'grfr')}>loginWithTokens</button>
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

describe('AuthContext.loginWithTokens (Google sign-in callback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.stubGlobal('location', { href: '', pathname: '/login' });
    mockApi.get.mockResolvedValue({ data: { data: {} } });
    mockUser.getAll.mockResolvedValue({ paginate: { total: 5 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('revokes the Keycloak session via /api/auth/logout before clearing storage when the user has no platform authority', async () => {
    // No permissions, no cluster-admin scope, and userCount > 1 — so this is a genuine
    // access-denied case, not the first-admin bootstrap escape hatch.
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: false, platform: [], clusters: {} });
    mockApi.post.mockResolvedValue({ data: {} }); // the /api/auth/logout call itself

    render(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByText('loginWithTokens'));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/api/auth/logout', { refresh_token: 'grfr' }),
    );
    // Revoking the Keycloak-side session must happen while this token pair is still the
    // authenticated one — otherwise the very next Google sign-in attempt in this browser
    // hits Keycloak's "already authenticated as different user" wall (root cause of the bug
    // this test guards against).
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('does not call /api/auth/logout when the user has platform authority', async () => {
    mockPerm.getMyPlatformPermissions.mockResolvedValue({ is_super_admin: true, platform: [], clusters: {} });

    render(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByText('loginWithTokens'));

    await waitFor(() => expect(localStorage.getItem('token')).toBe('gacc'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
