import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Mutable auth so a test can revoke cluster.update/cluster.create. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself to
// always render its children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

// Mock data deps.
const listResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };
vi.mock('../services/clusterService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    uploadLogo: vi.fn(),
    uploadAvatar: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/userService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import ClusterEdit from './ClusterEdit';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import userService from '../services/userService';
import api from '../services/api';
import { PERPETUAL_END_DATE } from '../utils/clusterLicense';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeCluster = {
  id: 'c1',
  code: 'CLS1',
  name: 'Acme Cluster',
  alias_name: 'ACM',
  bu_cap: 5,
  bu_used: 0,
  is_active: true,
};

// Renders the current pathname so a test can prove where a post-save navigate()
// actually landed, without depending on what the destination route renders.
const PathProbe: React.FC = () => {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PathProbe />
      <Routes>
        <Route path="/clusters/new" element={<ClusterEdit />} />
        <Route path="/clusters/:id/edit" element={<ClusterEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Only the open tab's body is mounted, so a test that reaches into Business Units or Users
// has to open that tab first. Licensing is the default tab.
const openTab = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await user.click(await screen.findByRole('tab', { name }));
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(clusterService.getAll).mockResolvedValue(listResponse);
  asMock(businessUnitService.getAll).mockResolvedValue(listResponse);
  asMock(userService.getAll).mockResolvedValue(listResponse);
  asMock(api.get).mockResolvedValue({ data: { data: [] } });
});

describe('ClusterEdit (integration)', () => {
  it('loads an existing cluster into the plate, then reveals a field input on click', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    // The plate leads with the cluster name (h1) and carries the code exactly once — as the
    // control that edits it. The separate Identity card that used to repeat both is gone, so
    // this no longer needs scoping to a section to avoid the duplicate.
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'CLS1' })).toHaveLength(1);

    // Edit-in-place: the field is read-only text until clicked, then reveals its input.
    expect(screen.queryByDisplayValue('Acme Cluster')).toBeNull();
    await user.click(screen.getByRole('button', { name: /acme cluster/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
  });

  it('starts a new cluster in edit mode without calling getById', async () => {
    renderAt('/clusters/new');
    expect(await screen.findByText('Add Cluster')).toBeInTheDocument();
    expect(clusterService.getById).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Cluster code')).toBeInTheDocument();
  });
});

// REGRESSION (finding #1). A successful create must land on the registered
// `/clusters/:id/edit` route, not the unregistered `/clusters/:id` — the latter
// falls through App.tsx's catch-all straight to the 404 page instead of the
// cluster the user just created.
describe('ClusterEdit — create navigates to the new cluster\'s edit route', () => {
  it('navigates to /clusters/:id/edit after a successful create', async () => {
    const user = userEvent.setup();
    asMock(clusterService.create).mockResolvedValue({ data: { id: 'c9' } });
    asMock(clusterService.getById).mockResolvedValue({ data: { ...fakeCluster, id: 'c9' } });
    renderAt('/clusters/new');

    await user.type(await screen.findByPlaceholderText('Cluster code'), 'CLS9');
    await user.type(screen.getByPlaceholderText('Cluster name'), 'New Cluster');
    // Task 9: the create form now also issues the cluster's first BU-quota licence —
    // both fields are `required`, so the native form won't submit without them.
    await user.type(screen.getByPlaceholderText('e.g. 5'), '5');
    await user.click(screen.getByRole('checkbox', { name: /no expiry/i }));
    await user.click(screen.getByRole('button', { name: /create cluster/i }));

    // waitFor, not findByTestId: the probe is on screen from the first render, so
    // findBy resolves instantly against the pre-navigation pathname. React Router 7
    // wraps navigation in React.startTransition, so the location lands a tick later.
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent('/clusters/c9/edit'),
    );
    // The cluster this create produced must actually be usable — no licence means it
    // cannot ever have a business unit (Task 7/9).
    expect(clusterService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initial_license: { licensed_bus: 5, end_date: PERPETUAL_END_DATE },
      }),
    );
  });
});

// Edit-in-place contract. This page is the reference CLAUDE.md points at, so the
// read mode must actually exist — values show as plain read-mode text/buttons until
// a field is clicked, and cluster.update gates whether that click opens an editor.
describe('ClusterEdit — edit-in-place details', () => {
  it('shows values read-only until a field is clicked (with permission)', async () => {
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    // No inputs until a field is opened.
    expect(screen.queryByDisplayValue('Acme Cluster')).toBeNull();
    await user.click(screen.getByRole('button', { name: /acme cluster/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
  });

  // REGRESSION-PROOFING (Task 9). `max_license_bu: null` used to mean "unlimited" and the
  // Details section showed the literal text "Unlimited". That field (and its UI) is gone —
  // BU quota now comes from `bu_cap` on the cluster response, where an absent/null value
  // means zero quota, never unlimited. A cluster with no covering licence must therefore
  // disable "Add" business unit outright, not offer an "unlimited" affordance.
  it('reads an absent bu_cap as zero, not "unlimited" — the Add Business Unit button is disabled outright', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: { ...fakeCluster, bu_cap: undefined } });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');
    await openTab(user, /business units/i);

    const addBuButton = await screen.findByRole('button', { name: /^add$/i });
    expect(addBuButton).toBeDisabled();
    expect(addBuButton).toHaveAttribute('title', 'License limit reached (0/0)');
    expect(screen.queryByText('Unlimited')).toBeNull();
  });
});

