import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke subscription.manage. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself would make every permission
// assertion below vacuous. `subscription.*` is a platform-scoped permission (no clusterId).
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/subscriptionService', () => ({
  default: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setFeatures: vi.fn(),
    delete: vi.fn(),
    getFeatureCatalog: vi.fn(),
  },
}));
vi.mock('../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../services/clusterService', () => ({
  default: { getAll: vi.fn() },
}));

import SubscriptionEdit from './SubscriptionEdit';
import subscriptionService from '../services/subscriptionService';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import type { SubscriptionDetail } from '../types';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleDetail: SubscriptionDetail = {
  id: 'sub1',
  cluster_id: 'c1',
  cluster_name: 'Acme Cluster',
  cluster_code: 'CLS1',
  subscription_number: 'SUB-0001',
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2026-12-31T00:00:00.000Z',
  status: 'active',
  state: 'active',
  doc_version: 3,
  seat: { used: 8, cap: 10, pending_invites: 1 },
  bus: [
    { business_unit_id: 'bu1', bu_code: 'BU1', bu_name: 'Acme BU', feature_keys: [], licensed_users: 10 },
  ],
};

const emptyBuList = { data: [], paginate: { total: 0, page: 1, perpage: 100 } };
const emptyClusterList = { data: [], paginate: { total: 0, page: 1, perpage: 200 } };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/subscriptions/new" element={<SubscriptionEdit />} />
        <Route path="/subscriptions/:id/edit" element={<SubscriptionEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(businessUnitService.getAll).mockResolvedValue(emptyBuList);
  asMock(clusterService.getAll).mockResolvedValue(emptyClusterList);
  // FeatureMatrixCard (Task B4) fetches its own catalog on mount whenever an existing
  // subscription renders — every test below that reaches that section needs this resolved,
  // or the card's own catalogFailed state (tested separately in FeatureMatrixCard.test.tsx)
  // would fire here and swallow unrelated assertions.
  asMock(subscriptionService.getFeatureCatalog).mockResolvedValue({ data: [] });
});

describe('SubscriptionEdit — create mode reads cluster_id from the query param', () => {
  it('prefills the cluster picker from ?cluster_id=', async () => {
    asMock(clusterService.getAll).mockResolvedValue({
      data: [
        { id: 'c1', code: 'CLS1', name: 'Acme Cluster', is_active: true },
        { id: 'c2', code: 'CLS2', name: 'Beta Cluster', is_active: true },
      ],
      paginate: { total: 2, page: 1, perpage: 200 },
    });
    renderAt('/subscriptions/new?cluster_id=c1');

    const select = (await screen.findByLabelText(/cluster/i)) as HTMLSelectElement;
    expect(select.value).toBe('c1');
  });
});

describe('SubscriptionEdit — create sends only the allowed fields', () => {
  it('POSTs cluster_id/subscription_number/start_date/end_date/status only — no doc_version, no extras', async () => {
    asMock(subscriptionService.create).mockResolvedValue({ data: { id: 'new1' } });
    const user = userEvent.setup();
    renderAt('/subscriptions/new?cluster_id=c1');

    await user.type(await screen.findByPlaceholderText('SUB-2026-001'), 'SUB-9999');
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-12-31' } });

    await user.click(screen.getByRole('button', { name: /create subscription/i }));

    await waitFor(() => expect(subscriptionService.create).toHaveBeenCalledTimes(1));
    expect(subscriptionService.create).toHaveBeenCalledWith({
      cluster_id: 'c1',
      subscription_number: 'SUB-9999',
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-12-31T00:00:00.000Z',
      status: 'active',
    });
  });

  it('blocks submit and never calls the API when end_date is not after start_date', async () => {
    const user = userEvent.setup();
    renderAt('/subscriptions/new?cluster_id=c1');

    await user.type(await screen.findByPlaceholderText('SUB-2026-001'), 'SUB-9999');
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-01-01' } });

    await user.click(screen.getByRole('button', { name: /create subscription/i }));

    expect(await screen.findByText(/end date must be after start date/i)).toBeInTheDocument();
    expect(subscriptionService.create).not.toHaveBeenCalled();
  });
});

describe('SubscriptionEdit — update sends doc_version plus only the allowed fields', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
  });

  it('PATCHes with doc_version always present, no extra keys like id/state/bu_count', async () => {
    asMock(subscriptionService.update).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.clear(numberInput);
    await user.type(numberInput, 'SUB-0002');

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.update).toHaveBeenCalledTimes(1));
    expect(subscriptionService.update).toHaveBeenCalledWith('sub1', {
      doc_version: 3,
      subscription_number: 'SUB-0002',
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-12-31T00:00:00.000Z',
      status: 'active',
    });
  });
});

