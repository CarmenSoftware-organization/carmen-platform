import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown relies on pointer-capture APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke individual print_template_mapping.* permissions.
// `Can` (the REAL component, not mocked here) reads this via useAuth() — mocking `Can`
// itself to always render its children would make the permission tests below vacuous.
// This page had one of its 4 `<Can>` gates deleted once on a false justification (T2),
// with nothing in CI catching it — only human review did. These tests exist so a
// deleted gate fails the suite next time.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../services/printTemplateMappingService', () => ({
  default: {
    getAll: vi.fn(),
    listDocumentTypes: vi.fn(),
    delete: vi.fn(),
  },
}));

import PrintTemplateMappingManagement from './PrintTemplateMappingManagement';
import printTemplateMappingService from '../services/printTemplateMappingService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeRow = {
  id: 'm1',
  document_type: 'PR',
  report_template_id: 't1',
  is_default: true,
  display_label: 'Purchase Request',
  display_order: 1,
  is_active: true,
  template_name: 'PR Template',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <PrintTemplateMappingManagement />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(printTemplateMappingService.listDocumentTypes).mockResolvedValue({
    success: true,
    document_types: [{ code: 'PR', label: 'Purchase Request' }],
  });
  asMock(printTemplateMappingService.getAll).mockResolvedValue({
    success: true,
    data: [fakeRow],
    total: 1,
  });
});

const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /actions for pr template/i }));

// SECURITY. 4 `<Can>` gates guard this page's write surfaces: the row Edit
// (print_template_mapping.update), the row Delete (print_template_mapping.delete), the
// header New Mapping (print_template_mapping.create) and the empty-state New Mapping
// (print_template_mapping.create, restructured into a DropdownMenu this wave).
describe('PrintTemplateMappingManagement — row action gates', () => {
  it('hides both row actions without print_template_mapping.update / .delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('PR Template');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  // Discriminating control: proves the negative assertions above aren't vacuous /
  // aren't passing because of a bad selector.
  it('shows both row actions with full permissions (discriminating control)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('PR Template');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('gates the row Edit action on print_template_mapping.update alone', async () => {
    auth.hasPermission = (perm) => perm === 'print_template_mapping.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('PR Template');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  it('gates the row Delete action on print_template_mapping.delete alone', async () => {
    auth.hasPermission = (perm) => perm === 'print_template_mapping.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('PR Template');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });
});

describe('PrintTemplateMappingManagement — New Mapping gates (print_template_mapping.create)', () => {
  it('hides the header New Mapping button without print_template_mapping.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('PR Template');

    expect(screen.queryByRole('button', { name: /new mapping/i })).toBeNull();
  });

  it('shows the header New Mapping button with print_template_mapping.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'print_template_mapping.create';
    renderPage();
    await screen.findByText('PR Template');

    expect(screen.getByRole('button', { name: /new mapping/i })).toBeInTheDocument();
  });

  it('hides the empty-state New Mapping button without print_template_mapping.create', async () => {
    asMock(printTemplateMappingService.listDocumentTypes).mockResolvedValue({
      success: true,
      document_types: [],
    });
    asMock(printTemplateMappingService.getAll).mockResolvedValue({ success: true, data: [], total: 0 });
    auth.hasPermission = () => false;
    renderPage();

    expect(await screen.findByText('No document types configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new mapping/i })).toBeNull();
  });

  it('shows the empty-state New Mapping button with print_template_mapping.create (discriminating control)', async () => {
    asMock(printTemplateMappingService.listDocumentTypes).mockResolvedValue({
      success: true,
      document_types: [],
    });
    asMock(printTemplateMappingService.getAll).mockResolvedValue({ success: true, data: [], total: 0 });
    auth.hasPermission = (perm) => perm === 'print_template_mapping.create';
    renderPage();

    expect(await screen.findByText('No document types configured')).toBeInTheDocument();
    // Header + empty-state gate both render one; both are gated on the same permission.
    expect(screen.getAllByRole('button', { name: /new mapping/i }).length).toBeGreaterThan(0);
  });
});
