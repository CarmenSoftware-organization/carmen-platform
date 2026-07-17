import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, createMemoryRouter, RouterProvider } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke role.update. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself to always render its
// children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/roleService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../services/permissionService', () => ({
  default: {
    getCatalog: vi.fn(),
  },
}));

import RoleEdit from './RoleEdit';
import roleService from '../services/roleService';
import permissionService from '../services/permissionService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeRole = {
  id: 'r1',
  name: 'Billing Admin',
  description: 'Manages billing',
  is_active: true,
  permissions: ['cluster.read'],
  doc_version: 3,
};

const fakeCatalog = [
  { key: 'cluster.read', resource: 'cluster', action: 'read', description: 'Read clusters' },
  { key: 'cluster.update', resource: 'cluster', action: 'update', description: 'Update clusters' },
];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/platform/roles/new" element={<RoleEdit />} />
        <Route path="/platform/roles/:id/edit" element={<RoleEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(permissionService.getCatalog).mockResolvedValue(fakeCatalog);
});

describe('RoleEdit (integration)', () => {
  it('loads an existing role into the identity hero', async () => {
    asMock(roleService.getById).mockResolvedValue({ data: fakeRole });
    renderAt('/platform/roles/r1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Billing Admin' })).toBeInTheDocument();
  });

  it('starts a new role in edit mode without calling getById', async () => {
    renderAt('/platform/roles/new');

    await screen.findByText('Permissions');
    expect(roleService.getById).not.toHaveBeenCalled();
  });
});

describe('RoleEdit — not-found state', () => {
  it('gates the edit shell behind a not-found state on a 404', async () => {
    asMock(roleService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/platform/roles/nope/edit');

    expect(await screen.findByText('Role not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to roles/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(roleService.getById).mockResolvedValue({ data: null });
    renderAt('/platform/roles/nope/edit');

    expect(await screen.findByText('Role not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(roleService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/platform/roles/r1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load role/i);
    expect(screen.queryByText('Role not found')).toBeNull();
  });

  it('recovers the shell after a stale not-found once a valid fetch succeeds', async () => {
    // Regression guard for the setNotFound(false)-at-top-of-fetch bug documented in
    // the brief: a prior 404 must not permanently gate the shell after a later
    // successful refetch on the SAME mounted instance (e.g. a client-side nav from
    // a bad id to a valid one). Uses createMemoryRouter + router.navigate so the
    // RoleEdit instance stays mounted across the id change — MemoryRouter's
    // initialEntries only applies on first render, so a rerender with a new
    // MemoryRouter would not exercise this bug at all.
    asMock(roleService.getById).mockRejectedValueOnce({ response: { status: 404 } });
    const router = createMemoryRouter(
      [{ path: '/platform/roles/:id/edit', element: <RoleEdit /> }],
      { initialEntries: ['/platform/roles/bad/edit'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Role not found')).toBeInTheDocument();

    asMock(roleService.getById).mockResolvedValueOnce({ data: fakeRole });
    router.navigate('/platform/roles/r1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Billing Admin' })).toBeInTheDocument();
    expect(screen.queryByText('Role not found')).toBeNull();
  });
});

describe('RoleEdit — Edit is gated on role.update', () => {
  beforeEach(() => {
    asMock(roleService.getById).mockResolvedValue({ data: fakeRole });
  });

  it('hides Edit without role.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/platform/roles/r1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Billing Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Edit when role.update is held (discriminating control)', async () => {
    renderAt('/platform/roles/r1/edit');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});

// Loading-vs-empty conflation fix: `catalog.length === 0` alone can't tell a
// still-loading catalog apart from one that genuinely returned zero entries.
describe('RoleEdit — permission catalog states', () => {
  it('shows a loading region while the catalog fetch is in flight (not an endless spinner with no exit)', async () => {
    const deferred = createDeferred<typeof fakeCatalog>();
    asMock(permissionService.getCatalog).mockReturnValue(deferred.promise);
    renderAt('/platform/roles/new');

    expect(await screen.findByRole('status')).toHaveTextContent(/loading permission catalog/i);
    // Left pending deliberately — no further assertions depend on resolution.
  });

  it('distinguishes a loaded-but-empty catalog from the loading state', async () => {
    asMock(permissionService.getCatalog).mockResolvedValue([]);
    renderAt('/platform/roles/new');

    expect(await screen.findByText(/no permissions are defined in the catalog/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows FetchErrorState (not an endless spinner) on catalog failure, and retry recovers it', async () => {
    const user = userEvent.setup();
    asMock(permissionService.getCatalog)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(fakeCatalog);
    renderAt('/platform/roles/new');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the permission catalog.");
    expect(screen.queryByText(/loading permission catalog/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(permissionService.getCatalog).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('cluster')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
