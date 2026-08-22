import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../../components/Layout', () => ({
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
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../../services/clusterService', () => ({
  default: { getAll: vi.fn() },
}));

vi.mock('../../services/subscriptionService', () => ({
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

import SubscriptionTable from './SubscriptionTable';
import subscriptionService from '../../services/subscriptionService';
import clusterService from '../../services/clusterService';

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
  bu_code: 'BU1',
  bu_name: 'Acme BU',
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
  asMock(clusterService.getAll).mockResolvedValue({
    data: [
      { id: 'c1', code: 'ACME', name: 'Acme Cluster', is_active: true },
      { id: 'c2', code: 'BETA', name: 'Beta Cluster', is_active: true },
    ],
    paginate: { total: 2, page: 1, perpage: 100 },
  });
});

const lastCall = () => asMock(subscriptionService.getAll).mock.calls.at(-1)?.[0];

const renderPage = () =>
  render(
    <MemoryRouter>
      <SubscriptionTable />
    </MemoryRouter>,
  );

describe('SubscriptionTable — reads state, never recomputes it', () => {
  it('shows the backend-supplied state badge, not one derived from status/end_date', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    // status='active' + a far-future end_date would recompute to 'active'; the real
    // state field says 'inactive' — the badge must follow the field, not the recompute.
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.queryByText('active')).toBeNull();
  });
});

describe('SubscriptionTable — summary band', () => {
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

describe('SubscriptionTable — Add Subscription gate (subscription.manage)', () => {
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

// Review B2#1: the row actions dropdown (Edit + Delete) was removed entirely. Delete is gone
// (the backend can never surface a soft-deleted subscription, so nobody could verify or undo
// it), and a single-item "Edit" dropdown would have just duplicated the already-clickable
// Subscription/Cluster links. This is a regression guard for both halves of that decision:
// no dropdown/menu exists, and the links it would have duplicated still reach the edit route
// on their own — for every caller regardless of permission, since the route itself only
// requires subscription.read (a read-only user must still be able to open it).
describe('SubscriptionTable — no row actions menu; links go straight to the edit route', () => {
  it('has no "Actions" trigger and no Delete anywhere on the row, even with subscription.manage', async () => {
    auth.hasPermission = () => true;
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.queryByRole('button', { name: /actions for/i })).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.queryByText(/^delete$/i)).toBeNull();
  });

  it('the Subscription number links straight to /licenses/subscriptions/:id/edit for a read-only user', async () => {
    auth.hasPermission = (perm) => perm === 'subscription.read';
    renderPage();

    const subLink = await screen.findByRole('link', { name: 'SUB-0001' });
    expect(subLink).toHaveAttribute('href', '/licenses/subscriptions/sub1/edit');
  });
});

// Review B2#4/#6: buildAdvance forces status=active and ignores any status the user picked
// once "Expiring soon" is on, so the UI must not leave a stale, silently-ineffective status
// selection visible — the toggle now disables the status buttons AND clears the selection.
describe('SubscriptionTable — "Expiring soon" locks and clears the status filter', () => {
  it('disables the status buttons, shows the lock message, and clears a status picked beforehand', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    const filtersButton = screen.getByRole('button', { name: /filters/i });
    await user.click(filtersButton);
    await user.click(await screen.findByRole('button', { name: /^active$/i }));

    // One real filter selected so far — the Filters button badge says so.
    expect(within(filtersButton).getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^active$/i })).not.toBeDisabled();

    await user.click(screen.getByLabelText(/expiring within 30 days/i));

    // The status buttons are now disabled and the lock message explains why — not just
    // silently ignored while still looking selectable.
    expect(screen.getByRole('button', { name: /^active$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^inactive$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^expired$/i })).toBeDisabled();
    expect(
      screen.getByText(/locked to active while showing subscriptions expiring soon/i),
    ).toBeInTheDocument();

    // Still exactly one filter shown — the previously-selected status was cleared, not just
    // visually disabled while continuing to count toward the badge.
    expect(within(filtersButton).getByText('1')).toBeInTheDocument();
    expect(within(filtersButton).queryByText('2')).toBeNull();

    // What's on screen must equal what's sent: the request the toggle triggered carries only
    // the forced active/expiring-soon clause, no leftover status:{in:...} from the earlier pick.
    await waitFor(() => {
      const lastCall = asMock(subscriptionService.getAll).mock.calls.at(-1)?.[0];
      const parsed = JSON.parse(lastCall.advance);
      expect(parsed.where.AND).toEqual([
        { status: 'active' },
        { end_date: { gte: expect.any(String), lte: expect.any(String) } },
      ]);
    });
  });
});

