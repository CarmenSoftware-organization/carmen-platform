import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { PlatformUserRow, PlatformUserRoleAssignment } from '../types';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; this page seeds search,
// role/scope/status filters, page, sort and perpage from it on the very first render.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    length: 0,
    key: () => null,
  };
};

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// `Can` (the REAL component, not mocked) reads permission through useAuth(). Default
// grants everything so Grant access / Revoke all render; individual tests may narrow it.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('../services/userPlatformService', () => ({
  default: { getAll: vi.fn(), assignBulk: vi.fn() },
}));
vi.mock('../services/userRoleService', () => ({
  default: { remove: vi.fn(), list: vi.fn(), add: vi.fn() },
}));
vi.mock('../services/roleService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/clusterService', () => ({ default: { getAll: vi.fn() } }));

// Real CSV generation writes through an anchor + object URL jsdom does not
// implement; the page's contract here is "one row per role assignment".
const csv = vi.hoisted(() => ({ generateCSV: vi.fn(() => 'csv-body'), downloadCSV: vi.fn() }));
vi.mock('../utils/csvExport', () => csv);

import UserPlatformManagement from './UserPlatformManagement';
import userPlatformService from '../services/userPlatformService';
import userRoleService from '../services/userRoleService';
import roleService from '../services/roleService';
import clusterService from '../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const platformRole: PlatformUserRoleAssignment = {
  id: 'ra-1',
  role_id: 'role-1',
  role_name: 'Support Admin',
  scope: { type: 'platform' },
  audit: { created: { at: '2026-08-01T10:00:00Z', name: 'Alice' } },
};

const clusterRole: PlatformUserRoleAssignment = {
  id: 'ra-2',
  role_id: 'role-2',
  role_name: 'Cluster Admin',
  scope: { type: 'cluster', cluster_id: 'cluster-1', cluster_name: 'Acme' },
  audit: { created: { at: '2026-07-15T09:00:00Z', name: 'Bob' } },
};

// jane holds a platform-wide role and has a full name — the "User" column prefers
// firstname+lastname over username. bob holds only a cluster-scoped role and has no
// name on file, so the column falls back to username.
const jane: PlatformUserRow = {
  user_id: 'u1',
  username: 'jane',
  email: 'jane@example.com',
  is_active: true,
  firstname: 'Jane',
  lastname: 'Doe',
  roles: [platformRole],
  last_granted_at: '2026-08-01T10:00:00Z',
};

const bob: PlatformUserRow = {
  user_id: 'u2',
  username: 'bob',
  email: 'bob@example.com',
  is_active: false,
  roles: [clusterRole],
  last_granted_at: '2026-07-15T09:00:00Z',
};

const listResponse = { data: [jane], paginate: { total: 1, page: 1, perpage: 10 } };
const roleOptionsResponse = {
  data: [
    { id: 'role-1', name: 'Support Admin' },
    { id: 'role-2', name: 'Cluster Admin' },
  ],
};
const clusterOptionsResponse = { data: [{ id: 'cluster-1', name: 'Acme' }] };

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserPlatformManagement />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(userPlatformService.getAll).mockResolvedValue(listResponse);
  asMock(userRoleService.remove).mockResolvedValue({});
  asMock(roleService.getAll).mockResolvedValue(roleOptionsResponse);
  asMock(clusterService.getAll).mockResolvedValue(clusterOptionsResponse);
});

