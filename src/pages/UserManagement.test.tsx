import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown/dialog rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

// Node 26 exposes bare `localStorage` as undefined; the page reads it on every render
// (search/status-filter/page/sort/perpage/showDeleted are all seeded from it).
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

// Mutable auth so a test can revoke user.create / user.update / user.delete, and
// flip isSuperAdmin (which separately gates row-selection + bulk delete). `Can` (the
// REAL component, not mocked here) reads this via useAuth() — mocking `Can` itself to
// always render its children would make every permission assertion below vacuous,
// exactly the defect this effort exists to close.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/userService', () => ({
  default: {
    getAll: vi.fn(),
    delete: vi.fn(),
    hardDelete: vi.fn(),
    fetchKeycloakUsers: vi.fn(),
  },
}));

import UserManagement from './UserManagement';
import userService from '../services/userService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleUser = {
  id: 'u1',
  user_id: 'u1',
  username: 'jane',
  email: 'jane@example.com',
  is_active: true,
  firstname: 'Jane',
  lastname: 'Doe',
};

const listResponse = { data: [sampleUser], paginate: { total: 1, page: 1, perpage: 10 } };
const emptyResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(userService.getAll).mockResolvedValue(listResponse);
  asMock(userService.delete).mockResolvedValue({});
  asMock(userService.hardDelete).mockResolvedValue({});
  asMock(userService.fetchKeycloakUsers).mockResolvedValue({});
});

// SECURITY. Five `<Can>` gates guard this page's write surfaces: the header Add User
// (user.create), the empty-state Add User (user.create), the row Edit (user.update),
// row Delete (user.delete) and row Hard Delete (user.delete). All five are platform-
// scoped (no `clusterId` prop passed to `<Can>` anywhere on this page — `user.*` only
// ever appears in `DEV_MOCK_EFFECTIVE_PERMISSIONS.platform`, never per-cluster), so
// unlike ClusterEdit/ClusterManagement there is no scoped-gate discrimination to prove
// here; ordinary permission-grant/revoke discrimination is what's tested below.
describe('UserManagement — Add User gates (user.create)', () => {
  it('hides the header Add User button without user.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
  });

  it('shows the header Add User button with user.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'user.create';
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add User button without user.create', async () => {
    asMock(userService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No users yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
  });

  it('shows the empty-state Add User button with user.create (discriminating control)', async () => {
    asMock(userService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = (perm) => perm === 'user.create';
    renderPage();

    expect(await screen.findByText('No users yet')).toBeInTheDocument();
    // Header + empty-state both render one; both are gated on user.create.
    expect(screen.getAllByRole('button', { name: /add user/i }).length).toBeGreaterThan(0);
  });
});

describe('UserManagement — row action gates (user.update / user.delete)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /actions for jane/i }));

  it('hides Edit, Delete and Hard Delete without user.update / user.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /hard delete/i })).toBeNull();
  });

  it('shows Edit, Delete and Hard Delete with full permissions (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'user.update' || perm === 'user.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /hard delete/i })).toBeInTheDocument();
  });

  it('gates Edit on user.update alone — Delete / Hard Delete stay hidden', async () => {
    auth.hasPermission = (perm) => perm === 'user.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /hard delete/i })).toBeNull();
  });

  it('gates Delete / Hard Delete on user.delete alone — Edit stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'user.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /hard delete/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
  });
});

// SECURITY FINDING (found by this task's audit — Step 1). "Fetch Keycloak" (header
// button, unconditionally rendered) calls `userService.fetchKeycloakUsers()` ->
// `POST /api-system/fetch-user`, which syncs/imports user records from the identity
// provider — a real mutation of the user directory. It previously had NO permission
// check at all: any user who could reach /users (route-gated on `user.read` only, see
// App.tsx:154) could trigger it regardless of holding user.create. Fixed by wrapping it
// in `<Can permission="user.create">`, matching the same permission the adjacent "Add
// User" button already uses (both bring new user records into the platform). This test
// is the failing-test-first proof for that fix — see task-2-report.md for the
// before/after run output.
describe('UserManagement — Fetch Keycloak sync is gated on user.create (SECURITY FINDING)', () => {
  it('hides Fetch Keycloak without user.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.queryByRole('button', { name: /fetch keycloak/i })).toBeNull();
  });

  it('shows Fetch Keycloak with user.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'user.create';
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.getByRole('button', { name: /fetch keycloak/i })).toBeInTheDocument();
  });
});

