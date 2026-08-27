import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { crumbsFromPath, Breadcrumbs } from './Breadcrumbs';

describe('crumbsFromPath', () => {
  it('maps a section list route to a single unlinked crumb', () => {
    expect(crumbsFromPath('/clusters')).toEqual([
      { labelKey: 'breadcrumb.clusters', fallback: 'Clusters' },
    ]);
  });

  it('maps an edit route to Section > Edit with the section linked', () => {
    expect(crumbsFromPath('/clusters/abc-123/edit')).toEqual([
      { labelKey: 'breadcrumb.clusters', fallback: 'Clusters', to: '/clusters' },
      { labelKey: 'breadcrumb.edit', fallback: 'Edit' },
    ]);
  });

  it('maps a new route to Section > New', () => {
    expect(crumbsFromPath('/business-units/new')).toEqual([
      { labelKey: 'breadcrumb.businessUnits', fallback: 'Business Units', to: '/business-units' },
      { labelKey: 'breadcrumb.new', fallback: 'New' },
    ]);
  });

  it('handles nested platform routes', () => {
    expect(crumbsFromPath('/platform/roles')).toEqual([
      { labelKey: 'breadcrumb.platform', fallback: 'Platform' },
      { labelKey: 'breadcrumb.roles', fallback: 'Roles' },
    ]);
  });

  it('leaves the broadcasts section crumb unlinked (no index route)', () => {
    expect(crumbsFromPath('/broadcasts/new')).toEqual([
      { labelKey: 'breadcrumb.broadcasts', fallback: 'Broadcasts' },
      { labelKey: 'breadcrumb.new', fallback: 'New' },
    ]);
  });

  it('returns an empty list for the dashboard', () => {
    expect(crumbsFromPath('/dashboard')).toEqual([]);
  });
});

describe('Breadcrumbs', () => {
  it('renders a linked section crumb and a current-page crumb', () => {
    render(
      <MemoryRouter initialEntries={['/clusters/abc-123/edit']}>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/clusters');
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});
