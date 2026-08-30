import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke subscription.manage. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself would make every permission
// assertion below vacuous. `subscription.*` is a platform-scoped permission (no clusterId).
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../../services/subscriptionService', () => ({
  default: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setFeatures: vi.fn(),
    setGroups: vi.fn(),
    delete: vi.fn(),
    getFeatureCatalog: vi.fn(),
  },
}));
// หน้าขายเลือก "กลุ่ม" แล้ว ไม่ใช่ติ๊ก feature ทีละตัว — GroupSelectionCard ดึงรายการกลุ่มเอง
vi.mock('../../services/licenseFeatureGroupService', () => ({
  default: { getAll: vi.fn(), getById: vi.fn() },
}));
vi.mock('../../services/businessUnitService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../../services/clusterService', () => ({
  default: { getAll: vi.fn() },
}));

import SubscriptionForm from './SubscriptionForm';
import subscriptionService from '../../services/subscriptionService';
import licenseFeatureGroupService from '../../services/licenseFeatureGroupService';
import businessUnitService from '../../services/businessUnitService';
import clusterService from '../../services/clusterService';
import type { SubscriptionDetail } from '../../types';

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
  bu: {
    business_unit_id: 'bu1',
    bu_code: 'BU1',
    bu_name: 'Acme BU',
    feature_keys: [],
    group_ids: [],
    groups: [],
    licensed_users: 10,
  },
};

const emptyBuList = { data: [], paginate: { total: 0, page: 1, perpage: 100 } };

/** BU roster of `c1` — the picker's options in create mode. */
const buList = {
  data: [
    { id: 'bu1', code: 'BU1', name: 'Acme BU', is_active: true },
    { id: 'bu2', code: 'BU2', name: 'Beta BU', is_active: true },
  ],
  paginate: { total: 2, page: 1, perpage: 100 },
};

/** Smallest catalog that still has a module + one child, for the feature accordion. */
const catalog = [
  { key: 'procurement', parent_key: null, label: 'Procurement', description: null, sort_order: 0 },
  {
    key: 'procurement.purchase_request',
    parent_key: 'procurement',
    label: 'Purchase Request',
    description: null,
    sort_order: 0,
  },
];
const emptyClusterList = { data: [], paginate: { total: 0, page: 1, perpage: 200 } };

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/licenses/subscriptions/new" element={<SubscriptionForm />} />
        <Route path="/licenses/subscriptions/:id/edit" element={<SubscriptionForm />} />
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
  // FeatureSelectionCard fetches its own catalog on mount whenever an existing subscription
  // renders — every test below that reaches that section needs this resolved, or the card's
  // own catalogFailed state would fire here and swallow unrelated assertions.
  asMock(subscriptionService.getFeatureCatalog).mockResolvedValue({ data: catalog });
});

describe('SubscriptionForm — create mode reads cluster_id from the query param', () => {
  it('prefills the cluster picker from ?cluster_id=', async () => {
    asMock(clusterService.getAll).mockResolvedValue({
      data: [
        { id: 'c1', code: 'CLS1', name: 'Acme Cluster', is_active: true },
        { id: 'c2', code: 'CLS2', name: 'Beta Cluster', is_active: true },
      ],
      paginate: { total: 2, page: 1, perpage: 200 },
    });
    renderAt('/licenses/subscriptions/new?cluster_id=c1');

    const select = (await screen.findByLabelText(/cluster/i)) as HTMLSelectElement;
    expect(select.value).toBe('c1');
  });
});

describe('SubscriptionForm — create sends only the allowed fields', () => {
  it('POSTs cluster_id/business_unit_id/start_date/end_date/status only — never a subscription_number (the server issues it)', async () => {
    asMock(businessUnitService.getAll).mockResolvedValue(buList);
    asMock(subscriptionService.create).mockResolvedValue({ data: { id: 'new1' } });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/new?cluster_id=c1');

    await user.selectOptions(await screen.findByLabelText(/business unit/i), 'bu1');
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-12-31' } });

    await user.click(screen.getByRole('button', { name: /create subscription/i }));

    await waitFor(() => expect(subscriptionService.create).toHaveBeenCalledTimes(1));
    expect(subscriptionService.create).toHaveBeenCalledWith({
      cluster_id: 'c1',
      business_unit_id: 'bu1',
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-12-31T00:00:00.000Z',
      status: 'active',
    });
  });

  it('blocks submit and never calls the API when no business unit is picked', async () => {
    asMock(businessUnitService.getAll).mockResolvedValue(buList);
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/new?cluster_id=c1');

    await screen.findByLabelText(/business unit/i);
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-12-31' } });

    await user.click(screen.getByRole('button', { name: /create subscription/i }));

    expect(await screen.findByText(/business unit is required/i)).toBeInTheDocument();
    expect(subscriptionService.create).not.toHaveBeenCalled();
  });

  it('blocks submit and never calls the API when end_date is not after start_date', async () => {
    asMock(businessUnitService.getAll).mockResolvedValue(buList);
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/new?cluster_id=c1');

    await user.selectOptions(await screen.findByLabelText(/business unit/i), 'bu1');
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-01-01' } });

    await user.click(screen.getByRole('button', { name: /create subscription/i }));

    expect(await screen.findByText(/end date must be after start date/i)).toBeInTheDocument();
    expect(subscriptionService.create).not.toHaveBeenCalled();
  });
});

