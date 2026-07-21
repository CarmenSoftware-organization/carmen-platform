import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown + dialog rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the page reads it on render.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke cluster.update / cluster.delete / cluster.create.
// `Can` (the REAL component, not mocked here) reads this via useAuth() — mocking `Can`
// itself to always render its children would make the permission tests below vacuous,
// which is exactly what hid the wave-2 permission holes.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn(), delete: vi.fn() },
}));

import ClusterManagement from './ClusterManagement';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const clusters = [
  { id: 'c1', code: 'ACME', name: 'Acme Hotels', is_active: true, bu_count: 14, max_license_bu: 20, users_count: 100, total_max_license_users: 200, created_at: '2025-02-01T00:00:00Z' },
  { id: 'c2', code: 'BETA', name: 'Beta Foods', is_active: true, bu_count: 0, max_license_bu: 10, users_count: 5, total_max_license_users: 50, created_at: '2025-03-01T00:00:00Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(clusterService.getAll).mockResolvedValue({ data: clusters, paginate: { total: 2, page: 1, perpage: 10 } });
  // Default every test to desktop (table). The mobile-card test below overrides
  // this within its own body; this line resets it for the following tests.
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ClusterManagement />
    </MemoryRouter>,
  );

const openRowDelete = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }));
  await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
};

describe('ClusterManagement delete guard', () => {
  it('blocks deleting a cluster that still has business units', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Hotels');

    await openRowDelete(user, 'Acme Hotels');

    expect(toast.error).toHaveBeenCalledWith(
      "Can't delete Acme Hotels",
      expect.objectContaining({ description: expect.stringContaining('14 business units') }),
    );
    // the confirm dialog must not open, and nothing is deleted
    expect(screen.queryByText(/are you sure you want to delete this cluster/i)).toBeNull();
    expect(clusterService.delete).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog for a cluster with no business units', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beta Foods');

    await openRowDelete(user, 'Beta Foods');

    expect(await screen.findByText(/are you sure you want to delete this cluster/i)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// SECURITY. Four <Can> gates guard this page's write surfaces: the row Edit
// (cluster.update, clusterId-scoped), the row Delete (cluster.delete, clusterId-scoped),
// the header Add Cluster (cluster.create) and the empty-state Add Cluster (cluster.create).
// These tests must FAIL if a gate is deleted OR if a scoped gate loses its clusterId prop.
describe('ClusterManagement — row action gates (cluster-scoped)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }));

  it('hides both row actions without cluster.update / cluster.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Hotels');

    await openRowMenu(user, 'Acme Hotels');

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  // Discriminating control. A wholesale `() => true` would still pass if a gate lost its
  // `clusterId` prop — checkPermission's unscoped branch grants on "any cluster". This
  // mock only grants for cluster c1's exact scoping context, so dropping `clusterId`
  // makes `Can` call hasPermission(perm, undefined) and the menu item disappears.
  it('shows both row actions when scoped to this exact cluster (discriminating control)', async () => {
    auth.hasPermission = (perm, ctx) =>
      (perm === 'cluster.update' || perm === 'cluster.delete') && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Hotels');

    await openRowMenu(user, 'Acme Hotels');

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  // The scope must be per-row: a grant on c1 must not leak into c2's menu.
  it('does not leak a c1-scoped grant into another cluster row', async () => {
    auth.hasPermission = (perm, ctx) =>
      (perm === 'cluster.update' || perm === 'cluster.delete') && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beta Foods');

    await openRowMenu(user, 'Beta Foods');

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  it('gates each row action on its own permission', async () => {
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme Hotels');

    await openRowMenu(user, 'Acme Hotels');

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });
});

describe('ClusterManagement — Add Cluster gates (cluster.create)', () => {
  it('hides the header Add Cluster button without cluster.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Acme Hotels');

    expect(screen.queryByRole('button', { name: /add cluster/i })).toBeNull();
  });

  it('shows the header Add Cluster button with cluster.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'cluster.create';
    renderPage();
    await screen.findByText('Acme Hotels');

    expect(screen.getByRole('button', { name: /add cluster/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Cluster button without cluster.create', async () => {
    asMock(clusterService.getAll).mockResolvedValue({ data: [], paginate: { total: 0, page: 1, perpage: 10 } });
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No clusters yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add cluster/i })).toBeNull();
  });

  it('shows the empty-state Add Cluster button with cluster.create (discriminating control)', async () => {
    asMock(clusterService.getAll).mockResolvedValue({ data: [], paginate: { total: 0, page: 1, perpage: 10 } });
    auth.hasPermission = (perm) => perm === 'cluster.create';
    renderPage();

    expect(await screen.findByText('No clusters yet')).toBeInTheDocument();
    // Header + empty-state gate both render one; both are gated on cluster.create.
    expect(screen.getAllByRole('button', { name: /add cluster/i }).length).toBeGreaterThan(0);
  });
});

// Mirrors the report-templates treatment: the list uses content-based (table-auto)
// layout so columns fit their content, and the Code/Name links stay on one line.
describe('ClusterManagement — table fit-content', () => {
  it('uses content-based (table-auto) layout', async () => {
    const { container } = renderPage();
    await screen.findByText('Acme Hotels');

    expect(container.querySelector('table')?.className).toContain('table-auto');
  });

  it('freezes three left columns (#, Code, Name)', async () => {
    const { container } = renderPage();
    await screen.findByText('Acme Hotels');

    expect(container.querySelector('table')?.className).toContain('table-sticky-left-3');
  });

  it('renders the Name link single-line (whitespace-nowrap)', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Acme Hotels' });
    expect(link.className).toContain('whitespace-nowrap');
  });

  it('renders the Code link single-line (whitespace-nowrap)', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'ACME' });
    expect(link.className).toContain('whitespace-nowrap');
  });
});

describe('ClusterManagement — mobile card view', () => {
  const setMobile = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));

  it('renders clusters as cards (no table) with title/badge hints applied', async () => {
    setMobile();
    const { container } = renderPage();
    await screen.findByText('Acme Hotels');

    // No table element in card mode.
    expect(container.querySelector('table')).toBeNull();
    // Status is promoted to a badge, and the row actions menu is still reachable.
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /actions for acme hotels/i })).toBeInTheDocument();
    // Code + Name are promoted to the card title, so no "Code" label row is rendered.
    // (Without the meta.card:'title' hint they would appear as a labelled row.)
    expect(screen.queryByText('Code')).toBeNull();
  });
});
