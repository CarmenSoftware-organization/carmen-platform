import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
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
// (search/status-filter/page/sort/perpage are all seeded from it).
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

// Mutable auth so a test can revoke role.create / role.update / role.delete. `Can`
// (the REAL component, not mocked here) reads this via useAuth() — mocking `Can` itself
// to always render its children would make every permission assertion below vacuous,
// exactly the defect this effort exists to close. This is the *platform roles* page
// (`/platform/roles`, backed by the `platform_role` service via `roleService` ->
// `/api-system/platform/roles`) — NOT application roles. `role.*` is platform-scoped
// (DEV_MOCK_EFFECTIVE_PERMISSIONS.platform, utils/permissions.ts:51) and none of the
// four `<Can>` call sites in RoleManagement.tsx pass a `clusterId` prop, so (like
// UserManagement/ReportTemplateManagement) there is no scoped-gate discrimination to
// prove here; ordinary permission-grant/revoke discrimination is what's tested below.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/roleService', () => ({
  default: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import RoleManagement from './RoleManagement';
import roleService from '../services/roleService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleRole = {
  id: 'r1',
  name: 'Admin',
  description: 'Full platform access',
  is_active: true,
  permission_count: 12,
  created_at: '2025-02-01T00:00:00Z',
};

const listResponse = { data: [sampleRole], paginate: { total: 1, page: 1, perpage: 10 } };
const emptyResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };

interface GetAllParams { perpage?: number }

// RoleManagement's RBAC summary band (`RolesAccessSummary`) independently calls
// `roleService.getAll({ perpage: -1 })` on mount to roll up the whole unfiltered role
// set. Kept empty in every test so its "Broadest roles" panel never renders a second
// `sampleRole.name` node — an unrelated duplicate would make `findByText('Admin')` throw
// "found multiple elements" and has nothing to do with the permission gates under test.
const summaryResponse = { data: [], paginate: { total: 0, page: 1, perpage: -1 } };

const setupGetAll = (mainResponse: typeof listResponse | typeof emptyResponse) => {
  asMock(roleService.getAll).mockImplementation(async (params?: GetAllParams) =>
    params?.perpage === -1 ? summaryResponse : mainResponse,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  setupGetAll(listResponse);
  asMock(roleService.delete).mockResolvedValue({});
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <RoleManagement />
    </MemoryRouter>,
  );

// SECURITY. Four `<Can>` gates guard this page's write surfaces: the row Edit
// (role.update), the row Delete (role.delete), the header Add Role (role.create) and
// the empty-state Add Role (role.create). All four are platform-scoped (no `clusterId`
// prop passed to `<Can>` anywhere on this page — `role.*` only ever appears in
// DEV_MOCK_EFFECTIVE_PERMISSIONS.platform, never per-cluster). These tests must FAIL if
// a gate is deleted.
describe('RoleManagement — row action gates (role.update / role.delete)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /actions for admin/i }));

  it('hides Edit and Delete without role.update / role.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Admin');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('shows Edit and Delete with full permissions (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'role.update' || perm === 'role.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Admin');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('gates Edit on role.update alone — Delete stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'role.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Admin');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('gates Delete on role.delete alone — Edit stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'role.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Admin');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
  });
});

describe('RoleManagement — Add Role gates (role.create)', () => {
  it('hides the header Add Role button without role.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Admin');

    expect(screen.queryByRole('button', { name: /add role/i })).toBeNull();
  });

  it('shows the header Add Role button with role.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'role.create';
    renderPage();
    await screen.findByText('Admin');

    expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Role button without role.create', async () => {
    setupGetAll(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No roles yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add role/i })).toBeNull();
  });

  it('shows both the header and empty-state Add Role buttons with role.create (discriminating control)', async () => {
    setupGetAll(emptyResponse);
    auth.hasPermission = (perm) => perm === 'role.create';
    renderPage();

    expect(await screen.findByText('No roles yet')).toBeInTheDocument();
    // Exact-count discrimination (matches the ApplicationManagement pattern): with the list
    // forced empty, BOTH the header Add Role button AND the empty-state Add Role button
    // render when role.create is granted, so this asserts exactly 2 — proving the
    // empty-state gate is independently satisfied, not just riding on `length > 0`, which
    // the header button alone would already satisfy even if the empty-state gate were
    // broken (e.g. a typo'd permission string that never matches).
    expect(screen.getAllByRole('button', { name: /add role/i })).toHaveLength(2);
  });
});

// This page has no bulk row-selection / `selectionResetKey` wiring at all (no
// `enableRowSelection`, no checkbox column, no bulk action bar — verified by grep:
// `selectionResetKey`/`clearSelection`/`enableRowSelection` do not appear anywhere in
// RoleManagement.tsx). It is therefore NOT a consumer of the shared `data-table.tsx`
// `selectionResetKey` reset mechanism Task 1 fixed, so no regression guard test is
// added here (unlike NewsManagement/UserManagement).

// The report-templates table treatment: content-based layout, single-line Name, and
// the description folded into the Name cell instead of its own column.
describe('RoleManagement — report-templates-style table', () => {
  it('uses table-auto and single-lines the Name link', async () => {
    const { container } = renderPage();

    const link = await screen.findByRole('link', { name: 'Admin' });
    expect(container.querySelector('table')?.className).toContain('table-auto');
    expect(link.className).toContain('whitespace-nowrap');
    expect(link.className).not.toContain('truncate');
    expect(link.className).not.toContain('max-w-');
  });

  it('folds the description under the name and drops the Description column', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Admin' });
    expect(link.closest('td')).toHaveTextContent('Full platform access');
    expect(screen.queryByRole('columnheader', { name: /description/i })).toBeNull();
  });
});