describe('SubscriptionForm — update sends doc_version plus only the allowed fields', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
  });

  it('PATCHes with doc_version always present, and never a subscription_number or business_unit_id (both immutable)', async () => {
    asMock(subscriptionService.update).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await user.selectOptions(await screen.findByLabelText(/^status$/i), 'inactive');

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.update).toHaveBeenCalledTimes(1));
    expect(subscriptionService.update).toHaveBeenCalledWith('sub1', {
      doc_version: 3,
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: '2026-12-31T00:00:00.000Z',
      status: 'inactive',
    });
  });
});

describe('SubscriptionForm — Save persists GroupSelectionCard edits too', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    asMock(businessUnitService.getAll).mockResolvedValue(buList);
    asMock(licenseFeatureGroupService.getAll).mockResolvedValue({
      data: [
        {
          id: 'grp1',
          code: 'FULL',
          name: 'Full Access',
          description: null,
          sort_order: 0,
          is_active: true,
          feature_count: 75,
          subscription_count: 14,
          doc_version: 0,
        },
      ],
      paginate: { total: 1, page: 1, perpage: 200, pages: 1 },
    });
  });

  /** ติ๊กกลุ่ม FULL ใน GroupSelectionCard — หน้าขายเลือกเป็นกลุ่มแล้ว ไม่ใช่ feature ทีละตัว */
  async function tickFullGroup(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('checkbox', { name: 'Full Access' }));
  }

  it('groups-only change: calls setGroups with the id list + current doc_version, never touches update', async () => {
    asMock(subscriptionService.setGroups).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await screen.findByRole('heading', { name: 'SUB-0001' });
    await tickFullGroup(user);

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.setGroups).toHaveBeenCalledTimes(1));
    expect(subscriptionService.setGroups).toHaveBeenCalledWith('sub1', ['grp1'], 3);
    expect(subscriptionService.update).not.toHaveBeenCalled();
    // setFeatures ไม่ถูกเรียกอีกแล้วจากหน้านี้ — การขายผูกกลุ่ม ไม่ได้ตั้ง feature ตรง ๆ
    expect(subscriptionService.setFeatures).not.toHaveBeenCalled();
  });

  it('both changed: PATCHes first, then calls setGroups with the doc_version the PATCH response returned', async () => {
    asMock(subscriptionService.update).mockResolvedValue({
      data: { ...sampleDetail, subscription_number: 'SUB-0002', doc_version: 4 },
    });
    asMock(subscriptionService.setGroups).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await screen.findByRole('heading', { name: 'SUB-0001' });
    await user.selectOptions(await screen.findByLabelText(/^status$/i), 'inactive');
    await tickFullGroup(user);

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.setGroups).toHaveBeenCalledTimes(1));
    expect(subscriptionService.update).toHaveBeenCalledTimes(1);
    // The bumped doc_version (4) from update()'s own response, not the stale value (3) this
    // page loaded with — calling setGroups with 3 here would 409 against the PATCH that just
    // ran in the same save.
    expect(subscriptionService.setGroups).toHaveBeenCalledWith('sub1', ['grp1'], 4);
  });

  it('no group change: Save never calls setGroups at all', async () => {
    asMock(subscriptionService.update).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await user.selectOptions(await screen.findByLabelText(/^status$/i), 'inactive');
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(subscriptionService.update).toHaveBeenCalledTimes(1));
    expect(subscriptionService.setGroups).not.toHaveBeenCalled();
  });
});

// เคส "เลขสัญญาซ้ำ" ถูกลบทิ้งพร้อมช่องกรอกเลข — ระบบออกเลขให้เอง (`SUB-YYMM-####`) และการชนกัน
// ถูกจับที่ฐาน (`subscription_number_global_u`) แล้ว retry ในเซิร์ฟเวอร์ ไม่เคยโผล่มาถึงหน้าจอ
// 409 ที่หน้านี้ยังเจอได้จึงเหลือความหมายเดียว: doc_version ชนกัน
describe('SubscriptionForm — 409 is always a version conflict now', () => {
  beforeEach(() => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
  });

  it('a version-conflict 409 notifies + refetches', async () => {
    asMock(subscriptionService.update).mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Record was modified by another request (model=Subscription, expected doc_version=3).' } },
    });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await user.selectOptions(await screen.findByLabelText(/^status$/i), 'inactive');
    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // Refetch happened: getById called again (initial load + the post-conflict refetch).
    await waitFor(() => expect(subscriptionService.getById).toHaveBeenCalledTimes(2));
  });
});

