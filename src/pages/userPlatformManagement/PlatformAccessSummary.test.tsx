import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { summarizeRegistry, PlatformAccessSummary, type RegistrySummary } from './PlatformAccessSummary';
import type { PlatformUserRow, PlatformUserRoleAssignment } from '../../types';

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

const row = (overrides: Partial<PlatformUserRow> = {}): PlatformUserRow => ({
  user_id: 'user-1',
  username: 'jdoe',
  is_active: true,
  roles: [platformRole()],
  ...overrides,
});

describe('summarizeRegistry', () => {
  it('takes holders from the registry-wide total, not from the loaded page', () => {
    const rows = [row({ user_id: 'a' }), row({ user_id: 'b' })];
    const s = summarizeRegistry(rows, 137);
    expect(s.holders).toBe(137);
    expect(rows.length).toBe(2);
    expect(s.holders).not.toBe(rows.length);
  });

  it('counts a holder with a platform-wide role once in platformWide, even alongside a cluster role, and sums both into assignments', () => {
    const rows = [row({ roles: [platformRole(), clusterRole()] })];
    const s = summarizeRegistry(rows, 1);
    expect(s.platformWide).toBe(1);
    expect(s.clusterOnly).toBe(0);
    expect(s.assignments).toBe(2);
  });

  it('counts a holder whose roles are all cluster-scoped as clusterOnly, not platformWide', () => {
    const rows = [
      row({
        user_id: 'a',
        roles: [clusterRole({ id: 'r1' }), clusterRole({ id: 'r2', scope: { type: 'cluster', cluster_id: 'cluster-2' } })],
      }),
    ];
    const s = summarizeRegistry(rows, 1);
    expect(s.clusterOnly).toBe(1);
    expect(s.platformWide).toBe(0);
    expect(s.assignments).toBe(2);
  });

  it('sums assignments across every holder on the page', () => {
    const rows = [
      row({ user_id: 'a', roles: [platformRole()] }),
      row({ user_id: 'b', roles: [clusterRole(), clusterRole({ id: 'r2' })] }),
      row({ user_id: 'c', roles: [platformRole(), clusterRole()] }),
    ];
    const s = summarizeRegistry(rows, 3);
    expect(s.assignments).toBe(5); // 1 (a) + 2 (b) + 2 (c)
  });

  it('counts inactive holders separately, without excluding them from the scope breakdown', () => {
    const rows = [
      row({ user_id: 'a', is_active: false, roles: [platformRole()] }),
      row({ user_id: 'b', is_active: true, roles: [clusterRole()] }),
    ];
    const s = summarizeRegistry(rows, 2);
    expect(s.inactive).toBe(1);
    expect(s.platformWide).toBe(1); // the inactive holder still counts toward scope
    expect(s.clusterOnly).toBe(1);
  });

  it('counts a holder with no roles toward neither platformWide nor clusterOnly', () => {
    const rows = [row({ roles: [] })];
    const s = summarizeRegistry(rows, 1);
    expect(s.platformWide).toBe(0);
    expect(s.clusterOnly).toBe(0);
    expect(s.assignments).toBe(0);
  });

  it('returns an all-zero breakdown for an empty page, while still reporting the registry-wide total', () => {
    const s = summarizeRegistry([], 0);
    expect(s).toEqual({ holders: 0, platformWide: 0, clusterOnly: 0, assignments: 0, inactive: 0 });
  });
});

describe('PlatformAccessSummary', () => {
  const summary: RegistrySummary = {
    holders: 137,
    platformWide: 6,
    clusterOnly: 14,
    assignments: 28,
    inactive: 0,
  };

  it('renders the registry-wide holder count as the headline, distinct from the page-scoped breakdown', () => {
    render(<PlatformAccessSummary summary={summary} loading={false} />);
    expect(screen.getByText('137')).toBeInTheDocument();
    expect(screen.getByText('holders')).toBeInTheDocument();
    expect(screen.getByText('Platform-wide')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Cluster-scoped')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  it('singularizes the headline label for exactly one holder', () => {
    render(<PlatformAccessSummary summary={{ ...summary, holders: 1 }} loading={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('holder')).toBeInTheDocument();
    expect(screen.queryByText('holders')).not.toBeInTheDocument();
  });

  it('shows a skeleton while the summary is loading', () => {
    const { container } = render(<PlatformAccessSummary summary={null} loading />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    render(<PlatformAccessSummary summary={null} loading={false} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the registry summary.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an actionable inactive-holders warning, using the warning token rather than a raw color, and applies the filter on click', async () => {
    const onShowInactive = vi.fn();
    render(
      <PlatformAccessSummary
        summary={{ ...summary, inactive: 3 }}
        loading={false}
        onShowInactive={onShowInactive}
      />,
    );
    const button = screen.getByRole('button', { name: /3 inactive holders still hold access/ });
    expect(button.className).toContain('text-warning');
    expect(button.className).not.toMatch(/amber|yellow/);
    await userEvent.click(button);
    expect(onShowInactive).toHaveBeenCalledTimes(1);
  });

  it('singularizes "holder" in the inactive warning for exactly one inactive holder', () => {
    render(<PlatformAccessSummary summary={{ ...summary, inactive: 1 }} loading={false} />);
    expect(screen.getByRole('button', { name: /1 inactive holder still hold access/ })).toBeInTheDocument();
  });

  it('omits the inactive warning entirely when there are no inactive holders', () => {
    render(<PlatformAccessSummary summary={{ ...summary, inactive: 0 }} loading={false} />);
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
  });
});
