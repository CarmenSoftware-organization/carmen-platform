import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeCluster = {
  id: 'c1',
  code: 'CLS1',
  name: 'Acme Cluster',
  alias_name: 'ACM',
  max_license_bu: 5,
  is_active: true,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clusters/new" element={<ClusterEdit />} />
        <Route path="/clusters/:id/edit" element={<ClusterEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
  it('loads an existing cluster into the overview hub, then reveals inputs in the edit dialog', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    // The hub hero leads with the cluster name (h1) and its code.
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    expect(screen.getByText('CLS1', { selector: 'span' })).toBeInTheDocument();

    // Edit details opens the dialog with editable fields.
    await user.click(screen.getByRole('button', { name: /edit details/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
    expect(screen.getByDisplayValue('CLS1')).toBeInTheDocument();
  });

  it('starts a new cluster in edit mode without calling getById', async () => {
    renderAt('/clusters/new');
    expect(await screen.findByText('Add Cluster')).toBeInTheDocument();
    expect(clusterService.getById).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Cluster code')).toBeInTheDocument();
  });
});

// A4 two-mode field contract. This page is the reference CLAUDE.md points at, so the
// read mode must actually exist — previously the whole form Card unmounted and
// max_license_bu had nowhere to be read at all.
describe('ClusterEdit — two-mode fields (A4 contract)', () => {
  it('renders every field read-only (including max licensed BUs) before Edit is pressed', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    // Read mode: no editable controls at all…
    expect(screen.queryByPlaceholderText('Cluster code')).toBeNull();
    expect(screen.queryByDisplayValue('Acme Cluster')).toBeNull();
    // …but the values are still on the page, max_license_bu included.
    expect(screen.getByText('Max licensed BUs')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('reads an unset cap as "Unlimited" rather than an empty dash', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: { ...fakeCluster, max_license_bu: null } });
    renderAt('/clusters/c1/edit');

    expect(await screen.findByText('Unlimited')).toBeInTheDocument();
  });
});

// A bad/deleted id must not render the edit shell (hero, form, BU/Users tables,
// Add User) over blank data with just an error banner on top.
describe('ClusterEdit — not-found state', () => {
  it('gates the whole edit shell behind a not-found state on a 404', async () => {
    asMock(clusterService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/clusters/nope/edit');

    expect(await screen.findByText('Cluster not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit details/i })).toBeNull();
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
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit details/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^add$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remove jane doe/i })).toBeNull();
    // The membership row degrades to plain text, not a dialog trigger.
    expect(screen.queryByRole('button', { name: 'Jane Doe' })).toBeNull();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('shows them when the permissions are held (discriminating control)', async () => {
    // Proves the negative assertions above aren't passing for the wrong reason.
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('button', { name: /add user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove jane doe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jane Doe' })).toBeInTheDocument();
  });
});
