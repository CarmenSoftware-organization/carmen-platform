import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { BusinessUnitsSection } from './BusinessUnitsSection';
import type { BusinessUnit } from '../../../types';

const bus: BusinessUnit[] = [
  { id: 'b1', cluster_id: 'c1', code: 'HQ', name: 'Head Office', is_active: true, max_license_users: 10 },
  { id: 'b2', cluster_id: 'c1', code: 'BR', name: 'Branch', is_active: false, max_license_users: 5 },
];

function renderSection(extra?: Partial<React.ComponentProps<typeof BusinessUnitsSection>>) {
  return render(
    <BusinessUnitsSection
      clusterId="c1" businessUnits={bus} clusterUsers={[]} loading={false}
      maxLicenseBu={5} onRefresh={() => {}} onNavigate={() => {}} {...extra}
    />,
  );
}

describe('BusinessUnitsSection', () => {
  it('filters by search term', async () => {
    renderSection();
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'branch');
    expect(screen.queryByText('Head Office')).toBeNull();
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  it('filters to active only via chip', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.queryByText('Branch')).toBeNull();
  });

  it('shows an empty state when there are no BUs', () => {
    renderSection({ businessUnits: [] });
    expect(screen.getByText(/no business units/i)).toBeInTheDocument();
  });
});
