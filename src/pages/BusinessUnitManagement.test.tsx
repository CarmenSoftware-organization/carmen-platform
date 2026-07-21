import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown + sheet rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the page reads it on every render
// (search/status-filter/deleted-filter/page/sort/perpage are all seeded from it).
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
// itself to always render its children would make every permission assertion below
// vacuous, exactly the defect this effort exists to close. BU permissions are modeled
// under `cluster.*`, not `business_unit.*` (verified: BusinessUnitManagement.tsx's four
// `<Can>` call sites all use `cluster.create` / `cluster.update` / `cluster.delete`, and
// `business_unit.*` does not appear anywhere in the codebase — see task-3-report.md §1).
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn(), delete: vi.fn() },
}));

import BusinessUnitManagement from './BusinessUnitManagement';
import businessUnitService from '../services/businessUnitService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// Two rows in two different clusters, so scoped-gate tests can prove the check is
// bound to *this row's* cluster_id, not "any cluster" / a wholesale grant.
const businessUnits = [
  { id: 'bu1', code: 'BU1', name: 'Acme HQ', alias_name: 'HQ', cluster_id: 'c1', cluster_name: 'Acme Cluster', is_active: true, max_license_users: 50, created_at: '2025-02-01T00:00:00Z' },
  { id: 'bu2', code: 'BU2', name: 'Beta Branch', alias_name: 'BB', cluster_id: 'c2', cluster_name: 'Beta Cluster', is_active: true, max_license_users: 20, created_at: '2025-03-01T00:00:00Z' },
];

const listResponse = { data: businessUnits, paginate: { total: 2, page: 1, perpage: 10 } };
const emptyResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(businessUnitService.getAll).mockResolvedValue(listResponse);
  asMock(businessUnitService.delete).mockResolvedValue({});
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <BusinessUnitManagement />
    </MemoryRouter>,
  );

// SECURITY. Four `<Can>` gates guard this page's write surfaces: the row Edit
// (cluster.update, clusterId-scoped to the row's own cluster_id), the row Delete
// (cluster.delete, clusterId-scoped), the header Add Business Unit (cluster.create,
// unscoped) and the empty-state Add Business Unit (cluster.create, unscoped). These
// tests must FAIL if a gate is deleted OR if a scoped gate loses its clusterId prop.
describe('BusinessUnitManagement — row action gates (cluster-scoped)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('button', { name: new RegExp(`actions for ${name}`, 'i') }));

  it('hides both row actions without cluster.update / cluster.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme HQ');

    await openRowMenu(user, 'Acme HQ');

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  // Discriminating control. A wholesale `() => true` would still pass if a gate lost
  // its `clusterId` prop — checkPermission's unscoped branch grants on "any cluster".
  // This mock only grants for BU bu1's exact cluster (c1), so dropping `clusterId`
  // from the page's `<Can>` call makes it call hasPermission(perm, undefined) and the
  // menu item disappears.
  it('shows both row actions when scoped to this exact cluster (discriminating control)', async () => {
    auth.hasPermission = (perm, ctx) =>
      (perm === 'cluster.update' || perm === 'cluster.delete') && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme HQ');

    await openRowMenu(user, 'Acme HQ');

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  // The scope must be per-row: a grant scoped to bu1's cluster (c1) must not leak
  // into bu2's row, which belongs to a different cluster (c2).
  it('does not leak a c1-scoped grant into a business unit in another cluster', async () => {
    auth.hasPermission = (perm, ctx) =>
      (perm === 'cluster.update' || perm === 'cluster.delete') && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beta Branch');

    await openRowMenu(user, 'Beta Branch');

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  it('gates each row action on its own permission', async () => {
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Acme HQ');

    await openRowMenu(user, 'Acme HQ');

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });
});

describe('BusinessUnitManagement — Add Business Unit gates (cluster.create)', () => {
  it('hides the header Add Business Unit button without cluster.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Acme HQ');

    expect(screen.queryByRole('button', { name: /add business unit/i })).toBeNull();
  });

  it('shows the header Add Business Unit button with cluster.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'cluster.create';
    renderPage();
    await screen.findByText('Acme HQ');

    expect(screen.getByRole('button', { name: /add business unit/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Business Unit button without cluster.create', async () => {
    asMock(businessUnitService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No business units yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add business unit/i })).toBeNull();
  });

  it('shows the empty-state Add Business Unit button with cluster.create (discriminating control)', async () => {
    asMock(businessUnitService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = (perm) => perm === 'cluster.create';
    renderPage();

    expect(await screen.findByText('No business units yet')).toBeInTheDocument();
    // Header + empty-state both render one; both are gated on cluster.create.
    expect(screen.getAllByRole('button', { name: /add business unit/i }).length).toBeGreaterThan(0);
  });
});

// This page has no bulk row-selection / `selectionResetKey` wiring at all (no
// `enableRowSelection`, no checkbox column, no bulk action bar — verified by grep:
// `selectionResetKey`/`clearSelection`/`enableRowSelection` do not appear anywhere in
// BusinessUnitManagement.tsx). It is therefore NOT a consumer of the shared
// `data-table.tsx` `selectionResetKey` reset mechanism Task 1 fixed, so no regression
// guard test is added here (unlike NewsManagement/UserManagement).

// Mirrors the clusters treatment: content-based layout, Code+Name single-line, and
// three frozen left columns (#, Code, Name) since the list leads with Code.
describe('BusinessUnitManagement — table fit-content & sticky', () => {
  it('uses content-based (table-auto) layout and freezes three left columns', async () => {
    const { container } = renderPage();
    await screen.findByText('Acme HQ');

    const table = container.querySelector('table');
    expect(table?.className).toContain('table-auto');
    expect(table?.className).toContain('table-sticky-left-3');
  });

  it('renders the Name link single-line without truncation', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Acme HQ' });
    expect(link.className).toContain('whitespace-nowrap');
    expect(link.className).not.toContain('truncate');
    expect(link.className).not.toContain('max-w-');
  });

  it('renders the Code link single-line (whitespace-nowrap)', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'BU1' });
    expect(link.className).toContain('whitespace-nowrap');
  });
});
