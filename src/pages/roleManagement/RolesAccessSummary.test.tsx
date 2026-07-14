import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { summarizeRoles, RolesAccessSummary } from './RolesAccessSummary';

describe('summarizeRoles', () => {
  const list = [
    { id: 'a', name: 'Super Admin', is_active: true, permission_count: 31 },
    { id: 'b', name: 'Manager', is_active: true, permission_count: 12 },
    { id: 'c', name: 'Viewer', is_active: true, permission_count: 4 },
    { id: 'd', name: 'Retired', is_active: false, permission_count: 8 },
  ];

  it('counts active / inactive', () => {
    const s = summarizeRoles(list);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.inactive).toBe(1);
  });

  it('ranks the broadest roles first and caps the spotlight at three', () => {
    const s = summarizeRoles(list);
    expect(s.topRoles.map((r) => r.name)).toEqual(['Super Admin', 'Manager', 'Retired']);
    expect(s.maxCount).toBe(31);
  });

  it('defaults a missing permission count to zero and names', () => {
    const s = summarizeRoles([{ id: 'x', is_active: true }]);
    expect(s.topRoles[0]).toEqual({ id: 'x', name: '(unnamed role)', count: 0 });
    expect(s.maxCount).toBe(0);
  });

  it('handles an empty registry', () => {
    const s = summarizeRoles([]);
    expect(s.total).toBe(0);
    expect(s.topRoles).toEqual([]);
    expect(s.maxCount).toBe(0);
  });
});

describe('RolesAccessSummary', () => {
  const summary = {
    total: 5,
    active: 4,
    inactive: 1,
    topRoles: [
      { id: 'a', name: 'Super Admin', count: 31 },
      { id: 'b', name: 'Manager', count: 12 },
      { id: 'c', name: 'Viewer', count: 4 },
    ],
    maxCount: 31,
  };

  const renderBand = (props = {}) =>
    render(
      <MemoryRouter>
        <RolesAccessSummary summary={summary} loading={false} {...props} />
      </MemoryRouter>,
    );

  it('renders the total, active split and broadest-role bars', () => {
    renderBand();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/4 active/)).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('links each spotlighted role to its edit page', () => {
    renderBand();
    expect(screen.getByRole('link', { name: 'Manager' })).toHaveAttribute('href', '/platform/roles/b/edit');
  });

  it('labels each breadth bar for assistive tech', () => {
    renderBand();
    expect(screen.getByLabelText('Super Admin: 31 permissions')).toBeInTheDocument();
    expect(screen.getByLabelText('Viewer: 4 permissions')).toBeInTheDocument();
  });

  it('invites creating roles when the registry is empty', () => {
    renderBand({ summary: { total: 0, active: 0, inactive: 0, topRoles: [], maxCount: 0 } });
    expect(screen.getByText('No roles yet.')).toBeInTheDocument();
  });
});