describe('SubscriptionTable — search folds into `advance`, never `search`', () => {
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

// Review I2: `end_date:desc` alone is not a total order, and spec §9 backfills every cluster a
// contract with the same far-future end_date — so on day one every row ties. Postgres is free
// to return tied rows in a different order per query, which makes rows repeat or vanish across
// pages with no error at all. `id` is the primary key, so it breaks every tie.
describe('SubscriptionTable — sort always carries a unique tiebreaker', () => {
  it('sends end_date:desc,id:asc on the first request', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    expect(lastCall().sort).toBe('end_date:desc,id:asc');
  });

  it('keeps the tiebreaker when the user sorts by a column header', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    // TanStack's 3-state cycle from the desc default: first click clears the sort (the page
    // substitutes DEFAULT_SORT rather than sending an empty one), the second flips to asc.
    await user.click(screen.getByRole('button', { name: /period/i }));
    await waitFor(() => expect(lastCall().sort).toBe('end_date:desc,id:asc'));

    await user.click(screen.getByRole('button', { name: /period/i }));
    await waitFor(() => expect(lastCall().sort).toBe('end_date:asc,id:asc'));
  });

  it('restores the default (never an empty sort) if a stored sort is blank', async () => {
    localStorage.setItem('sort_subscriptions', '');
    renderPage();
    await screen.findByText('SUB-0001');

    expect(lastCall().sort).toBe('end_date:desc,id:asc');
  });

  it('adds the tiebreaker to a stored sort saved before this fix', async () => {
    localStorage.setItem('sort_subscriptions', 'subscription_number:asc');
    renderPage();
    await screen.findByText('SUB-0001');

    expect(lastCall().sort).toBe('subscription_number:asc,id:asc');
  });
});

// Review I1: the filter sent raw `status`, while the badge and the summary cards both show
// `state`. Ticking Expired has to catch rows whose status is still 'active' but whose end_date
// has passed — those are exactly the rows the table labels "expired".
describe('SubscriptionTable — the State filter matches what the badge shows', () => {
  const openFilters = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /filters/i }));
  };

  it('translates Expired into status=expired OR (status=active AND end_date past)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await openFilters(user);
    await user.click(await screen.findByRole('button', { name: /^expired$/i }));

    await waitFor(() => {
      const parsed = JSON.parse(lastCall().advance);
      expect(parsed.where.AND).toEqual([
        {
          OR: [
            { OR: [{ status: 'expired' }, { status: 'active', end_date: { lt: expect.any(String) } }] },
          ],
        },
      ]);
    });
  });

  it('translates Active into status=active AND end_date not yet passed', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await openFilters(user);
    await user.click(await screen.findByRole('button', { name: /^active$/i }));

    await waitFor(() => {
      const parsed = JSON.parse(lastCall().advance);
      expect(parsed.where.AND).toEqual([
        { OR: [{ status: 'active', end_date: { gte: expect.any(String) } }] },
      ]);
    });
    // The raw-column form is gone for good.
    expect(lastCall().advance).not.toContain('"in"');
  });

  it('labels the filter "State", the same word the column header uses', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await openFilters(user);
    // Two on screen: the filter-sheet group label and the table column header.
    expect(await screen.findAllByText('State')).toHaveLength(2);
  });
});

// Review M3: spec §8.1 lists BU, Features, and a cluster filter. The values were already on
// every row (they even shipped in the CSV export) — just never rendered. The BU column now
// names the contract's single business unit instead of counting them: one contract = one BU.
describe('SubscriptionTable — BU and Features columns', () => {
  it('renders both column headers with the row values', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.getByText('Business Unit')).toBeInTheDocument();
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('BU1')).toBeInTheDocument();     // bu_code
    expect(screen.getByText('Acme BU')).toBeInTheDocument(); // bu_name
    expect(screen.getByText('5')).toBeInTheDocument();       // feature_count
  });

  it('does not offer sorting on either — they are backend aggregates, not columns (400)', async () => {
    renderPage();
    await screen.findByText('SUB-0001');

    expect(screen.queryByRole('button', { name: /^Business Unit$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Features$/ })).toBeNull();
  });
});

describe('SubscriptionTable — cluster filter', () => {
  it('sends cluster_id in advance and shows a removable badge', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.selectOptions(await screen.findByLabelText('Cluster'), 'c2');

    await waitFor(() => {
      const parsed = JSON.parse(lastCall().advance);
      expect(parsed.where.AND).toContainEqual({ cluster_id: 'c2' });
    });

    // Close the sheet before touching the badge behind it — Radix marks the rest of the page
    // aria-hidden while a modal sheet is open.
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'ล้างตัวกรอง cluster' }));
    await waitFor(() => expect(lastCall().advance).toBe(''));
  });

  it('lists every cluster the loader returned', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    const select = await screen.findByLabelText('Cluster');
    expect(within(select).getByRole('option', { name: 'ACME - Acme Cluster' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'BETA - Beta Cluster' })).toBeInTheDocument();
  });

  // Same reasoning as review C1: a request the user is not allowed to make is a request that
  // can bounce them out of the app, so it is not made at all — and the control it feeds goes
  // with it rather than sitting there empty.
  it('is hidden, and no cluster request is made, without cluster.read', async () => {
    auth.hasPermission = (perm) => perm.startsWith('subscription.');
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('SUB-0001');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    // The sheet is open (its State group rendered) — the Cluster control simply is not there.
    await screen.findByRole('button', { name: /^expired$/i });
    expect(screen.queryByLabelText('Cluster')).toBeNull();
    expect(clusterService.getAll).not.toHaveBeenCalled();
  });
});