describe('UserPlatformManagement — registry list', () => {
  it('renders a row per holder with a link into role management', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [jane, bob],
      paginate: { total: 2, page: 1, perpage: 10 },
    });
    renderPage();

    const janeLink = await screen.findByRole('link', { name: 'Jane Doe' });
    expect(janeLink).toHaveAttribute('href', '/platform/user-platform/u1');

    const bobLink = screen.getByRole('link', { name: 'bob' });
    expect(bobLink).toHaveAttribute('href', '/platform/user-platform/u2');
  });

  // The registry endpoint returns roles inline and paginate.total for the headline —
  // exactly one request per load. This is the whole point of the rebuild: pin it so a
  // future change can't silently reintroduce a per-row or perpage:-1 sweep.
  it('fetches the registry in exactly one request per load', async () => {
    renderPage();
    await screen.findByText('jane@example.com');

    expect(userPlatformService.getAll).toHaveBeenCalledTimes(1);
  });

  it('renders the scope rail differently for a platform-wide holder than a cluster-only holder', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [jane, bob],
      paginate: { total: 2, page: 1, perpage: 10 },
    });
    renderPage();

    const janeLink = await screen.findByRole('link', { name: 'Jane Doe' });
    const janeRail = janeLink.closest('.flex.items-stretch')?.querySelector('[aria-hidden="true"]');
    expect(janeRail?.className).toContain('bg-primary');

    const bobLink = screen.getByRole('link', { name: 'bob' });
    const bobRail = bobLink.closest('.flex.items-stretch')?.querySelector('[aria-hidden="true"]');
    expect(bobRail?.className).not.toContain('bg-primary');
    expect(bobRail?.className).toContain('border-border');
  });

  it('debounces the search before refetching, and persists the term', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');
    asMock(userPlatformService.getAll).mockClear();

    await user.type(screen.getByPlaceholderText('Search users...'), 'bob');

    // Not yet — the page waits 400ms after the last keystroke.
    expect(
      asMock(userPlatformService.getAll).mock.calls.filter((c) => c[0]?.search === 'bob'),
    ).toHaveLength(0);

    await waitFor(
      () =>
        expect(
          asMock(userPlatformService.getAll).mock.calls.some((c) => c[0]?.search === 'bob'),
        ).toBe(true),
      { timeout: 2000 },
    );
    expect(localStorage.getItem('search_user_platform')).toBe('bob');
  });

  it('persists perpage and page per-entity when pagination changes', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [jane],
      paginate: { total: 40, page: 1, perpage: 10 },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    // DataTable renders a desktop and a mobile pagination bar; jsdom applies no
    // CSS, so both are present. Either drives the same handler.
    await user.click(screen.getAllByRole('button', { name: 'Next page' })[0]);

    await waitFor(() => expect(localStorage.getItem('page_user_platform')).toBe('2'));
  });

  it('surfaces a list failure as an alert and a toast', async () => {
    asMock(userPlatformService.getAll).mockRejectedValue(new Error('down'));
    renderPage();

    // The summary band fails alongside the table here, so both alert regions are live;
    // assert on the table's specifically.
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((el) => /down/i.test(el.textContent ?? '')),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load platform users',
        expect.objectContaining({ description: 'down' }),
      ),
    );
  });
});

describe('UserPlatformManagement — registry-wide summary band', () => {
  // This is the integration point for the bug the whole task exists to fix: the band
  // must read `summary` off the response, not derive anything from the loaded `rows`.
  // jane (the only loaded row here) is active — a page-derived breakdown would report
  // zero inactive holders and hide exactly the finding an access review is looking for.
  it('renders the inactive warning from the response summary even though every loaded row is active', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [jane],
      paginate: { total: 25, page: 1, perpage: 10 },
      summary: { holders: 25, platform_wide: 9, cluster_only: 16, assignments: 41, inactive: 3 },
    });
    renderPage();

    await screen.findByText('jane@example.com');
    expect(
      await screen.findByRole('button', { name: /3 inactive holders still hold access/ }),
    ).toBeInTheDocument();
    // Scoped to the summary band itself — the table's own pagination footer ("Showing
    // 1-1 of 25") also contains "25", so an unscoped query would be ambiguous.
    const band = screen.getByText('holders').closest('[class*="rounded-lg"]') as HTMLElement;
    expect(band).not.toBeNull();
    expect(within(band).getByText('9')).toBeInTheDocument();
    expect(within(band).getByText('16')).toBeInTheDocument();
    expect(within(band).getByText('41')).toBeInTheDocument();
  });

  // Every request against today's backend omits `summary` (it ships in a later deploy).
  // The band must say so rather than showing a breakdown of zeros, which would read as
  // "no inactive holders" — a false negative in exactly the direction this page must not
  // get wrong.
  it('shows the summary as unavailable when the response omits it', async () => {
    renderPage();
    await screen.findByText('jane@example.com');

    expect(await screen.findByText(/registry summary isn.t available yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Platform-wide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
  });
});

