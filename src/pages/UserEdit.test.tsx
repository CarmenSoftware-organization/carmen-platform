import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke user.update. `Can` (the REAL component, not
// mocked here) reads this mock via useAuth() — mocking `Can` itself to always
// render its children would make the permission tests below vacuous (this is
// exactly what hid the Task 2 BusinessUnitEdit permission hole).
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/userService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    resetPassword: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: {
    getAll: vi.fn(),
    createUserBusinessUnit: vi.fn(),
    deleteUserBusinessUnit: vi.fn(),
  },
}));

import UserEdit from './UserEdit';
import userService from '../services/userService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeUser = {
  id: 'u1',
  username: 'jane@example.com',
  email: 'jane@example.com',
  alias_name: 'JD',
  firstname: 'Jane',
  middlename: '',
  lastname: 'Doe',
  is_active: true,
  business_units: [],
  clusters: [],
};

const fakeUserWithAccess = {
  ...fakeUser,
  business_units: [
    {
      id: 'ub1',
      role: 'user',
      is_default: true,
      is_active: true,
      business_unit: { id: 'bu1', code: 'BU1', name: 'Business Unit One', is_active: true, cluster_id: 'c1' },
    },
  ],
  clusters: [
    {
      id: 'uc1',
      cluster_id: 'c1',
      role: 'admin',
      cluster: { id: 'c1', code: 'C1', name: 'Cluster One', is_active: true },
    },
  ],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/users/new" element={<UserEdit />} />
        <Route path="/users/:id/edit" element={<UserEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(userService.getById).mockResolvedValue({ data: fakeUser });
});

describe('UserEdit (integration)', () => {
  it('loads an existing user into the identity hero', async () => {
    renderAt('/users/u1/edit');
    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument();
  });
});

