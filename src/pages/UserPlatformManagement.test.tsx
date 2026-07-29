import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; this page seeds search,
// status filters, page, sort and perpage from it on the very first render.
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

vi.mock('../services/userService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/userRoleService', () => ({ default: { list: vi.fn() } }));

// Real CSV generation writes through an anchor + object URL jsdom does not
// implement; the page's contract here is "builds a row per visible user".
const csv = vi.hoisted(() => ({ generateCSV: vi.fn(() => 'csv-body'), downloadCSV: vi.fn() }));
vi.mock('../utils/csvExport', () => csv);

import UserPlatformManagement from './UserPlatformManagement';
import { summarizeUserPlatform } from './userPlatformManagement/PlatformAccessSummary';
import userService from '../services/userService';
import userRoleService from '../services/userRoleService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const user1 = {
  id: 'u1',
  username: 'jane',
  email: 'jane@example.com',
  is_active: true,
  firstname: 'Jane',
  lastname: 'Doe',
};
const user2 = { id: 'u2', username: 'bob', email: 'bob@example.com', is_active: false, name: 'Bob' };

const listResponse = { data: [user1], paginate: { total: 1, page: 1, perpage: 10 } };

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserPlatformManagement />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  asMock(userService.getAll).mockResolvedValue(listResponse);
  asMock(userRoleService.list).mockResolvedValue([]);
});

// The role-count column is the reason this page exists: it is a privilege audit.
// A failed fetch must never be displayed as "0 roles" — that would report an
// admin as harmless. These tests pin the three-way distinction.
describe('UserPlatformManagement — the role-count column is tri-state', () => {
  it('shows a spinner, not a zero, while a row\'s role count is still in flight', async () => {
    asMock(userRoleService.list).mockReturnValue(new Promise(() => {})); // never settles
    const { container } = renderPage();

    await screen.findByText('jane@example.com');

    expect(container.querySelectorAll('.animate-spin').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Couldn't load roles")).toBeNull();
  });

  it('renders the resolved count as a badge', async () => {
    asMock(userRoleService.list).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    renderPage();

    await screen.findByText('jane@example.com');

    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText("Couldn't load roles")).toBeNull();
  });

  it('marks a failed row as unknown rather than zero', async () => {
    asMock(userRoleService.list).mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('jane@example.com');

    expect(await screen.findByLabelText("Couldn't load roles")).toBeInTheDocument();
  });

  it('warns once, with a count, when role fetches fail', async () => {
    asMock(userService.getAll).mockResolvedValue({
      data: [user1, user2],
      paginate: { total: 2, page: 1, perpage: 10 },
    });
    asMock(userRoleService.list).mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('jane@example.com');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't load role counts for 2 users"),
      ),
    );
  });

  it('pluralises the failure warning for a single user', async () => {
    asMock(userRoleService.list).mockRejectedValue(new Error('offline'));
    renderPage();

    await screen.findByText('jane@example.com');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't load role counts for 1 user."),
      ),
    );
  });
});

// summarizeUserPlatform is the governance roll-up behind the header band. It is
// pure, so the counting rules are pinned directly.
describe('summarizeUserPlatform — governance roll-up', () => {
  it('splits users by status and by whether they hold any platform role', () => {
    const result = summarizeUserPlatform(
      [
        { id: 'a', is_active: true },
        { id: 'b', is_active: true },
        { id: 'c', is_active: false },
      ],
      { a: 2, b: 0, c: 1 },
    );

    expect(result).toEqual({
      total: 3,
      active: 2,
      inactive: 1,
      privileged: 2,
      unprivileged: 1,
      unknown: 0,
      assignments: 3,
    });
  });

  it('quarantines failed lookups as unknown instead of counting them as unprivileged', () => {
    const result = summarizeUserPlatform(
      [
        { id: 'a', is_active: true },
        { id: 'b', is_active: true },
      ],
      { a: 3, b: 'error' },
    );

    expect(result.privileged).toBe(1);
    expect(result.unknown).toBe(1);
    expect(result.unprivileged).toBe(0);
    // The failed user contributes no assignments — an unknown count is not zero.
    expect(result.assignments).toBe(3);
  });

  it('treats a user missing from the map as having no roles', () => {
    const result = summarizeUserPlatform([{ id: 'a', is_active: true }], {});

    expect(result).toMatchObject({ privileged: 0, unprivileged: 1, unknown: 0, assignments: 0 });
  });

  it('returns an all-zero roll-up for an empty estate', () => {
    expect(summarizeUserPlatform([], {})).toEqual({
      total: 0,
      active: 0,
      inactive: 0,
      privileged: 0,
      unprivileged: 0,
      unknown: 0,
      assignments: 0,
    });
  });
});