describe('UserPlatformManagement — role/scope/status filters', () => {
  it('translates a single status filter into an advance where-clause and resets to page 1', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      const call = asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0];
      expect(JSON.parse(call.advance)).toEqual({ where: { is_active: false } });
      expect(call.page).toBe(1);
    });
    expect(JSON.parse(localStorage.getItem('status_filters_user_platform') as string)).toEqual([
      'false',
    ]);
  });

  it('drops the where-clause when both statuses are selected', async () => {
    // Selecting Active AND Inactive is the same as no status constraint at all.
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Inactive' }));

    await waitFor(() =>
      expect(asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0].advance).toBe(''),
    );
  });

  it('serializes a role filter into platform_role_id.in', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Support Admin' }));

    await waitFor(() => {
      const call = asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0];
      expect(JSON.parse(call.advance)).toEqual({ where: { platform_role_id: { in: ['role-1'] } } });
    });
  });

  // The endpoint selects platform-wide grants via a literal `cluster_id: null` — a naive
  // `if (scope)` truthiness guard would silently drop it since `scope` here is a non-empty
  // string ('platform'), so this pins the value survives JSON serialization intact.
  it('serializes platform-wide scope as cluster_id: null, not dropped', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.selectOptions(await screen.findByLabelText('Scope'), 'platform');

    await waitFor(() => {
      const call = asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0];
      const parsed = JSON.parse(call.advance);
      expect(parsed.where).toHaveProperty('cluster_id', null);
    });
  });

  it('serializes a specific cluster scope into cluster_id.in', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.selectOptions(await screen.findByLabelText('Scope'), 'cluster-1');

    await waitFor(() => {
      const call = asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0];
      expect(JSON.parse(call.advance)).toEqual({ where: { cluster_id: { in: ['cluster-1'] } } });
    });
  });

  it('combines role, scope and status filters into one advance where-clause', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Support Admin' }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'platform');
    await user.click(screen.getByRole('button', { name: 'Active' }));

    await waitFor(() => {
      const call = asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0];
      expect(JSON.parse(call.advance)).toEqual({
        where: { platform_role_id: { in: ['role-1'] }, cluster_id: null, is_active: true },
      });
    });
  });

  it('shows a removable filter badge and clears the filter on click', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Inactive' }));
    // The chip row lives outside the Sheet, in the main page — Radix marks
    // everything outside an open Sheet/Dialog aria-hidden, so close it first.
    await user.keyboard('{Escape}');

    const chipRow = (await screen.findByText('Filters:')).closest('div') as HTMLElement;
    expect(within(chipRow).getByText('Inactive')).toBeInTheDocument();

    asMock(userPlatformService.getAll).mockClear();
    // First button in the chip row is the badge's own remove (X) control.
    await user.click(within(chipRow).getAllByRole('button')[0]);

    await waitFor(() =>
      expect(asMock(userPlatformService.getAll).mock.calls.at(-1)?.[0].advance).toBe(''),
    );
  });
});

describe('UserPlatformManagement — empty state', () => {
  it('distinguishes "no one holds roles yet" from "nothing matched your search"', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [],
      paginate: { total: 0, page: 1, perpage: 10 },
    });
    renderPage();

    expect(await screen.findByText('No one holds platform roles yet')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search users...'), 'zzz');

    expect(await screen.findByText('No matches found')).toBeInTheDocument();
  });
});