// Shared A4 not-found pattern, established on the ClusterEdit reference: a bad/deleted
// id gates the whole shell instead of rendering it over blank data under a banner.
describe('UserEdit — not-found state', () => {
  it('gates the edit shell behind a not-found state on a 404', async () => {
    asMock(userService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/users/nope/edit');

    expect(await screen.findByText('User not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to users/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(userService.getById).mockResolvedValue({ data: null });
    renderAt('/users/nope/edit');

    expect(await screen.findByText('User not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(userService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load user/i);
    expect(screen.queryByText('User not found')).toBeNull();
  });
});

// SECURITY REGRESSION. Change password previously had no <Can> gate at all, while
// the adjacent Edit button was gated on user.update — any user who could reach this
// page could open the reset-password dialog and call userService.resetPassword with
// no permission check at all.
describe('UserEdit — Change password is gated on user.update', () => {
  it('hides Change password (and Edit) without user.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Jane Doe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Change password when the user holds user.update (discriminating control)', async () => {
    // Proves the assertions above are not vacuous (e.g. a bad selector that never
    // matches would make the negative assertions pass for the wrong reason).
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('button', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});

describe('UserEdit — Alias Name validation', () => {
  it('flags an alias over 3 characters on blur, matching Username/Email on the same form', async () => {
    const user = userEvent.setup();
    renderAt('/users/u1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const aliasInput = screen.getByRole('textbox', { name: /alias name/i });
    await user.clear(aliasInput);
    await user.type(aliasInput, 'ABCD');
    await user.tab();

    expect(await screen.findByText(/alias must be 1-3 alphanumeric characters/i)).toBeInTheDocument();
    expect(aliasInput).toHaveClass('border-destructive');
  });

  it('clears the alias error when the field regains focus, matching Username/Email', async () => {
    const user = userEvent.setup();
    renderAt('/users/u1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    const aliasInput = screen.getByRole('textbox', { name: /alias name/i });
    await user.clear(aliasInput);
    await user.type(aliasInput, 'ABCD');
    await user.tab();
    expect(await screen.findByText(/alias must be 1-3 alphanumeric characters/i)).toBeInTheDocument();

    await user.click(aliasInput);
    expect(screen.queryByText(/alias must be 1-3 alphanumeric characters/i)).toBeNull();
  });
});

// SECURITY REGRESSION. Remove-BU fired businessUnitService.deleteUserBusinessUnit
// with NO <Can> gate at all, and Add-BU was gated on `userClusters.length > 0` — a
// data condition wearing a permission's name, not a check. Both fire the identical
// mutation pair BusinessUnitEdit gates on scoped cluster.update (see
// BusinessUnitUsersCard behind BusinessUnitEdit.tsx:69). `Can` here is the REAL
// component (not mocked, see the mock block above) so these assertions aren't
// vacuous — the "shows" tests are discriminating positive controls.
describe('UserEdit — BU-membership writes are gated on scoped cluster.update', () => {
  beforeEach(() => {
    asMock(userService.getById).mockResolvedValue({ data: fakeUserWithAccess });
  });

  it('hides Remove business unit without cluster.update scoped to the BU\'s own cluster', async () => {
    auth.hasPermission = (perm: string) => perm !== 'cluster.update';
    renderAt('/users/u1/edit');

    expect(await screen.findByText('Business Unit One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove business unit one/i })).toBeNull();
  });

  it('shows Remove business unit when the user holds cluster.update scoped to the BU\'s cluster (discriminating control)', async () => {
    // Scope-aware mock (mirrors ClusterEdit.test.tsx:249) — only grants cluster.update when
    // the real checkPermission scoping context matches the BU's own cluster (c1). A wholesale
    // `() => true` mock would pass even if `<Can>` lost its `clusterId` prop (the exact
    // regression this test exists to catch — see the "Fix 2" re-review round).
    auth.hasPermission = (perm: string, ctx?: { clusterId?: string }) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('button', { name: /remove business unit one/i })).toBeInTheDocument();
  });

  it('hides Add BU without cluster.update on any of the user\'s clusters', async () => {
    auth.hasPermission = (perm: string) => perm !== 'cluster.update';
    renderAt('/users/u1/edit');

    expect(await screen.findByText('Business Unit One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add bu/i })).toBeNull();
  });

  it('shows Add BU when the user holds cluster.update on the user\'s cluster (discriminating control)', async () => {
    // Same scope-aware mock as the Remove-BU positive control above.
    auth.hasPermission = (perm: string, ctx?: { clusterId?: string }) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    renderAt('/users/u1/edit');

    expect(await screen.findByRole('button', { name: /add bu/i })).toBeInTheDocument();
  });
});

// SECURITY REGRESSION (Fix 1, re-review round). `business_unit.cluster_id` is optional —
// `groupAccessByCluster` collects BUs whose cluster is unresolved into a trailing "Other
// business units" group (see UserAccessTree.test.tsx). For those rows, `unit?.cluster_id`
// is `undefined`; the old `<Can permission="cluster.update" clusterId={undefined}>` made
// `Can` pass `undefined` opts to `hasPermission`, which falls through to checkPermission's
// broad "any cluster" nav-visibility check — authorizing the write with cluster.update held
// on ANY cluster, not the (unknowable) cluster this BU actually belongs to. Must fail CLOSED:
// only a platform-wide grant (not a same-mock "any cluster" fallback) may authorize Remove
// here.
describe('UserEdit — orphan business units (unknown cluster) fail closed on Remove', () => {
  const fakeUserWithOrphanBU = {
    ...fakeUser,
    business_units: [
      {
        id: 'ub9',
        role: 'user',
        is_default: false,
        is_active: true,
        business_unit: { id: 'bu9', code: 'GH', name: 'Ghost BU', is_active: true, cluster_id: undefined },
      },
    ],
    clusters: [],
  };

  beforeEach(() => {
    asMock(userService.getById).mockResolvedValue({ data: fakeUserWithOrphanBU });
  });

  it('hides Remove on an orphan BU even though the admin holds cluster.update on another cluster', async () => {
    // Mirrors real checkPermission's two branches: scoped to a real cluster id -> only c1
    // passes; NOT scoped (ctx undefined, what `<Can clusterId={undefined}>` used to produce)
    // -> broad "any cluster" fallback -> true, since the admin holds cluster.update on c1.
    // A correct fix must never call hasPermission with ctx undefined for this row.
    auth.hasPermission = (perm: string, ctx?: { clusterId?: string }) => {
      if (perm !== 'cluster.update') return false;
      if (ctx?.clusterId) return ctx.clusterId === 'c1';
      return true;
    };
    renderAt('/users/u1/edit');

    expect(await screen.findByText('Ghost BU')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove ghost bu/i })).toBeNull();
  });
});