describe('SubscriptionForm — permission gating', () => {
  it('a subscription.read-only user can open an existing subscription but sees no Save button', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read';
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    renderAt('/licenses/subscriptions/sub1/edit');

    expect(await screen.findByRole('heading', { name: 'SUB-0001' })).toBeInTheDocument();
    // Fields render read-only (no inputs), and nothing to save means no bottom bar at all.
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
    expect(screen.queryByLabelText(/^status$/i)).toBeNull();
  });

  it('a subscription.manage user sees editable fields and, once changed, a Save button', async () => {
    auth.hasPermission = () => true;
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });
    const user = userEvent.setup();
    renderAt('/licenses/subscriptions/sub1/edit');

    await user.selectOptions(await screen.findByLabelText(/^status$/i), 'inactive');
    expect(await screen.findByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

// เดิมมี describe 'Seats card' ตรงนี้ ทดสอบว่าหน้าแสดง used/cap และเตือนเมื่อ pending invites
// จะล้น cap — ถูกลบพร้อม section 'Seats' ที่ถอดออกจากหน้าแก้สัญญา ตรรกะที่มันทดสอบยังอยู่ครบใน
// SeatsCard.test.tsx (component ยังไม่ถูกลบ ยังใช้ที่ License Center)

describe('SubscriptionForm — cluster BU roster pagination (bounded, never perpage: -1)', () => {
  it('pages through businessUnitService.getAll with perpage: 100 until paginate.total is reached', async () => {
    const page1 = { data: Array.from({ length: 100 }, (_, i) => ({ id: `bu${i}`, code: `B${i}`, name: `BU ${i}`, is_active: true })), paginate: { total: 150, page: 1, perpage: 100 } };
    const page2 = { data: Array.from({ length: 50 }, (_, i) => ({ id: `bu${100 + i}`, code: `B${100 + i}`, name: `BU ${100 + i}`, is_active: true })), paginate: { total: 150, page: 2, perpage: 100 } };
    asMock(businessUnitService.getAll).mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });

    renderAt('/licenses/subscriptions/sub1/edit');
    await screen.findByRole('heading', { name: 'SUB-0001' });

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

describe('SubscriptionForm — not found', () => {
  it('gates the whole shell behind a not-found state on a 404', async () => {
    asMock(subscriptionService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/licenses/subscriptions/nope/edit');

    expect(await screen.findByText('Subscription not found')).toBeInTheDocument();
    expect(screen.queryByText('Seats')).toBeNull();
  });
});

// Review M7: the picker used a flat `perpage: 200`, so cluster #201 was simply unreachable —
// no error, no hint, while the BU roster in this very same file already paged properly. Both
// now go through `fetchAllPages`.
describe('SubscriptionForm — the cluster picker is paged, not capped', () => {
  it('keeps fetching pages until paginate.total is covered', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `c${i}`, code: `C${i}`, name: `Cluster ${i}`, is_active: true,
    }));
    const page2 = [{ id: 'c201', code: 'C201', name: 'Cluster 201', is_active: true }];
    asMock(clusterService.getAll).mockImplementation(async ({ page }: { page: number }) => ({
      data: page === 1 ? page1 : page2,
      paginate: { total: 101, page, perpage: 100 },
    }));

    renderAt('/licenses/subscriptions/new');

    const select = (await screen.findByLabelText(/cluster/i)) as HTMLSelectElement;
    // The 101st cluster is selectable — under the old flat request it never arrived.
    await waitFor(() =>
      expect(within(select).getByRole('option', { name: 'C201 - Cluster 201' })).toBeInTheDocument(),
    );
    expect(clusterService.getAll).toHaveBeenCalledTimes(2);
    expect(asMock(clusterService.getAll).mock.calls[0][0]).toEqual({ page: 1, perpage: 100, sort: 'name:asc' });
    expect(asMock(clusterService.getAll).mock.calls[1][0]).toEqual({ page: 2, perpage: 100, sort: 'name:asc' });
  });

  it('says why the picker is empty when the cluster list fails to load', async () => {
    asMock(clusterService.getAll).mockRejectedValue(new Error('network down'));

    renderAt('/licenses/subscriptions/new');

    expect(await screen.findByText(/โหลดรายชื่อ cluster ไม่สำเร็จ/)).toBeInTheDocument();
  });

  it('does not fetch clusters at all when editing an existing subscription', async () => {
    asMock(subscriptionService.getById).mockResolvedValue({ data: sampleDetail });

    renderAt('/licenses/subscriptions/sub1/edit');

    await screen.findByRole('heading', { name: 'SUB-0001' });
    expect(clusterService.getAll).not.toHaveBeenCalled();
  });
});