describe('UserPlatformManagement — CSV export', () => {
  it('is disabled while there is nothing to export', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [],
      paginate: { total: 0, page: 1, perpage: 10 },
    });
    renderPage();

    await screen.findByText('No one holds platform roles yet');
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('exports one row per role assignment, not per user', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [{ ...jane, roles: [platformRole, clusterRole] }],
      paginate: { total: 1, page: 1, perpage: 10 },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(csv.generateCSV).toHaveBeenCalledWith(
      [
        expect.objectContaining({ username: 'jane', role: 'Support Admin', scope: 'Platform' }),
        expect.objectContaining({ username: 'jane', role: 'Cluster Admin', scope: 'Acme' }),
      ],
      expect.arrayContaining([expect.objectContaining({ key: 'role' })]),
    );
    expect(csv.downloadCSV).toHaveBeenCalledWith(
      'csv-body',
      expect.stringMatching(/^user-platform-\d{4}-\d{2}-\d{2}\.csv$/),
    );
    expect(toast.success).toHaveBeenCalledWith('Data exported successfully');
  });
});

describe('UserPlatformManagement — revoke all access', () => {
  const openRevokeConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /actions for jane/i }));
    await user.click(await screen.findByRole('menuitem', { name: /revoke all access/i }));
  };

  it('requires confirmation before revoking, then removes each role assignment', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [{ ...jane, roles: [platformRole, clusterRole] }],
      paginate: { total: 1, page: 1, perpage: 10 },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRevokeConfirm(user);

    expect(await screen.findByText(/remove all 2 role assignments from jane\?/i)).toBeInTheDocument();
    expect(userRoleService.remove).not.toHaveBeenCalled();

    asMock(userPlatformService.getAll).mockClear();
    await user.click(screen.getByRole('button', { name: 'Revoke all' }));

    await waitFor(() => {
      expect(userRoleService.remove).toHaveBeenCalledWith('u1', 'ra-1');
      expect(userRoleService.remove).toHaveBeenCalledWith('u1', 'ra-2');
    });
    expect(toast.success).toHaveBeenCalledWith('Access revoked');
    // A fully-revoked holder must drop out of the registry, so the page refetches.
    await waitFor(() => expect(userPlatformService.getAll).toHaveBeenCalled());
  });

  // There is no bulk-remove route on the backend — this is a sequential loop, and it
  // must report honestly which roles failed rather than claiming a blanket success.
  it('reports which roles failed rather than claiming a blanket success', async () => {
    asMock(userPlatformService.getAll).mockResolvedValue({
      data: [{ ...jane, roles: [platformRole, clusterRole] }],
      paginate: { total: 1, page: 1, perpage: 10 },
    });
    asMock(userRoleService.remove).mockImplementation((_userId: string, assignmentId: string) =>
      assignmentId === 'ra-2' ? Promise.reject(new Error('locked')) : Promise.resolve({}),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRevokeConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Revoke all' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Cluster Admin')),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

// SECURITY. Two <Can permission="user_platform.manage"> gates guard this page's write
// surfaces: the header Grant access button and the row menu's Revoke all access item.
// `Can` is the REAL component here (not mocked) — mocking it away would make these tests
// vacuous, which is exactly the pattern that let ~8 permission holes (2 of them P0) through
// in an earlier review wave on this codebase. Mirrors ClusterManagement.test.tsx.
describe('UserPlatformManagement — permission gates (user_platform.manage)', () => {
  it('hides Grant access and Revoke all access without user_platform.manage', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.queryByRole('button', { name: /grant access/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /actions for jane/i }));
    // Manage roles is ungated — only Revoke all access depends on the permission.
    expect(await screen.findByRole('menuitem', { name: /manage roles/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /revoke all access/i })).toBeNull();
  });

  // Discriminating control: grants only the exact permission string this page checks, so a
  // gate that lost its `permission` prop (and fell back to "always visible") or checked the
  // wrong string would still fail this test, not just a blanket `() => true`.
  it('shows Grant access and Revoke all access with user_platform.manage (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'user_platform.manage';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.getByRole('button', { name: /grant access/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /actions for jane/i }));
    expect(await screen.findByRole('menuitem', { name: /revoke all access/i })).toBeInTheDocument();
  });
});
