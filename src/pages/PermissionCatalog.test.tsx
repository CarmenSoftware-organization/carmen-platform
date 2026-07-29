import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/permissionService', () => ({
  default: { getCatalog: vi.fn(), getMyPlatformPermissions: vi.fn() },
}));

import PermissionCatalog from './PermissionCatalog';
import permissionService from '../services/permissionService';
import type { PermissionCatalogItem } from '../types';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const perm = (
  resource: string,
  action: string,
  description?: string,
): PermissionCatalogItem => ({ key: `${resource}.${action}`, resource, action, description });

const renderPage = () =>
  render(
    <MemoryRouter>
      <PermissionCatalog />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  asMock(permissionService.getCatalog).mockResolvedValue([
    perm('cluster', 'read', 'View clusters'),
    perm('cluster', 'create'),
    perm('user', 'read', 'View users'),
  ]);
});

describe('PermissionCatalog — rendering the catalog', () => {
  it('renders one card per resource, with every permission key under it', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'cluster' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'user' })).toBeInTheDocument();

    expect(screen.getByText('cluster.read')).toBeInTheDocument();
    expect(screen.getByText('cluster.create')).toBeInTheDocument();
    expect(screen.getByText('user.read')).toBeInTheDocument();
  });

  it('shows the description when present and omits it entirely when absent', async () => {
    renderPage();

    expect(await screen.findByText('View clusters')).toBeInTheDocument();
    expect(screen.getByText('View users')).toBeInTheDocument();
    // `cluster.create` carries no description — nothing extra is rendered for it.
    expect(screen.getAllByText(/^View /)).toHaveLength(2);
  });

  it('groups non-adjacent entries of the same resource into a single card', async () => {
    // The grouping is Map-based, not run-length based: a resource that reappears
    // later in the catalog must fold into its existing card rather than opening
    // a second one with the same title.
    asMock(permissionService.getCatalog).mockResolvedValue([
      perm('cluster', 'read'),
      perm('user', 'read'),
      perm('cluster', 'delete'),
    ]);
    renderPage();

    await screen.findByText('cluster.read');

    expect(screen.getAllByRole('heading', { name: 'cluster' })).toHaveLength(1);
    expect(screen.getByText('cluster.delete')).toBeInTheDocument();
  });

  it('preserves catalog order of resources rather than sorting them', async () => {
    asMock(permissionService.getCatalog).mockResolvedValue([
      perm('zebra', 'read'),
      perm('alpha', 'read'),
    ]);
    const { container } = renderPage();

    await screen.findByText('zebra.read');

    const headings = Array.from(container.querySelectorAll('h3, [class*="CardTitle"]'))
      .map((el) => el.textContent)
      .filter((t): t is string => t === 'zebra' || t === 'alpha');
    expect(headings).toEqual(['zebra', 'alpha']);
  });
});

describe('PermissionCatalog — loading, empty and error states', () => {
  it('does not flash the empty state while the catalog is still loading', async () => {
    // Regression guard: the empty state is gated on `!loading` as well as an
    // empty list. If that gate is dropped, "No permissions" appears on every
    // first paint before the response lands.
    let resolve: (v: PermissionCatalogItem[]) => void = () => {};
    asMock(permissionService.getCatalog).mockReturnValue(
      new Promise<PermissionCatalogItem[]>((r) => {
        resolve = r;
      }),
    );

    renderPage();

    expect(screen.queryByText('No permissions')).toBeNull();

    resolve([]);
    expect(await screen.findByText('No permissions')).toBeInTheDocument();
  });

  it('shows the empty state when the catalog comes back empty', async () => {
    asMock(permissionService.getCatalog).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No permissions')).toBeInTheDocument();
    expect(
      screen.getByText('No platform permissions are defined in the catalog yet.'),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure as an alert plus a toast, and suppresses the empty state', async () => {
    asMock(permissionService.getCatalog).mockRejectedValue({
      response: { data: { message: 'Catalog unavailable' } },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Catalog unavailable');

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to load permissions',
      expect.objectContaining({ description: 'Catalog unavailable' }),
    );

    // An error is not an empty catalog — showing "No permissions" here would
    // tell the reader the platform has none, which is a different fact.
    expect(screen.queryByText('No permissions')).toBeNull();
  });
});
