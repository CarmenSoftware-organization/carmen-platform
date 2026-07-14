import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleIdentityHero, permissionSummary } from './RoleIdentityHero';

describe('permissionSummary', () => {
  it('flags a role that grants the whole catalog', () => {
    expect(permissionSummary(['a.read', 'a.write'], 2)).toEqual({ text: 'Full access — every permission', full: true });
  });

  it('counts permissions and distinct resources for a scoped role', () => {
    expect(permissionSummary(['cluster.read', 'cluster.create', 'report.read'], 31)).toEqual({
      text: '3 permissions across 2 resources',
      full: false,
    });
    expect(permissionSummary(['cluster.read'], 31)).toEqual({ text: '1 permission across 1 resource', full: false });
  });

  it('prompts when nothing is granted', () => {
    expect(permissionSummary([], 31)).toEqual({ text: 'No permissions granted yet', full: false });
  });

  it('never calls it full when the catalog size is unknown (0)', () => {
    expect(permissionSummary(['cluster.read'], 0).full).toBe(false);
  });
});

describe('RoleIdentityHero', () => {
  const base = {
    name: 'support_manager',
    isActive: true,
    permissions: ['cluster.read', 'report.read'],
    catalogSize: 31,
  };

  it('shows the name, status and scoped permission summary', () => {
    render(<RoleIdentityHero {...base} />);
    expect(screen.getByRole('heading', { name: 'support_manager' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2 permissions across 2 resources')).toBeInTheDocument();
  });

  it('flags full access when the role grants the whole catalog', () => {
    render(<RoleIdentityHero {...base} permissions={['a', 'b']} catalogSize={2} />);
    expect(screen.getByText('Full access — every permission')).toBeInTheDocument();
  });

  it('marks an inactive role', () => {
    render(<RoleIdentityHero {...base} isActive={false} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('falls back to a placeholder name when unnamed', () => {
    render(<RoleIdentityHero {...base} name="" />);
    expect(screen.getByRole('heading', { name: '(unnamed role)' })).toBeInTheDocument();
  });
});
