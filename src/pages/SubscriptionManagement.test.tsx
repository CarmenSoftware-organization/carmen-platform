import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown/sheet rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the page reads it on every render
// (search/status-filter/expiring-soon-filter/page/sort/perpage are all seeded from it).
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke subscription.manage. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself to always render its
// children would make every permission assertion below vacuous, exactly the defect this
// pattern exists to close. `subscription.*` is a platform-scoped permission (never
// per-cluster), and neither `<Can>` call site on this page passes a `clusterId` prop.
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

import SubscriptionManagement from './SubscriptionManagement';
import subscriptionService from '../services/subscriptionService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// `state` is deliberately inconsistent with what a naive client-side derivation from
// `status`/`end_date` would produce (status is 'active' and end_date is far in the
// future, which a recompute would read as 'active') — the page must show 'inactive'
// because it reads `state` straight off the row, never recomputing it.
const sampleSub = {
  id: 'sub1',
  cluster_id: 'c1',
  cluster_name: 'Acme Cluster',
  cluster_code: 'ACME',
  subscription_number: 'SUB-0001',
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2099-12-31T00:00:00.000Z',
  status: 'active',
  state: 'inactive',
  bu_count: 2,
  feature_count: 5,
  seat_used: 10,
  seat_cap: 20,
  doc_version: 1,
};

const summary = { total: 1, active: 0, expired: 0, expiring_soon: 0, deleted: 0 };

const listResponse = {
  data: [sampleSub],
  paginate: { total: 1, page: 1, perpage: 10, pages: 1 },
  summary,
};
const emptyResponse = {
  data: [],
  paginate: { total: 0, page: 1, perpage: 10, pages: 0 },
  summary: { total: 0, active: 0, expired: 0, expiring_soon: 0, deleted: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(subscriptionService.getAll).mockResolvedValue(listResponse);
  asMock(subscriptionService.delete).mockResolvedValue({});
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SubscriptionManagement />
    </MemoryRouter>,
  );

describe('SubscriptionManagement — reads state, never recomputes it', () => {
  it('shows the backend-supplied state badge, not one derived from status/end_date', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    // status='active' + a far-future end_date would recompute to 'active'; the real
    // state field says 'inactive' — the badge must follow the field, not the recompute.
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.queryByText('active')).toBeNull();
  });
});

describe('SubscriptionManagement — summary band', () => {
  it('renders all 5 cards (total/active/expired/expiring soon/deleted)', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.getByText('ทั้งหมด')).toBeInTheDocument();
    expect(screen.getByText('ใช้งาน')).toBeInTheDocument();
    expect(screen.getByText('หมดอายุ')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมดอายุ')).toBeInTheDocument();
    expect(screen.getByText('ลบแล้ว')).toBeInTheDocument();
  });
});

describe('SubscriptionManagement — Add Subscription gate (subscription.manage)', () => {
  it('hides the header Add Subscription button without subscription.manage', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.queryByRole('button', { name: /add subscription/i })).toBeNull();
  });

  it('shows the header Add Subscription button with subscription.manage (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.manage';
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.getByRole('button', { name: /add subscription/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Subscription button without subscription.manage', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No subscriptions yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add subscription/i })).toBeNull();
  });
});

describe('SubscriptionManagement — row action gate (Edit ungated, Delete needs subscription.manage)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /actions for sub-0001/i }));

  it('shows Edit but hides Delete for a read-only user (subscription.read only)', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await openRowMenu(user);

    // Edit is never gated on subscription.manage — the route itself only requires
    // subscription.read, so a read-only user must still be able to open it.
    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('shows both Edit and Delete with subscription.manage (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read' || perm === 'subscription.manage';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
  });
});

describe('SubscriptionManagement — search folds into `advance`, never `search`', () => {
  it('debounces the search box into paginate.advance as a subscription_number contains clause, and never sets paginate.search', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');
    asMock(subscriptionService.getAll).mockClear();

    await user.type(screen.getByPlaceholderText('ค้นหาเลขที่สัญญา'), 'SUB-9');

    // Real timers (no fake-timer precedent elsewhere in this repo, and userEvent + fake
    // timers is a known source of flakiness) — the debounce is 400ms, so give it room.
    await waitFor(
      () => expect(asMock(subscriptionService.getAll)).toHaveBeenCalled(),
      { timeout: 1000 },
    );
    const lastCall = asMock(subscriptionService.getAll).mock.calls.at(-1)?.[0];
    expect(lastCall.search).toBeUndefined();
    expect(JSON.parse(lastCall.advance)).toEqual({
      where: { AND: [{ subscription_number: { contains: 'SUB-9', mode: 'insensitive' } }] },
    });
  });
});
