import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

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
vi.mock('../services/databasePoolService', () => ({
  default: { getAll: vi.fn() },
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
import databasePoolService from '../services/databasePoolService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeBu = {
  id: 'bu1', cluster_id: 'c1', code: 'BU1', name: 'Test BU',
  is_active: true, is_hq: false, config: [], users: [],
};

// Renders the current pathname so a test can prove where a post-save navigate()
// actually landed, without depending on what the destination route renders.
const PathProbe: React.FC = () => {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PathProbe />
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
  asMock(databasePoolService.getAll).mockResolvedValue({ data: [] });
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
    // license pre-check reads the cluster's bu_cap/bu_used (Task 9 fix — a stale
    // max_license_bu no longer drives this): quota covers this create, so it proceeds.
    asMock(clusterService.getById).mockResolvedValue({ data: { id: 'c1', bu_cap: 5, bu_used: 0 } });
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
    // REGRESSION (finding #1): a successful create must land on the registered
    // `/business-units/:id/edit` route, not the unregistered `/business-units/:id`
    // — the latter falls through App.tsx's catch-all straight to the 404 page.
    // waitFor, not findByTestId: the probe is on screen from the first render, so
    // findBy resolves instantly against the pre-navigation pathname. React Router 7
    // wraps navigation in React.startTransition, so the location lands a tick later.
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent('/business-units/bu9/edit'),
    );
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

    // DB connection: the pool selector must not be reachable at all.
    expect(screen.queryByRole('combobox', { name: 'Database Pool' })).toBeNull();
    expect(screen.queryByLabelText('Schema')).toBeNull();

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

    expect(await screen.findByRole('combobox', { name: 'Database Pool' })).toBeInTheDocument();
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

// SECURITY REGRESSION (final review). `canEdit` had the identical fail-open pattern as
// the DB-password reveal gate (DatabaseConnectionSection.test.tsx): `formData.cluster_id
// ? { clusterId } : undefined` passes ctx undefined for a cluster-less BU, which
// checkPermission's broad "any cluster" branch then authorizes off cluster.update held
// on ANY OTHER cluster — granting write access to the whole edit surface. Must fail
// CLOSED via UNRESOLVED_CLUSTER_ID (mirrors UserEdit.test.tsx's orphan-BU case).
describe('BusinessUnitEdit — canEdit fails closed on an empty cluster_id', () => {
  it('does not grant write access on a BU with no cluster_id, even though cluster.update is held on a different cluster', async () => {
    asMock(businessUnitService.getById).mockResolvedValue({ data: { ...fakeBu, cluster_id: '' } });
    // Mirrors real checkPermission's two branches: scoped to a real cluster id -> only
    // 'some-other-cluster' passes; NOT scoped (ctx undefined, what the old canEdit
    // ternary produced for an empty cluster_id) -> broad "any cluster" fallback -> true,
    // since the admin holds cluster.update on 'some-other-cluster'.
    auth.hasPermission = (perm: string, ctx?: { clusterId?: string }) => {
      if (perm !== 'cluster.update') return false;
      if (ctx?.clusterId) return ctx.clusterId === 'some-other-cluster';
      return true;
    };
    renderAt('/business-units/bu1/edit');

    expect(await screen.findByRole('heading', { name: /test bu/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Database Pool' })).toBeNull();
    expect(screen.getByTestId('users-card')).toHaveAttribute('data-can-edit', 'false');
  });
});

// DATA INTEGRITY. buildPayload() only re-sends database_pool_id/db_schema when they
// actually changed from the last-loaded snapshot — the platform-role-gated backend
// write would otherwise 403 a cluster admin who saved an unrelated field without ever
// touching the pool. These tests lock that diffing behaviour in, in both directions
// (the direct replacement for the old write-only db_connection.password coverage,
// which no longer applies now that BU records hold no credentials at all).
describe('BusinessUnitEdit — save omits unchanged database pool fields', () => {
  const buWithPool = {
    ...fakeBu,
    database_pool_id: 'p1',
    db_schema: 'cbr_prod',
    database_pool: { id: 'p1', name: 'tenant-db-sg-01' },
  };

  it('omits database_pool_id/db_schema from the update payload when neither changed', async () => {
    const user = userEvent.setup();
    asMock(businessUnitService.getById).mockResolvedValue({ data: buWithPool });
    renderAt('/business-units/bu1/edit');

    // Edit an unrelated field to reveal the save bar; the pool/schema are untouched.
    await user.click(await screen.findByRole('button', { name: 'Test BU' }));
    const nameInput = screen.getByRole('textbox', { name: /business unit name/i });
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed BU');
    await user.tab();

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    expect(businessUnitService.update).toHaveBeenCalledTimes(1);
    const payload = asMock(businessUnitService.update).mock.calls[0][1];
    expect(payload).not.toHaveProperty('database_pool_id');
    expect(payload).not.toHaveProperty('db_schema');
  });

  it('includes the new schema in the update payload once the user sets one on a BU with no pool configured yet', async () => {
    const user = userEvent.setup();
    asMock(businessUnitService.getById).mockResolvedValue({ data: fakeBu }); // no pool/schema set
    renderAt('/business-units/bu1/edit');

    const schemaInput = await screen.findByLabelText('Schema');
    await user.type(schemaInput, 'cbr_prod');
    await user.tab();
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    expect(businessUnitService.update).toHaveBeenCalledTimes(1);
    const payload = asMock(businessUnitService.update).mock.calls[0][1];
    expect(payload.db_schema).toBe('cbr_prod');
  });
});

// FEATURE. "Copy from hotel address" on the Company group must go through the
// same setFormData path as every other edit-in-place field — not a side-channel
// setState — so it marks hasChanges (dirty), is included in the next Save
// payload, and is reverted by Cancel like any other field.
describe('BusinessUnitEdit — copy hotel address to company', () => {
  const buWithHotelAddress = {
    ...fakeBu,
    hotel_address_line1: '123 Hotel Street',
  };

  it('copies the hotel address fields into the company address fields and marks the form dirty', async () => {
    const user = userEvent.setup();
    asMock(businessUnitService.getById).mockResolvedValue({ data: buWithHotelAddress });
    renderAt('/business-units/bu1/edit');

    await screen.findByRole('heading', { name: /test bu/i });
    // Before copying, only the hotel field carries the value; no save bar yet.
    expect(screen.getAllByText('123 Hotel Street')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /copy from hotel address/i }));

    // Company address line 1 now shows the copied value too (hotel's original +
    // company's copy = 2 occurrences), proving the copy actually landed in formData
    // and re-rendered — not just that a handler fired.
    expect(screen.getAllByText('123 Hotel Street')).toHaveLength(2);
    // Went through the real dirty-tracking mechanism (setFormData vs savedFormData).
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('is revertable via Cancel, like any other edit-in-place field', async () => {
    const user = userEvent.setup();
    asMock(businessUnitService.getById).mockResolvedValue({ data: buWithHotelAddress });
    renderAt('/business-units/bu1/edit');

    await screen.findByRole('heading', { name: /test bu/i });
    await user.click(screen.getByRole('button', { name: /copy from hotel address/i }));
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getAllByText('123 Hotel Street')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });

  it('hides the copy-from-hotel-address action without cluster.update', async () => {
    auth.hasPermission = () => false;
    asMock(businessUnitService.getById).mockResolvedValue({ data: buWithHotelAddress });
    renderAt('/business-units/bu1/edit');

    expect(await screen.findByRole('heading', { name: /test bu/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy from hotel address/i })).toBeNull();
  });
});
