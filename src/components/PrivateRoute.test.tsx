import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  loading: false,
  isSuperAdmin: false,
  hasPermission: vi.fn((_perm: string) => true),
  hasPlatformAuthority: true,
  hasClusterAdminScope: false,
  adminScope: { all: false, clusters: [] },
  effectivePermissions: { is_super_admin: false, platform: [], clusters: {} },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('./Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import PrivateRoute from './PrivateRoute';

// Renders the current pathname so a test can prove the guard did NOT navigate.
const PathProbe: React.FC = () => {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
};

const renderGuard = (guarded: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/clusters']}>
      <PathProbe />
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/clusters" element={guarded} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  auth.isAuthenticated = true;
  auth.loading = false;
  auth.isSuperAdmin = false;
  auth.hasPermission = vi.fn(() => true);
  auth.hasPlatformAuthority = true;
  auth.hasClusterAdminScope = false;
  auth.adminScope = { all: false, clusters: [] };
  auth.effectivePermissions = { is_super_admin: false, platform: [], clusters: {} };
});

describe('PrivateRoute', () => {
  it('renders children when authenticated and no extra check is required', () => {
    renderGuard(<PrivateRoute><div>Cluster list</div></PrivateRoute>);

    expect(screen.getByText('Cluster list')).toBeInTheDocument();
  });

  it('shows a loading placeholder while auth is still resolving', () => {
    auth.loading = true;
    renderGuard(<PrivateRoute><div>Cluster list</div></PrivateRoute>);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Cluster list')).toBeNull();
  });

  it('redirects an unauthenticated visitor to the login screen', () => {
    auth.isAuthenticated = false;
    renderGuard(<PrivateRoute><div>Cluster list</div></PrivateRoute>);

    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Cluster list')).toBeNull();
  });

  it('renders the 403 page at the original URL when the permission check fails', () => {
    auth.hasPermission = vi.fn(() => false);
    renderGuard(
      <PrivateRoute requiredPermission="cluster.read"><div>Cluster list</div></PrivateRoute>,
    );

    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByText('Cluster list')).toBeNull();
    // The URL must not change — a redirect to /403 would make "Go Back" bounce
    // straight off the guard again.
    expect(screen.getByTestId('pathname')).toHaveTextContent('/clusters');
  });

  it('renders the 403 page when the super-admin check fails', () => {
    auth.isSuperAdmin = false;
    renderGuard(
      <PrivateRoute requireSuperAdmin><div>Super admin tools</div></PrivateRoute>,
    );

    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.queryByText('Super admin tools')).toBeNull();
  });
});