// A bad/deleted id must not render the edit shell (hero, form, BU/Users tables,
// Add User) over blank data with just an error banner on top.
describe('ClusterEdit — not-found state', () => {
  it('gates the whole edit shell behind a not-found state on a 404', async () => {
    asMock(clusterService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/clusters/nope/edit');

    expect(await screen.findByText('Cluster not found')).toBeInTheDocument();
    expect(screen.queryByText('Business Units')).toBeNull();
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to clusters/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: null });
    renderAt('/clusters/nope/edit');

    expect(await screen.findByText('Cluster not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(clusterService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load cluster/i);
    expect(screen.queryByText('Cluster not found')).toBeNull();
  });

  // A stale notFound must not survive a later successful fetch on the same mounted
  // instance — e.g. client-side nav from a bad id to a valid one, or a retry.
  it('clears a stale not-found once a later fetch on the same instance succeeds', async () => {
    asMock(clusterService.getById).mockImplementation((clusterId: string) =>
      clusterId === 'c1'
        ? Promise.resolve({ data: fakeCluster })
        : Promise.reject({ response: { status: 404 } })
    );

    function NavigateToValid() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/clusters/c1/edit')}>
          go to valid cluster
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/clusters/nope/edit']}>
        <Routes>
          <Route
            path="/clusters/:id/edit"
            element={
              <>
                <NavigateToValid />
                <ClusterEdit />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cluster not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to valid cluster/i }));

    // The refetch for the now-valid id succeeded — the stale not-found gate must
    // not keep hiding the shell.
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    expect(screen.queryByText('Cluster not found')).toBeNull();
  });
});

// SECURITY REGRESSION. The Edit toggle was gated on cluster.update, but every other
// write surface on the page — Add BU, Add User, the edit-membership trigger and the
// remove-user button — called the API with no permission check at all.
describe('ClusterEdit — cluster-user write surfaces are gated', () => {
  const clusterUser = {
    id: 'cu1',
    user_id: 'u1',
    email: 'jane@example.com',
    role: 'user',
    is_active: true,
    userInfo: { firstname: 'Jane', lastname: 'Doe' },
  };

  beforeEach(() => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    asMock(api.get).mockResolvedValue({ data: { data: [clusterUser] } });
  });

  it('hides every write surface without cluster.update / cluster.create', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    await openTab(user, /users/i);
    // Edit-in-place: with no permission, the plate's fields are read-only (no edit trigger),
    // and the user write surfaces are absent.
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^add$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove jane doe/i })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();               // no bulk-select
    expect(screen.queryByRole('button', { name: /role for jane doe/i })).toBeNull(); // no inline role editor
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();        // still shown as text
  });

  it('shows them when cluster.update is held for this cluster (discriminating control)', async () => {
    // Proves the negative assertions above aren't passing for the wrong reason — AND that
    // the check is genuinely scoped to *this* cluster, not just "any truthy permission".
    // A wholesale `() => true` mock would pass even if `<Can>` lost its `clusterId` prop
    // (the exact regression this suite exists to catch); this mock only grants
    // cluster.update when the real `checkPermission` scoping context matches cluster c1.
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');
    await openTab(user, /users/i);

    expect(await screen.findByRole('button', { name: /add user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove jane doe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /role for jane doe/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select jane doe/i })).toBeInTheDocument();
  });
});

