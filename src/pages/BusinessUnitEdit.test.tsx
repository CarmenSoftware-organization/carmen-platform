import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/Can', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isSuperAdmin: false, hasPermission: () => true }),
}));
// Heavy child cards → trivial stubs (their internals are out of scope here).
vi.mock('../components/TenantMigrationCard', () => ({ default: () => <div>tenant-migration</div> }));
vi.mock('../components/TenantSeedCard', () => ({ default: () => <div>tenant-seed</div> }));
vi.mock('./businessUnitEdit/BusinessUnitBrandingCard', () => ({ default: () => <div>branding-card</div> }));
vi.mock('./businessUnitEdit/BusinessUnitUsersCard', () => ({ default: () => <div>users-card</div> }));
vi.mock('./businessUnitEdit/useBusinessUnitUsers', () => ({
  useBusinessUnitUsers: () => ({ buUsers: [], setBuUsers: vi.fn(), rawClusterUsersResponse: null }),
}));

vi.mock('../services/clusterService', () => ({
  default: { getById: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../services/businessUnitService', () => ({
  default: {
    getById: vi.fn(), getAll: vi.fn(), create: vi.fn(), update: vi.fn(),
    uploadLogo: vi.fn(), uploadAvatar: vi.fn(),
  },
}));
vi.mock('../services/currencyService', () => ({
  default: { getForBu: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import BusinessUnitEdit from './BusinessUnitEdit';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeBu = {
  id: 'bu1', cluster_id: 'c1', code: 'BU1', name: 'Test BU',
  is_active: true, is_hq: false, config: [], users: [],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/business-units/new" element={<BusinessUnitEdit />} />
        <Route path="/business-units/:id/edit" element={<BusinessUnitEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
  asMock(clusterService.getAll).mockResolvedValue({ data: [{ id: 'c1', name: 'Acme' }] });
  asMock(businessUnitService.getAll).mockResolvedValue({ data: [] });
  asMock(businessUnitService.getById).mockResolvedValue({ data: fakeBu });
});

describe('BusinessUnitEdit (one-document)', () => {
  it('renders one editable document — name in the hero, fact groups, no read/edit toggle', async () => {
    renderAt('/business-units/bu1/edit');
    expect(await screen.findByRole('button', { name: 'Test BU' })).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    // there is no separate read view / "Edit details" affordance any more
    expect(screen.queryByRole('button', { name: /edit details/i })).toBeNull();
    // no changes yet → no save bar
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });

  it('reveals the save bar after editing a field in place', async () => {
    const user = userEvent.setup();
    renderAt('/business-units/bu1/edit');
    await user.click(await screen.findByRole('button', { name: 'Test BU' }));
    const input = screen.getByRole('textbox', { name: /business unit name/i });
    await user.clear(input);
    await user.type(input, 'Renamed BU');
    await user.tab(); // blur commits
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('starts a new BU in create mode (save bar shown), without calling getById', async () => {
    renderAt('/business-units/new');
    expect(await screen.findByRole('button', { name: /create business unit/i })).toBeInTheDocument();
    expect(businessUnitService.getById).not.toHaveBeenCalled();
  });
});
