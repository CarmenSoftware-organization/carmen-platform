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
// (search/status-filter/source-type-filter/page/sort/perpage are all seeded from it).
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

// Mutable auth so a test can revoke report_template.create / update / delete. `Can`
// (the REAL component, not mocked here) reads this via useAuth() — mocking `Can` itself
// to always render its children would make every permission assertion below vacuous,
// exactly the defect this effort exists to close. report_template.* is platform-scoped
// (DEV_MOCK_EFFECTIVE_PERMISSIONS.platform, utils/permissions.ts:46) and none of the
// four `<Can>` call sites in ReportTemplateManagement.tsx pass a `clusterId` prop, so
// (like UserManagement) there is no scoped-gate discrimination to prove here; ordinary
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

vi.mock('../services/reportTemplateService', () => ({
  default: { getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listDbObjects: vi.fn() },
}));

import ReportTemplateManagement from './ReportTemplateManagement';
import reportTemplateService from '../services/reportTemplateService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const sampleTemplate = {
  id: 't1',
  name: 'Sales Summary',
  description: 'Monthly sales summary report',
  report_group: 'Sales',
  template_type: 'list' as const,
  dialog: '<Dialog/>',
  content: '<Content/>',
  is_standard: true,
  is_active: true,
  source_type: 'view' as const,
  source_name: 'v_sales_summary',
  created_at: '2025-02-01T00:00:00Z',
};

const listResponse = { data: [sampleTemplate], paginate: { total: 1, page: 1, perpage: 10 } };
const emptyResponse = { data: [], paginate: { total: 0, page: 1, perpage: 10 } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(reportTemplateService.getAll).mockResolvedValue(listResponse);
  asMock(reportTemplateService.delete).mockResolvedValue({});
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportTemplateManagement />
    </MemoryRouter>,
  );

// SECURITY. Four `<Can>` gates guard this page's write surfaces: the row Edit
// (report_template.update), the row Delete (report_template.delete), the header
// Add Template (report_template.create) and the empty-state Add Template
// (report_template.create). All four are platform-scoped (no `clusterId` prop passed
// to `<Can>` anywhere on this page — `report_template.*` only ever appears in
// DEV_MOCK_EFFECTIVE_PERMISSIONS.platform, never per-cluster). These tests must FAIL
// if a gate is deleted.
describe('ReportTemplateManagement — row action gates (report_template.update / report_template.delete)', () => {
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /actions for sales summary/i }));

  it('hides Edit and Delete without report_template.update / report_template.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sales Summary');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('shows Edit and Delete with full permissions (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.update' || perm === 'report_template.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sales Summary');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('gates Edit on report_template.update alone — Delete stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sales Summary');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).toBeNull();
  });

  it('gates Delete on report_template.delete alone — Edit stays hidden', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sales Summary');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).toBeNull();
  });
});

describe('ReportTemplateManagement — Add Template gates (report_template.create)', () => {
  it('hides the header Add Template button without report_template.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Sales Summary');

    expect(screen.queryByRole('button', { name: /add template/i })).toBeNull();
  });

  it('shows the header Add Template button with report_template.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.create';
    renderPage();
    await screen.findByText('Sales Summary');

    expect(screen.getByRole('button', { name: /add template/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add Template button without report_template.create', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No report templates yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add template/i })).toBeNull();
  });

  it('shows the empty-state Add Template button with report_template.create (discriminating control)', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(emptyResponse);
    auth.hasPermission = (perm) => perm === 'report_template.create';
    renderPage();

    expect(await screen.findByText('No report templates yet')).toBeInTheDocument();
    // Header + empty-state both render one; both are gated on report_template.create.
    expect(screen.getAllByRole('button', { name: /add template/i }).length).toBeGreaterThan(0);
  });
});

// This page has no bulk row-selection / `selectionResetKey` wiring at all (no
// `enableRowSelection`, no checkbox column, no bulk action bar — verified by grep:
// `selectionResetKey`/`clearSelection`/`enableRowSelection` do not appear anywhere in
// ReportTemplateManagement.tsx). It is therefore NOT a consumer of the shared
// `data-table.tsx` `selectionResetKey` reset mechanism Task 1 fixed, so no regression
// guard test is added here (unlike NewsManagement/UserManagement).

// Default sort is by name ascending (A→Z). The stored-sort preference was migrated
// to a fresh key (`sort_report_templates_v2`) to force-reset users who had the old
// `created_at:desc` default persisted, so the legacy `sort_report_templates` key must
// be ignored. These fail if the default reverts to created_at or the key bump is undone.
describe('ReportTemplateManagement — default sort by name', () => {
  it('requests sort by name ascending on first load with no stored preference', async () => {
    renderPage();
    await screen.findByText('Sales Summary');

    expect(reportTemplateService.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'name:asc' }),
    );
  });

  it('ignores the stale legacy sort_report_templates key and still defaults to name:asc', async () => {
    localStorage.setItem('sort_report_templates', 'created_at:desc');
    renderPage();
    await screen.findByText('Sales Summary');

    expect(reportTemplateService.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'name:asc' }),
    );
  });

  it('honours a stored v2 preference over the name:asc default', async () => {
    localStorage.setItem('sort_report_templates_v2', 'report_group:desc');
    renderPage();
    await screen.findByText('Sales Summary');

    expect(reportTemplateService.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'report_group:desc' }),
    );
  });
});

describe('ReportTemplateManagement — template_type badge', () => {
  it('renders a template_type badge for each row', async () => {
    renderPage();
    await screen.findByText('Sales Summary');

    expect(await screen.findByText(/list/i)).toBeInTheDocument();
  });
});

// The Name column must fit its content on a single line with no ellipsis — the
// page opts the shared DataTable into `table-auto` and the Name link drops
// `truncate max-w-[220px]` for `whitespace-nowrap`. These assertions fail if the
// truncation is reintroduced.
describe('ReportTemplateManagement — Name column fit-content', () => {
  it('renders the Name link single-line without truncation', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Sales Summary' });
    expect(link.className).toContain('whitespace-nowrap');
    expect(link.className).not.toContain('truncate');
    expect(link.className).not.toContain('max-w-');
  });
});

// The standalone Description column is removed; its value now renders as a
// secondary line inside the Name cell. Fails if the column returns or the
// description value stops rendering under the name.
describe('ReportTemplateManagement — description under name', () => {
  it('drops the Description column header', async () => {
    renderPage();
    await screen.findByText('Sales Summary');

    expect(screen.queryByRole('columnheader', { name: /description/i })).toBeNull();
  });

  it('drops the Source column header', async () => {
    renderPage();
    await screen.findByText('Sales Summary');

    expect(screen.queryByRole('columnheader', { name: /^source$/i })).toBeNull();
  });

  it('orders Template Type before Report Group', async () => {
    renderPage();
    await screen.findByText('Sales Summary');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const templateType = headers.findIndex((h) => /template type/i.test(h));
    const reportGroup = headers.findIndex((h) => /report group/i.test(h));
    expect(templateType).toBeGreaterThanOrEqual(0);
    expect(reportGroup).toBeGreaterThanOrEqual(0);
    expect(templateType).toBeLessThan(reportGroup);
  });

  it('shows the description value inside the Name cell', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Sales Summary' });
    const nameCell = link.closest('td');
    expect(nameCell).toHaveTextContent('Monthly sales summary report');
  });
});