// Bulk row-selection (checkboxes, "N selected" bar, bulk Delete / bulk Hard Delete) is
// gated on `isSuperAdmin` — a plain JS conditional (`enableRowSelection={isSuperAdmin}`,
// `isSuperAdmin && selectedUsers.length > 0`), not a `<Can>` wrapper. This is not a
// weaker mechanism: `isSuperAdmin` comes from `effectivePermissions.is_super_admin`,
// and `checkPermission` short-circuits to `true` for every permission string once
// `is_super_admin` is set (see utils/permissions.ts:28) — so this gate is *strictly*
// more restrictive than `hasPermission('user.delete')` would be (it excludes any
// non-super-admin who happens to hold user.delete via a role grant), never less. There
// is no path to the bulk mutation without first passing this check, mirroring how
// NewsManagement's JS-conditional bulk gates were judged "not a gap" in Task 1.
describe('UserManagement — bulk row-selection actions are gated on isSuperAdmin', () => {
  it('renders no selection checkboxes for a non-super-admin (no path to bulk delete)', async () => {
    auth.isSuperAdmin = false;
    renderPage();
    await screen.findByText('jane@example.com');

    expect(screen.queryByRole('checkbox', { name: /select jane/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /select all/i })).toBeNull();
  });

  it('lets a super-admin select a row and reach bulk Delete / Hard Delete (discriminating control)', async () => {
    auth.isSuperAdmin = true;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    await user.click(screen.getByRole('checkbox', { name: /select jane/i }));

    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hard delete/i })).toBeInTheDocument();
  });
});

// EXTRA REQUIREMENT (regression guard for the Task 1 data-table.tsx fix). UserManagement
// is the only other consumer of `selectionResetKey` besides NewsManagement. This proves
// a genuine result-set change (here: a sort change, which is one of the effect's
// dependencies alongside page/perpage/search/advance — see UserManagement.tsx:331-333)
// actually clears both the parent's `selectedUsers` state (the "N selected" bar) AND
// DataTable's own internal TanStack `rowSelection` (the checkbox itself unchecks) — not
// just the former. If UserManagement stopped passing `selectionResetKey` into
// `<DataTable>` (or passed a value that never changes), the bar would still clear
// (clearSelection() sets `selectedUsers([])` directly) but the checkbox would stay
// visually checked — this test would catch that.
describe('UserManagement — row selection resets when the result set changes (data-table.tsx regression guard)', () => {
  beforeEach(() => {
    auth.isSuperAdmin = true;
  });

  it('clears row selection (bar + checkbox) when a sort change bumps selectionResetKey', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('jane@example.com');

    const checkbox = screen.getByRole('checkbox', { name: /select jane/i });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(await screen.findByText('1 selected')).toBeInTheDocument();

    // Sort by Username -> handleSortChange -> setPaginate({ ...prev, sort, page: 1 }) ->
    // the paginate-watching effect (deps include paginate.sort) calls clearSelection().
    await user.click(screen.getByRole('button', { name: /^username$/i }));

    await waitFor(() => expect(screen.queryByText('1 selected')).toBeNull());
    expect(screen.getByRole('checkbox', { name: /select jane/i })).not.toBeChecked();
  });
});

// Content-based layout with the identity frozen: Username single-line, and the
// leading columns pinned. Without row-selection that's # + avatar + username (3);
// super admins add the select column, so it's select + # + avatar + username (4).
describe('UserManagement — table fit-content & sticky', () => {
  it('uses table-auto, freezes three columns and a single-line Username (no selection)', async () => {
    const { container } = renderPage();
    await screen.findByText('jane');

    const table = container.querySelector('table');
    expect(table?.className).toContain('table-auto');
    expect(table?.className).toContain('table-sticky-left-3');
    expect(table?.className).not.toContain('table-sticky-left-4');

    const link = screen.getByRole('link', { name: 'jane' });
    expect(link.className).toContain('whitespace-nowrap');
    expect(link.className).not.toContain('truncate');
  });

  it('freezes a 4th column when super admins get the select column', async () => {
    auth.isSuperAdmin = true;
    const { container } = renderPage();
    await screen.findByText('jane');

    expect(container.querySelector('table')?.className).toContain('table-sticky-left-4');
  });
});
