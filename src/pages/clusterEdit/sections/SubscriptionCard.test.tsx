import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../../services/subscriptionService', () => ({
  default: { getAll: vi.fn() },
}));

// Mutable auth so a test can revoke subscription.manage. `Can` (the REAL component, not
// mocked here) reads this via useAuth() — mocking `Can` itself would make the permission
// test below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

import { SubscriptionCard } from './SubscriptionCard';
import subscriptionService from '../../../services/subscriptionService';
import type { Subscription } from '../../../types';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: 'sub1',
  cluster_id: 'c1',
  cluster_name: 'Acme Cluster',
  cluster_code: 'ACM',
  subscription_number: 'SUB-2026-001',
  start_date: '2026-01-01T12:00:00.000Z',
  end_date: '2026-12-31T12:00:00.000Z',
  status: 'active',
  state: 'active',
  bu_count: 2,
  feature_count: 3,
  seat_used: 8,
  seat_cap: 20,
  doc_version: 1,
  ...over,
});

const listResponse = (data: Subscription[]) => ({
  data,
  paginate: { total: data.length, page: 1, perpage: 5, pages: 1 },
});

// Renders the current location so a test can prove where a click actually navigated to,
// without depending on what the destination route renders (mirrors ClusterEdit.test.tsx).
const PathProbe: React.FC = () => {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}{location.search}</span>;
};

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/clusters/c1/edit']}>
      <PathProbe />
      <SubscriptionCard clusterId="c1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
});

describe('SubscriptionCard — query shape', () => {
  it('queries perpage 5, sort end_date:desc, and advance scoped to this cluster', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([]));
    renderCard();

    await waitFor(() => expect(subscriptionService.getAll).toHaveBeenCalledWith({
      perpage: 5,
      sort: 'end_date:desc',
      advance: JSON.stringify({ where: { cluster_id: 'c1' } }),
    }));
  });
});

describe('SubscriptionCard — has data', () => {
  it('shows the subscription number, backend state badge, expiry, and feature/BU/seat counts', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([sub()]));
    renderCard();

    expect(await screen.findByText('SUB-2026-001')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText(/Expires 2026-12-31/)).toBeInTheDocument();
    expect(screen.getByText(/3 features/)).toBeInTheDocument();
    expect(screen.getByText(/2 BUs/)).toBeInTheDocument();
    expect(screen.getByText(/8\/20 seats/)).toBeInTheDocument();
  });

  it('renders row state as-is from the backend, never recomputed (expired state on an "active" status row)', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(
      listResponse([sub({ status: 'active', state: 'expired' })]),
    );
    renderCard();

    expect(await screen.findByText('expired')).toBeInTheDocument();
  });

  it('navigates to the subscription edit route when "จัดการ →" is clicked', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([sub()]));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /จัดการ/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/subscriptions/sub1/edit');
  });
});

describe('SubscriptionCard — no data', () => {
  it('shows an empty state with a create-subscription action', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([]));
    renderCard();

    expect(await screen.findByText('ยังไม่มีสัญญา')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'สร้างสัญญา' })).toBeInTheDocument();
  });

  it('navigates to /subscriptions/new?cluster_id=c1 when the create button is clicked', async () => {
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([]));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'สร้างสัญญา' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/subscriptions/new?cluster_id=c1');
  });

  it('hides the create-subscription action without subscription.manage', async () => {
    // Read-only user: still loads and renders the card (subscription.read), but no create button.
    auth.hasPermission = (perm) => perm === 'subscription.read';
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([]));
    renderCard();

    expect(await screen.findByText('ยังไม่มีสัญญา')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'สร้างสัญญา' })).toBeNull();
  });
});

// Review C1: this card lives on /clusters/:id/edit, a page that shipped long before
// subscriptions existed. Without `subscription.read` the gateway answers 401 (AppIdGuard,
// not 403), which tokenRefresh.ts turns into clearSession() + a redirect to /login — the
// component's own `.catch` never gets the chance to stop it because the axios interceptor
// runs first. The only fix that works is not making the request at all.
describe('SubscriptionCard — no subscription.read', () => {
  it('never calls the service and renders nothing at all', async () => {
    auth.hasPermission = () => false;
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([sub()]));
    const { container } = renderCard();

    // Give any effect a chance to fire before asserting the negative.
    await waitFor(() => expect(screen.getByTestId('path')).toBeInTheDocument());
    expect(subscriptionService.getAll).not.toHaveBeenCalled();
    expect(screen.queryByText('Subscription')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('still loads for a user who has subscription.read but not subscription.manage', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read';
    asMock(subscriptionService.getAll).mockResolvedValue(listResponse([sub()]));
    renderCard();

    expect(await screen.findByText('SUB-2026-001')).toBeInTheDocument();
    expect(subscriptionService.getAll).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionCard — load failure is non-fatal', () => {
  it('renders nothing and does not throw when the fetch fails', async () => {
    asMock(subscriptionService.getAll).mockRejectedValue(new Error('network down'));
    renderCard();

    await waitFor(() => expect(subscriptionService.getAll).toHaveBeenCalled());
    // Settles out of the loading state without ever showing the card at all.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText('Subscription')).toBeNull();
    expect(screen.queryByText('ยังไม่มีสัญญา')).toBeNull();
  });
});
