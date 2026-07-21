import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Network } from 'lucide-react';
import { ListEmptyState } from './ListEmptyState';

describe('ListEmptyState', () => {
  const base = {
    icon: Network,
    emptyTitle: 'No clusters yet',
    emptyDescription: 'Create your first cluster.',
    addAction: <button>Add Cluster</button>,
  };

  it('shows the "empty" title + add action when nothing is searched or filtered', () => {
    render(<ListEmptyState {...base} searchTerm="" activeFilterCount={0} />);
    expect(screen.getByText('No clusters yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Cluster' })).toBeInTheDocument();
  });

  it('shows the no-match state (no add action) when a search term is present', () => {
    render(<ListEmptyState {...base} searchTerm="acme" activeFilterCount={0} />);
    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Cluster' })).not.toBeInTheDocument();
  });

  it('shows the no-match state when only filters are active (no search term)', () => {
    render(<ListEmptyState {...base} searchTerm="" activeFilterCount={2} />);
    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Cluster' })).not.toBeInTheDocument();
  });

  it('uses custom no-match copy when provided', () => {
    render(
      <ListEmptyState
        {...base}
        searchTerm="acme"
        activeFilterCount={0}
        noMatchTitle="No clusters match"
      />,
    );
    expect(screen.getByText('No clusters match')).toBeInTheDocument();
  });
});