describe('UserPlatformManagement — summary band', () => {
  it('rolls up the whole estate, ignoring the table\'s pagination', async () => {
    // The band asks for every user (perpage: -1) while the table asks for a page.
    renderPage();

    await waitFor(() =>
      expect(asMock(userService.getAll).mock.calls.some((c) => c[0]?.perpage === -1)).toBe(true),
    );
  });

  it('offers a retry when the roll-up fails, leaving the table usable', async () => {
    asMock(userService.getAll).mockImplementation((params: { perpage?: number }) =>
      params?.perpage === -1 ? Promise.reject(new Error('nope')) : Promise.resolve(listResponse),
    );
    renderPage();

    expect(
      await screen.findByText("Couldn't load the platform access summary."),
    ).toBeInTheDocument();
    // The table is independent of the band and still rendered its row.
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('retries the roll-up on demand', async () => {
    asMock(userService.getAll).mockImplementation((params: { perpage?: number }) =>
      params?.perpage === -1 ? Promise.reject(new Error('nope')) : Promise.resolve(listResponse),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Couldn't load the platform access summary.");

    asMock(userService.getAll).mockResolvedValue(listResponse);
    await user.click(screen.getByRole('button', { name: /retry|try again/i }));

    await waitFor(() =>
      expect(screen.queryByText("Couldn't load the platform access summary.")).toBeNull(),
    );
  });
});

describe('UserPlatformManagement — list, search and filters', () => {
  it('renders a row per user with a link into role management', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'jane' });
    expect(link).toHaveAttribute('href', '/platform/user-platform/u1');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('debounces the search before refetching, and persists the term', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');
    asMock(userService.getAll).mockClear();

    await user.type(screen.getByPlaceholderText('Search users...'), 'bob');

    // Not yet — the page waits 400ms after the last keystroke.
    expect(
      asMock(userService.getAll).mock.calls.filter((c) => c[0]?.search === 'bob'),
    ).toHaveLength(0);

    await waitFor(
      () =>
        expect(
          asMock(userService.getAll).mock.calls.some((c) => c[0]?.search === 'bob'),
        ).toBe(true),
      { timeout: 2000 },
    );
    expect(localStorage.getItem('search_user_platform')).toBe('bob');
  });

  it('translates a single status filter into an advance where-clause and resets to page 1', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /filters/i }));
    await user.click(await screen.findByRole('button', { name: 'Inactive' }));

    await waitFor(() => {
      const call = asMock(userService.getAll).mock.calls.at(-1)?.[0];
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
      expect(asMock(userService.getAll).mock.calls.at(-1)?.[0].advance).toBe(''),
    );
  });

  it('distinguishes "no users yet" from "nothing matched your search"', async () => {
    asMock(userService.getAll).mockResolvedValue({
      data: [],
      paginate: { total: 0, page: 1, perpage: 10 },
    });
    renderPage();

    expect(await screen.findByText('No users found')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search users...'), 'zzz');

    expect(await screen.findByText('No matches found')).toBeInTheDocument();
  });

  it('surfaces a list failure as an alert and a toast', async () => {
    asMock(userService.getAll).mockRejectedValue(new Error('down'));
    renderPage();

    // The band fails alongside the table here, so both alert regions are live;
    // assert on the table's specifically.
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((el) => /failed to load users/i.test(el.textContent ?? '')),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to load users')),
    );
  });

  it('persists perpage and page per-entity when pagination changes', async () => {
    asMock(userService.getAll).mockResolvedValue({
      data: [user1],
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
});

describe('UserPlatformManagement — CSV export', () => {
  it('is disabled while there is nothing to export', async () => {
    asMock(userService.getAll).mockResolvedValue({
      data: [],
      paginate: { total: 0, page: 1, perpage: 10 },
    });
    renderPage();

    await screen.findByText('No users found');
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('exports the visible users with a dated filename', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('button', { name: /export/i }));

    expect(csv.generateCSV).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'u1' })],
      expect.arrayContaining([expect.objectContaining({ key: 'username' })]),
    );
    expect(csv.downloadCSV).toHaveBeenCalledWith(
      'csv-body',
      expect.stringMatching(/^user-platform-\d{4}-\d{2}-\d{2}\.csv$/),
    );
    expect(toast.success).toHaveBeenCalledWith('Data exported successfully');
  });
});
