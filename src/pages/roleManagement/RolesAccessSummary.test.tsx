import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RolesAccessSummary } from './RolesAccessSummary';

describe('RolesAccessSummary', () => {
  const summary = {
    total: 5,
    active: 4,
    inactive: 1,
    deleted: 0,
    top_roles: [
      { id: 'a', name: 'Super Admin', permission_count: 31 },
      { id: 'b', name: 'Manager', permission_count: 12 },
      { id: 'c', name: 'Viewer', permission_count: 4 },
    ],
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
    renderBand({ summary: { total: 0, active: 0, inactive: 0, deleted: 0, top_roles: [] } });
    expect(screen.getByText('No roles yet.')).toBeInTheDocument();
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    renderBand({ summary: null, loading: false, error: true, onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the roles summary.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
