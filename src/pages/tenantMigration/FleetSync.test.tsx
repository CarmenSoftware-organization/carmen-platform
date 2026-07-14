import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FleetSync } from './FleetSync';

describe('FleetSync', () => {
  it('shows the in-sync count and status breakdown once checked', () => {
    render(
      <FleetSync
        total={12}
        summary={{ up_to_date: 8, pending: 3, unknown: 0, error: 1, pendingMigrations: 8 }}
        actions={<button type="button">Check all</button>}
      />,
    );
    expect(screen.getByText('tenants in sync')).toBeInTheDocument();
    expect(screen.getByText('In sync')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(/pending migration/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check all' })).toBeInTheDocument();
  });

  it('prompts to check when nothing has been checked yet', () => {
    render(
      <FleetSync
        total={12}
        summary={{ up_to_date: 0, pending: 0, unknown: 12, error: 0, pendingMigrations: 0 }}
        actions={<span />}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Not checked yet/)).toBeInTheDocument();
  });
});
