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
// (search/status-filter/device-filter/page/sort/perpage are all seeded from it).
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

// Mutable auth so a test can revoke application.create / application.update /
// application.delete. `Can` (the REAL component, not mocked here) reads this via
// useAuth() — mocking `Can` itself to always render its children would make every
// permission assertion below vacuous, exactly the defect this effort exists to close.
// `application.*` is platform-scoped (DEV_MOCK_EFFECTIVE_PERMISSIONS.platform,
// utils/permissions.ts:48) and none of the four `<Can>` call sites in
// ApplicationManagement.tsx pass a `clusterId` prop, so (like UserManagement/
// RoleManagement) there is no scoped-gate discrimination to prove here; ordinary
// permission-grant/revoke discrimination is what's tested below.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/applicationService', () => ({
  default: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), getApiCatalog: vi.fn() },
}));

import ApplicationManagement from './ApplicationManagement';
import applicationService from '../services/applicationService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleApp = {
  id: 'app1',
  name: 'Test App',
  description: 'A test application',
  is_active: true,
  allow_all: false,
  device: 'web',
  api_names: ['cluster.read'],
};

const listResponse = { data: [sampleApp], paginate: { total: 1, page: 1, perpage: 10 } };
const emptyResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };

interface GetAllParams { perpage?: number }

// ApplicationManagement's registry summary band (`ApplicationRegistrySummary`) independently
// calls `applicationService.getAll({ perpage: -1 })` on mount to roll up the whole unfiltered
// registry. Kept empty in every test so it never renders text that could collide with the
// table/empty-state assertions below (it renders only aggregate counts, not app names, but
// keeping it deterministic avoids any risk of an unrelated summary-band difference affecting
// button/role queries).
const summaryResponse = { data: [], paginate: { total: 0, page: 1, perpage: -1 } };

const setupGetAll = (mainResponse: typeof listResponse | typeof emptyResponse) => {
  asMock(applicationService.getAll).mockImplementation(async (params?: GetAllParams) =>
    params?.perpage === -1 ? summaryResponse : mainResponse,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  setupGetAll(listResponse);
  asMock(applicationService.delete).mockResolvedValue({});
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ApplicationManagement />
    </MemoryRouter>,
  );

// SECURITY. Four `<Can>` gates guard this page's write surfaces: the header "Add
// Application" button (application.create), the empty-state "Add Application" button
// (application.create — added by Wave 1), the row Edit menu item (application.update) and
// the row Delete menu item (application.delete). All four are platform-scoped (no
// `clusterId` prop passed to `<Can>` anywhere on this page — `application.*` only ever
// appears in DEV_MOCK_EFFECTIVE_PERMISSIONS.platform, never per-cluster). These tests must
// FAIL if a gate is deleted.
//
// The "App ID" column's copy-to-clipboard button (`handleCopyId` -> `navigator.clipboard
// .writeText`) is NOT a mutating control — it never calls `applicationService` and writes
// nothing to the backend — so it is intentionally ungated, matching the precedent for
// read-only affordances (CSV Export, filters, search) on every other Management page.
describe('ApplicationManagement — Add Application gates (application.create)', () => {
  it('hides the header Add Application button without application.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Test App');

    expect(screen.queryByRole('button', { name: /add application/i })).toBeNull();
  });

  it('shows the header Add Application button with application.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'application.create';
    renderPage();
    await screen.findByText('Test App');

    expect(screen.getByRole('button', { name: /add application/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Application button without application.create', async () => {
    setupGetAll(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    // Neither the header's nor the empty-state's Add Application button should render.
    expect(screen.queryByRole('button', { name: /add application/i })).toBeNull();
  });

  // Exact-count discrimination (fixes the Task 2/5 nit: `length > 0` is satisfied by the
  // header button alone, so it would NOT catch a typo'd/mis-scoped empty-state gate that
  // never renders — e.g. a permission string of "applications.create" that never matches).
  // With the list empty, BOTH the header Add Application button AND the empty-state Add
  // Application button render when application.create is granted, so this asserts exactly
  // 2 — proving the empty-state gate is independently satisfied, not just riding on the
  // header's real gate.
  it('shows both the header and empty-state Add Application buttons with application.create (discriminating control)', async () => {
    setupGetAll(emptyResponse);
    auth.hasPermission = (perm) => perm === 'application.create';
    renderPage();

    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /add application/i })).toHaveLength(2);
  });
});

describe('ApplicationManagement — row action gates (application.update / application.delete)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /actions for test app/i }));

  it('hides Edit and Delete without application.update / application.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Test App');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('shows Edit and Delete with full permissions (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'application.update' || perm === 'application.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Test App');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('gates Edit on application.update alone — Delete stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'application.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Test App');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('gates Delete on application.delete alone — Edit stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'application.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Test App');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
  });
});

// This page has no bulk row-selection / `selectionResetKey` wiring at all (no
// `enableRowSelection`, no checkbox column, no bulk action bar — verified by grep:
// `selectionResetKey`/`clearSelection`/`enableRowSelection` do not appear anywhere in
// ApplicationManagement.tsx). It is therefore NOT a consumer of the Task 1 `data-table.tsx`
// selection-reset fix, so no regression guard test is added here (matching the
// RoleManagement/ReportTemplateManagement precedent).

// The report-templates table treatment: content-based layout, single-line Name, and
// the description folded into the Name cell instead of its own column. (App ID stays
// its own column.)
describe('ApplicationManagement — report-templates-style table', () => {
  it('uses table-auto and single-lines the Name link', async () => {
    const { container } = renderPage();

    const link = await screen.findByRole('link', { name: 'Test App' });
    expect(container.querySelector('table')?.className).toContain('table-auto');
    expect(link.className).toContain('whitespace-nowrap');
    expect(link.className).not.toContain('truncate');
    expect(link.className).not.toContain('max-w-');
  });

  it('folds the description under the name and drops the Description column', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Test App' });
    expect(link.closest('td')).toHaveTextContent('A test application');
    expect(screen.queryByRole('columnheader', { name: /description/i })).toBeNull();
  });
});
