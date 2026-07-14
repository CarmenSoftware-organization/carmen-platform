import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClusterHero } from './ClusterHero';

const base = {
  name: 'Acme Hotels',
  code: 'ACME',
  alias: 'AH',
  isActive: true,
  meta: { created_at: '2025-02-11T00:00:00Z', created_by_name: 'A. Wong', updated_at: '2025-07-08T00:00:00Z', updated_by_name: 'S. Chan' },
  bu: { used: 14, cap: 20, active: 12 },
  users: { used: 312, cap: 400, active: 287 },
};

describe('ClusterHero', () => {
  it('leads with the cluster name, code and status', () => {
    render(<ClusterHero {...base} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Hotels' })).toBeInTheDocument();
    expect(screen.getByText('ACME', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows both capacity gauges with used / cap', () => {
    render(<ClusterHero {...base} />);
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText(/20 licensed/)).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText(/400 licensed/)).toBeInTheDocument();
  });

  it('renders the created and updated audit trail', () => {
    render(<ClusterHero {...base} />);
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.getByText(/by A\. Wong/)).toBeInTheDocument();
    expect(screen.getByText(/by S\. Chan/)).toBeInTheDocument();
  });

  it('reads users capacity as uncapped when there is no per-BU cap', () => {
    render(<ClusterHero {...base} users={{ used: 312, cap: null, active: 287 }} />);
    expect(screen.getByText(/no per-BU user cap set/)).toBeInTheDocument();
  });

  it('renders the provided edit action', () => {
    render(<ClusterHero {...base} actions={<button type="button">Edit details</button>} />);
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
  });
});
