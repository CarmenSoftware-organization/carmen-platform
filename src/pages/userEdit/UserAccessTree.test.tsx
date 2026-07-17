import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { groupAccessByCluster, UserAccessTree, type AccessCluster, type AccessBU } from './UserAccessTree';

// `Can` stays the REAL component (not mocked) — mutable, scope-aware `hasPermission`
// mirrors the harness in ClusterEdit.test.tsx / UserEdit.test.tsx. Defaults to grant in
// `beforeEach` so the structural/behavioral assertions below (groupAccessByCluster,
// rendering, onDeleteBU wiring) are unaffected — they don't depend on permissions — but
// individual tests can revoke or scope it to prove the `cluster.update` gate on the
// Remove-BU button (see UserAccessTree.tsx's BuRow) is genuinely enforced, not masked.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
});

const cluster = (cluster_id: string, name: string, is_active = true): AccessCluster => ({
  id: `m-${cluster_id}`,
  cluster_id,
  role: 'admin',
  cluster: { id: `c-${cluster_id}`, code: name.slice(0, 3).toUpperCase(), name, is_active },
});

const bu = (id: string, name: string, cluster_id?: string): AccessBU => ({
  id,
  role: 'user',
  is_default: false,
  is_active: true,
  business_unit: { id: `bu-${id}`, code: name.slice(0, 2).toUpperCase(), name, is_active: true, cluster_id },
});

const renderTree = (props: Partial<React.ComponentProps<typeof UserAccessTree>> = {}) =>
  render(
    <MemoryRouter>
      <UserAccessTree
        clusters={[cluster('z', 'Zebra')]}
        businessUnits={[bu('1', 'Front Office', 'z')]}
        canAddBU
        onAddBU={() => {}}
        onDeleteBU={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );

describe('groupAccessByCluster', () => {
  it('nests business units under the cluster they belong to', () => {
    const groups = groupAccessByCluster(
      [cluster('z', 'Zebra'), cluster('a', 'Acme')],
      [bu('1', 'Front Office', 'z'), bu('2', 'Kitchen', 'z'), bu('3', 'Lobby', 'a')],
    );
    expect(groups.map((g) => g.clusterName)).toEqual(['Zebra', 'Acme']);
    expect(groups[0].bus.map((b) => b.id)).toEqual(['1', '2']);
    expect(groups[1].bus.map((b) => b.id)).toEqual(['3']);
  });

  it('keeps a cluster with no assigned business units as an empty group', () => {
    const groups = groupAccessByCluster([cluster('z', 'Zebra')], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].bus).toHaveLength(0);
  });

  it('collects orphan business units (unknown cluster) under a trailing "Other" group', () => {
    const groups = groupAccessByCluster([cluster('z', 'Zebra')], [bu('1', 'FO', 'z'), bu('9', 'Ghost', 'x')]);
    expect(groups).toHaveLength(2);
    expect(groups[1].clusterName).toBe('Other business units');
    expect(groups[1].bus.map((b) => b.id)).toEqual(['9']);
  });

  it('carries the user role and cluster status onto each group', () => {
    const [g] = groupAccessByCluster([cluster('z', 'Zebra', false)], []);
    expect(g.role).toBe('admin');
    expect(g.clusterActive).toBe(false);
    expect(g.clusterId).toBe('c-z');
  });

  it('returns nothing when the user has no clusters and no business units', () => {
    expect(groupAccessByCluster([], [])).toEqual([]);
  });
});

describe('UserAccessTree', () => {
  it('renders the cluster header and its business unit', () => {
    renderTree();
    expect(screen.getByText('Zebra')).toBeInTheDocument();
    expect(screen.getByText('Front Office')).toBeInTheDocument();
  });

  it('shows the empty state when the user has no access', () => {
    renderTree({ clusters: [], businessUnits: [] });
    expect(screen.getByText(/Not assigned to any cluster/)).toBeInTheDocument();
  });

  it('calls onDeleteBU when a remove button is pressed', async () => {
    const onDeleteBU = vi.fn();
    renderTree({ onDeleteBU });
    screen.getByRole('button', { name: /Remove Front Office/ }).click();
    expect(onDeleteBU).toHaveBeenCalledTimes(1);
  });

  it('hides the Add BU control when the user belongs to no cluster', () => {
    renderTree({ canAddBU: false });
    expect(screen.queryByRole('button', { name: /Add BU/ })).not.toBeInTheDocument();
  });
});

// Scope-aware discriminating pair for the `cluster.update` gate on Remove-BU (BuRow
// inside UserAccessTree.tsx). `UserEdit.test.tsx` already covers this same gate through
// the full page (real userService/businessUnitService mocks, real data assembly), plus
// the UNRESOLVED_CLUSTER_ID fail-closed case for orphan BUs. Adding it here too, mounting
// UserAccessTree directly, is deliberately minimal (just the hide/show pair, not the
// orphan case which UserEdit.test.tsx already exercises in depth) — it isolates the
// component's own gate from the page's data-loading machinery and gives a failure signal
// that points straight at this component if its Can wrapper ever loses its clusterId.
describe('UserAccessTree — Remove BU is gated on cluster.update scoped to the BU\'s own cluster', () => {
  it('hides the Remove button without cluster.update scoped to the BU\'s own cluster', () => {
    auth.hasPermission = (perm) => perm !== 'cluster.update';
    renderTree();

    expect(screen.getByText('Front Office')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Front Office/ })).not.toBeInTheDocument();
  });

  it('shows the Remove button when cluster.update is scoped to the BU\'s own cluster (discriminating control)', () => {
    // Scope-aware mock (mirrors ClusterEdit.test.tsx / UserEdit.test.tsx) — only grants
    // cluster.update when the real checkPermission scoping context matches the BU's own
    // cluster_id ('z', from `bu('1', 'Front Office', 'z')` — note this is the raw
    // cluster_id field, distinct from the resolved cluster's `id` of 'c-z'). A wholesale
    // `() => true` mock would pass even if `<Can>` lost its `clusterId` prop — the exact
    // regression class this effort exists to catch.
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'z';
    renderTree();

    expect(screen.getByRole('button', { name: /Remove Front Office/ })).toBeInTheDocument();
  });
});
