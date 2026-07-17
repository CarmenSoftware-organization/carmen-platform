import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { groupAccessByCluster, UserAccessTree, type AccessCluster, type AccessBU } from './UserAccessTree';

// This is a presentational-component test — permission gating itself (Fix 1) is
// covered by the integration tests in `UserEdit.test.tsx`. Here `Can` stays the
// REAL component (not mocked), but `useAuth` is stubbed to always grant, so the
// existing structural/behavioral assertions below are unaffected by the
// `<Can>` gate now wrapping the Remove-BU button.
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true, isSuperAdmin: false }),
}));

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