// Follow-up to review C1: `SubscriptionCard` renders nothing — and fires no request — without
// `subscription.read`; that gating is pinned in SubscriptionCard.test.tsx. It used to own a
// whole section, so an unconditional nav entry was a menu item that scrolled to an empty
// stretch of page, and the entry had to follow the permission. It is now the Licensing tab,
// whose body always carries the Manage licences action, so the tab keeps content either way
// and stays unconditional. What follows pins that: the same three tabs either way.
describe('ClusterEdit — the Licensing tab does not follow subscription.read', () => {
  const renderClusterEdit = async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    renderAt('/clusters/c1/edit');
    await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' });
    return screen.getByRole('tablist');
  };

  const expectFullStrip = (strip: HTMLElement) => {
    expect(within(strip).getByRole('tab', { name: /licensing/i })).toBeInTheDocument();
    expect(within(strip).getByRole('tab', { name: /business units/i })).toBeInTheDocument();
    expect(within(strip).getByRole('tab', { name: /users/i })).toBeInTheDocument();
    expect(within(strip).getAllByRole('tab')).toHaveLength(3);
  };

  it('keeps every tab without subscription.read', async () => {
    auth.hasPermission = (perm) => perm !== 'subscription.read';

    expectFullStrip(await renderClusterEdit());
  });

  it('keeps every tab with subscription.read (discriminating control)', async () => {
    auth.hasPermission = () => true;

    expectFullStrip(await renderClusterEdit());
  });

  // What makes the unconditional tab safe: its body is never empty, even for a user who
  // cannot read subscriptions at all. That is the property the old nav entry lacked.
  it('keeps the Licensing body populated without subscription.read', async () => {
    auth.hasPermission = (perm) => perm !== 'subscription.read';

    await renderClusterEdit();

    expect(screen.getByRole('link', { name: /manage licences/i })).toBeInTheDocument();
  });
});

// REGRESSION-PROOFING (Task 3.5, review Finding 2). The Add User dialog's license-limit
// check used to be a per-BU ceiling (`bu.max_license_users`) — wrong from the start, since
// the cap always belonged to the cluster as a whole, not to any one BU. It was rewritten to
// compare `users.clusterUsers.length` against the cluster's own `total_max_license_users`.
// These two tests exercise that comparison end to end (open dialog, pick a real candidate,
// read the disabled state + message off the DOM) so a future regression — reverting to a
// per-BU check, or breaking the cluster-level one — shows up as a red test, not only a
// passing `tsc`.
describe('ClusterEdit — Add User dialog respects the cluster-wide license cap', () => {
  const clusterUser = {
    id: 'cu1',
    user_id: 'u1',
    email: 'jane@example.com',
    role: 'user',
    is_active: true,
    userInfo: { firstname: 'Jane', lastname: 'Doe' },
  };
  const candidateUser = {
    id: 'u2', username: 'newuser1', email: 'newuser1@example.com', firstname: 'New', lastname: 'User',
  };

  beforeEach(() => {
    // One existing cluster user (userUsed = 1) — same shape/precedent as the write-surface
    // gating describe block above (`asMock(api.get).mockResolvedValue(...)` unconditionally).
    asMock(api.get).mockResolvedValue({ data: { data: [clusterUser] } });
    asMock(userService.getAll).mockResolvedValue({ data: [candidateUser], paginate: { total: 1 } });
  });

  it('cluster has seats free: a picked candidate can be submitted', async () => {
    asMock(clusterService.getById).mockResolvedValue({
      data: { ...fakeCluster, total_max_license_users: 5 }, // 1 used of 5 — room to spare
    });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');
    await openTab(user, /users/i);

    await user.click(await screen.findByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /newuser1/i }));

    expect(screen.getByText(/1 of 5 licensed users in this cluster/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /add user/i })).not.toBeDisabled();
  });

  it('cluster is at its cap: blocks the submit even with a candidate picked, and says why', async () => {
    asMock(clusterService.getById).mockResolvedValue({
      data: { ...fakeCluster, total_max_license_users: 1 }, // 1 used of 1 — at the cluster's cap
    });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');
    await openTab(user, /users/i);

    await user.click(await screen.findByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /newuser1/i }));

    expect(screen.getByText(/cluster license limit reached \(1\/1\)/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /add user/i })).toBeDisabled();
  });

  // Both tests above feed the LIST endpoint's spelling — and stayed green while the guard was
  // dead in the running app. This page reads the DETAIL endpoint, and the two disagree:
  // `GET /api-system/clusters` returns the cap as `total_max_license_users`, while
  // `GET /api-system/clusters/:id` returns the same number as `total_count_license_users` and
  // omits the other key (captured off the dev backend, 2026-08-23; the subscription row for the
  // same cluster independently reported the same 15 seats). Because the field is optional and
  // absent reads as "uncapped", the drift was silent twice over: the hero rendered "∞ (no cap)"
  // and `clusterAtLimit` could never be true. Pin the detail spelling so an aligned backend or
  // a refactor cannot quietly bring the hole back.
  it('reads the cap from the detail endpoint spelling, total_count_license_users', async () => {
    asMock(clusterService.getById).mockResolvedValue({
      data: { ...fakeCluster, total_count_license_users: 1 }, // detail key only — no total_max_*
    });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');
    await openTab(user, /users/i);

    await user.click(await screen.findByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: /newuser1/i }));

    expect(screen.getByText(/cluster license limit reached \(1\/1\)/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /add user/i })).toBeDisabled();
  });
});