describe('SubscriptionEdit — Save persists FeatureMatrixCard (B4) bus edits too', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    asMock(businessUnitService.getAll).mockResolvedValue({
      data: [
        { id: 'bu1', code: 'BU1', name: 'Acme BU', is_active: true },
        { id: 'bu2', code: 'BU2', name: 'Beta BU', is_active: true },
      ],
      paginate: { total: 2, page: 1, perpage: 100 },
    });
  });

  it('bus-only change: calls setFeatures with the mapped payload + current doc_version, never touches update', async () => {
    asMock(subscriptionService.setFeatures).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    await screen.findByText('SUB-0001');
    await user.selectOptions(await screen.findByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม'), 'bu2');
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.setFeatures).toHaveBeenCalledTimes(1));
    expect(subscriptionService.setFeatures).toHaveBeenCalledWith(
      'sub1',
      [
        { business_unit_id: 'bu1', feature_keys: [] },
        { business_unit_id: 'bu2', feature_keys: [] },
      ],
      3,
    );
    expect(subscriptionService.update).not.toHaveBeenCalled();
  });

  it('both changed: PATCHes first, then calls setFeatures with the doc_version the PATCH response returned', async () => {
    asMock(subscriptionService.update).mockResolvedValue({
      data: { ...sampleDetail, subscription_number: 'SUB-0002', doc_version: 4 },
    });
    asMock(subscriptionService.setFeatures).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.clear(numberInput);
    await user.type(numberInput, 'SUB-0002');
    await user.selectOptions(await screen.findByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม'), 'bu2');
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.setFeatures).toHaveBeenCalledTimes(1));
    expect(subscriptionService.update).toHaveBeenCalledTimes(1);
    // The bumped doc_version (4) from update()'s own response, not the stale value (3) this
    // page loaded with — calling setFeatures with 3 here would 409 against the PATCH that just
    // ran in the same save.
    expect(subscriptionService.setFeatures).toHaveBeenCalledWith(
      'sub1',
      [
        { business_unit_id: 'bu1', feature_keys: [] },
        { business_unit_id: 'bu2', feature_keys: [] },
      ],
      4,
    );
  });

  it('no bus change: Save never calls setFeatures at all', async () => {
    asMock(subscriptionService.update).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.type(numberInput, 'X');
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.update).toHaveBeenCalledTimes(1));
    expect(subscriptionService.setFeatures).not.toHaveBeenCalled();
  });
});

describe('SubscriptionEdit — 409 version conflict vs. duplicate subscription number', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
  });

  it('a version-conflict 409 notifies + refetches (not a field error)', async () => {
    asMock(subscriptionService.update).mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Record was modified by another request (model=Subscription, expected doc_version=3).' } },
    });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.clear(numberInput);
    await user.type(numberInput, 'SUB-0002');
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Refetch happened: getById called again (initial load + the post-conflict refetch).
    await waitFor(() => expect(subscriptionService.getById).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/subscription number is already used|already used in this cluster/i)).toBeNull();
  });

  it('a duplicate-number 409 (different message, not a version conflict) sets fieldErrors.subscription_number, not a toast', async () => {
    asMock(subscriptionService.update).mockRejectedValueOnce({
      response: { status: 409, data: { message: 'subscription_number already exists for this cluster' } },
    });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.clear(numberInput);
    await user.type(numberInput, 'SUB-DUPLICATE');
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('subscription_number already exists for this cluster')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    // Only the initial load — a duplicate-number rejection must not trigger a refetch.
    expect(subscriptionService.getById).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionEdit — permission gating', () => {
  it('a subscription.read-only user can open an existing subscription but sees no Save button', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read';
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    renderAt('/subscriptions/sub1/edit');

    expect(await screen.findByRole('heading', { name: 'SUB-0001' })).toBeInTheDocument();
    // Fields render read-only (no inputs), and nothing to save means no bottom bar at all.
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByDisplayValue('SUB-0001')).toBeNull();
  });

  it('a subscription.manage user sees editable fields and, once changed, a Save button', async () => {
    auth.hasPermission = () => true;
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/subscriptions/sub1/edit');

    const numberInput = await screen.findByDisplayValue('SUB-0001');
    await user.type(numberInput, 'X');
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

describe('SubscriptionEdit — Seats card (cluster-level pool, never "unlimited")', () => {
  it('always shows used/cap and warns when pending invites would exceed cap', async () => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    renderAt('/subscriptions/sub1/edit');

    expect(await screen.findByText('8 / 10')).toBeInTheDocument();
    expect(screen.queryByText(/unlimited/i)).toBeNull();
    expect(screen.queryByText(/ไม่จำกัด/)).toBeNull();
    // seat.used(8) + pending_invites(1) = 9, not > cap(10) — no overflow warning expected.
    expect(screen.getByText(/รอตอบรับ 1/)).toBeInTheDocument();
    expect(screen.queryByText(/อาจถึง/)).toBeNull();
  });
});

describe('SubscriptionEdit — cluster BU roster pagination (bounded, never perpage: -1)', () => {
  it('pages through businessUnitService.getAll with perpage: 100 until paginate.total is reached', async () => {
    const page1 = { data: Array.from({ length: 100 }, (_, i) => ({ id: `bu${i}`, code: `B${i}`, name: `BU ${i}`, is_active: true })), paginate: { total: 150, page: 1, perpage: 100 } };
    const page2 = { data: Array.from({ length: 50 }, (_, i) => ({ id: `bu${100 + i}`, code: `B${100 + i}`, name: `BU ${100 + i}`, is_active: true })), paginate: { total: 150, page: 2, perpage: 100 } };
    asMock(businessUnitService.getAll).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });

    renderAt('/subscriptions/sub1/edit');
    await screen.findByText('SUB-0001');

    await waitFor(() => expect(businessUnitService.getAll).toHaveBeenCalledTimes(2));
    expect(businessUnitService.getAll).toHaveBeenNthCalledWith(1, {
      page: 1,
      perpage: 100,
      advance: JSON.stringify({ where: { cluster_id: 'c1' } }),
    });
    expect(businessUnitService.getAll).toHaveBeenNthCalledWith(2, {
      page: 2,
      perpage: 100,
      advance: JSON.stringify({ where: { cluster_id: 'c1' } }),
    });
  });
});

describe('SubscriptionEdit — not found', () => {
  it('gates the whole shell behind a not-found state on a 404', async () => {
    asMock(subscriptionService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/subscriptions/nope/edit');

    expect(await screen.findByText('Subscription not found')).toBeInTheDocument();
    expect(screen.queryByText('ที่นั่ง')).toBeNull();
  });
});
