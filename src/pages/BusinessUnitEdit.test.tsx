import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Note: no vi.mock('../components/Can') here — BusinessUnitEdit.tsx never imports
// `Can` (gating goes through `canEdit` props instead), so mocking it would be a
// landmine that silently hollows out this file's permission tests the moment
// someone adds a `<Can>` to this page. See Fix 5 in the final-review round.
// Mutable auth so a test can revoke cluster.update / cluster.create.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));
// Heavy child cards → trivial stubs (their internals are out of scope here).
// The branding/users stubs surface the permission prop they are handed, so the
// page's obligation to gate them is asserted at this seam.
vi.mock('../components/TenantMigrationCard', () => ({ default: () => <div>tenant-migration</div> }));
vi.mock('../components/TenantSeedCard', () => ({ default: () => <div>tenant-seed</div> }));
vi.mock('./businessUnitEdit/BusinessUnitBrandingCard', () => ({
  default: ({ editing }: { editing: boolean }) => (
    <div data-testid="branding-card" data-editing={String(editing)}>branding-card</div>
  ),
}));
vi.mock('./businessUnitEdit/BusinessUnitUsersCard', () => ({
  default: ({ canEdit }: { canEdit?: boolean }) => (
    <div data-testid="users-card" data-can-edit={String(canEdit)}>users-card</div>
  ),
}));
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
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
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

  it('blocks create when the required code is missing, without calling the API', async () => {
    const user = userEvent.setup();
    renderAt('/business-units/new?cluster_id=c1');
    // name is required too; set it so only code is missing.
    await user.click(await screen.findByRole('button', { name: /unnamed business unit/i }));
    await user.type(screen.getByRole('textbox', { name: /business unit name/i }), 'New BU');
    await user.tab();

    await user.click(await screen.findByRole('button', { name: /create business unit/i }));

    expect(businessUnitService.create).not.toHaveBeenCalled();
    // shown both in the error banner and inline under the Code field
    expect((await screen.findAllByText(/code is required/i)).length).toBeGreaterThan(0);
  });

  it('creates when required fields are present', async () => {
    const user = userEvent.setup();
    asMock(businessUnitService.create).mockResolvedValue({ data: { id: 'bu9' } });
    // license pre-check reads the cluster; no limit set → create proceeds.
    asMock(clusterService.getById).mockResolvedValue({ data: { id: 'c1', max_license_bu: null } });
    renderAt('/business-units/new?cluster_id=c1');

    await user.click(await screen.findByRole('button', { name: /unnamed business unit/i }));
    await user.type(screen.getByRole('textbox', { name: /business unit name/i }), 'New BU');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /^set code…$/i }));
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'BU9');
    await user.tab();

    await user.click(await screen.findByRole('button', { name: /create business unit/i }));

    expect(businessUnitService.create).toHaveBeenCalledTimes(1);
    expect(asMock(businessUnitService.create).mock.calls[0][0]).toMatchObject({
      code: 'BU9', name: 'New BU', cluster_id: 'c1',
    });
  });
});

// SECURITY REGRESSION. `canEdit` is the page's single source of truth for write
// access (cluster.create on new, cluster.update on existing). Every mutating
// surface must honour it. It previously reached only the InlineField rows and
// the is_active/is_hq toggles, while the DB-connection / calculation / number-
// format / configuration sections were hardcoded `editing: true`, branding got a
// literal `true`, the users card had no gate at all, and neither the Save button
// nor the Ctrl/Cmd+S shortcut checked it — so a read-only user could edit
// database credentials and persist them.
describe('BusinessUnitEdit — write access is gated on canEdit', () => {
  it('offers no editable database-connection, calculation or config controls without cluster.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/business-units/bu1/edit');

    // page has loaded
    expect(await screen.findByRole('heading', { name: /test bu/i })).toBeInTheDocument();

    // DB connection: the credential inputs must not be reachable at all.
    expect(screen.queryByRole('textbox', { name: 'Host' })).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Port' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'User' })).toBeNull();
    expect(screen.queryByRole('button', { name: /add field/i })).toBeNull();

    // Calculation settings / number formats / configuration.
    expect(screen.queryByRole('combobox', { name: /calculation method/i })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /amount format/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add config entry/i })).toBeNull();

    // Slotted cards are handed the gate.
    expect(screen.getByTestId('branding-card')).toHaveAttribute('data-editing', 'false');
    expect(screen.getByTestId('users-card')).toHaveAttribute('data-can-edit', 'false');
  });

  it('keeps those controls when the user does hold cluster.update', async () => {
    // Discriminating control: proves the assertions above are not vacuous.
    renderAt('/business-units/bu1/edit');

    expect(await screen.findByRole('textbox', { name: 'Host' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /calculation method/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add config entry/i })).toBeInTheDocument();
    expect(screen.getByTestId('branding-card')).toHaveAttribute('data-editing', 'true');
    expect(screen.getByTestId('users-card')).toHaveAttribute('data-can-edit', 'true');
  });

  it('does not let a user without cluster.create save a new business unit', async () => {
    const user = userEvent.setup();
    auth.hasPermission = () => false;
    renderAt('/business-units/new?cluster_id=c1');

    const createBtn = await screen.findByRole('button', { name: /create business unit/i });
    expect(createBtn).toBeDisabled();

    await user.click(createBtn);
    expect(businessUnitService.create).not.toHaveBeenCalled();
  });

  it('does not let the Ctrl/Cmd+S shortcut bypass the disabled Save button', async () => {
    const user = userEvent.setup();
    auth.hasPermission = () => false;
    renderAt('/business-units/new?cluster_id=c1');
    await screen.findByRole('button', { name: /create business unit/i });

    // The keyboard shortcut calls handleSave directly — a disabled button is no
    // defence on its own.
    await user.keyboard('{Control>}s{/Control}');

    expect(businessUnitService.create).not.toHaveBeenCalled();
    expect(businessUnitService.update).not.toHaveBeenCalled();
  });
});
