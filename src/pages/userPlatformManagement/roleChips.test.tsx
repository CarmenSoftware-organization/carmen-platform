import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { hasPlatformWide, ScopeRail, RoleChips } from './roleChips';
import type { PlatformUserRoleAssignment } from '../../types';

const platformRole = (overrides: Partial<PlatformUserRoleAssignment> = {}): PlatformUserRoleAssignment => ({
  id: 'assign-1',
  role_id: 'role-1',
  role_name: 'Platform Admin',
  scope: { type: 'platform' },
  ...overrides,
});

const clusterRole = (overrides: Partial<PlatformUserRoleAssignment> = {}): PlatformUserRoleAssignment => ({
  id: 'assign-2',
  role_id: 'role-2',
  role_name: 'Cluster Admin',
  scope: { type: 'cluster', cluster_id: 'cluster-1', cluster_name: 'Cluster One' },
  ...overrides,
});

describe('hasPlatformWide', () => {
  it('is true when any assignment is platform-wide, even alongside cluster roles', () => {
    expect(hasPlatformWide([clusterRole(), platformRole()])).toBe(true);
  });

  it('is false when a holder only has cluster-scoped assignments', () => {
    expect(
      hasPlatformWide([
        clusterRole({ id: 'r1' }),
        clusterRole({ id: 'r2', scope: { type: 'cluster', cluster_id: 'cluster-2' } }),
      ]),
    ).toBe(false);
  });

  it('is false for an empty roles array', () => {
    expect(hasPlatformWide([])).toBe(false);
  });
});

describe('ScopeRail', () => {
  it('is decorative — hidden from assistive tech since the scope name is written beside it elsewhere', () => {
    const { container } = render(<ScopeRail platformWide />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('uses the primary token fill for a platform-wide holder', () => {
    const { container } = render(<ScopeRail platformWide />);
    expect(container.firstChild).toHaveClass('bg-primary');
  });

  it('uses a bordered, unfilled treatment for a cluster-scoped holder', () => {
    const { container } = render(<ScopeRail platformWide={false} />);
    expect(container.firstChild).not.toHaveClass('bg-primary');
    expect(container.firstChild).toHaveClass('border');
  });
});

describe('RoleChips', () => {
  it('renders a dash placeholder for a holder with no role assignments', () => {
    render(<RoleChips roles={[]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('groups assignments by scope, naming the scope once per group', () => {
    render(
      <RoleChips
        roles={[
          clusterRole({ id: 'r1', role_name: 'Viewer', scope: { type: 'cluster', cluster_id: 'cluster-1', cluster_name: 'Cluster One' } }),
          clusterRole({ id: 'r2', role_name: 'Editor', scope: { type: 'cluster', cluster_id: 'cluster-1', cluster_name: 'Cluster One' } }),
        ]}
      />,
    );
    expect(screen.getAllByText('Cluster One')).toHaveLength(1);
    expect(screen.getByText('Viewer')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  it('orders Platform first and remaining clusters alphabetically, regardless of input order', () => {
    render(
      <RoleChips
        roles={[
          clusterRole({ id: 'r1', role_name: 'Zeta Role', scope: { type: 'cluster', cluster_id: 'z', cluster_name: 'Zeta Cluster' } }),
          platformRole({ id: 'r2', role_name: 'Platform Admin' }),
          clusterRole({ id: 'r3', role_name: 'Alpha Role', scope: { type: 'cluster', cluster_id: 'a', cluster_name: 'Alpha Cluster' } }),
        ]}
      />,
    );
    const scopeLabels = screen
      .getAllByText(/^(Platform|Alpha Cluster|Zeta Cluster)$/)
      .map((el) => el.textContent);
    expect(scopeLabels).toEqual(['Platform', 'Alpha Cluster', 'Zeta Cluster']);
  });

  it('falls back to cluster_id, never a blank label, when cluster_name did not resolve', () => {
    render(
      <RoleChips
        roles={[
          clusterRole({
            id: 'r1',
            role_name: 'Viewer',
            scope: { type: 'cluster', cluster_id: 'unresolved-cluster-id' },
          }),
        ]}
      />,
    );
    expect(screen.getByText('unresolved-cluster-id')).toBeInTheDocument();
  });

  it('falls back to role_id when role_name is absent', () => {
    render(<RoleChips roles={[platformRole({ role_name: undefined, role_id: 'role-xyz' })]} />);
    expect(screen.getByText('role-xyz')).toBeInTheDocument();
  });
});
