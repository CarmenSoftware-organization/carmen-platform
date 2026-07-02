import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PageHeader', () => {
  it('renders the title as an h1 at the enterprise scale', () => {
    wrap(<PageHeader title="Cluster Management" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Cluster Management' });
    expect(h1.className).toContain('text-xl');
    expect(h1.className).toContain('font-semibold');
    expect(h1.className).not.toContain('text-3xl');
  });

  it('renders subtitle, actions, and a back link when given', () => {
    wrap(<PageHeader title="Edit" subtitle="update the cluster" backTo="/clusters" actions={<button>Save</button>} />);
    expect(screen.getByText('update the cluster')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/clusters');
  });

  it('renders beforeTitle next to the title but not inside the h1', () => {
    wrap(<PageHeader title="User Details" beforeTitle={<span data-testid="avatar-slot">AV</span>} />);
    const beforeEl = screen.getByTestId('avatar-slot');
    expect(beforeEl).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1, name: 'User Details' });
    expect(h1).not.toContainElement(beforeEl);
  });
});
