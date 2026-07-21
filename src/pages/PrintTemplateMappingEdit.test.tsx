import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable auth so a test can revoke print_template_mapping.update. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself to always
// render its children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../services/printTemplateMappingService', () => ({
  default: { getById: vi.fn(), listDocumentTypes: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('../services/reportTemplateService', () => ({
  default: { getAll: vi.fn() },
}));

import PrintTemplateMappingEdit from './PrintTemplateMappingEdit';
import printTemplateMappingService from '../services/printTemplateMappingService';
import reportTemplateService from '../services/reportTemplateService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const mapping = {
  id: 'm1',
  document_type: 'invoice',
  report_template_id: 't1',
  is_default: true,
  display_label: 'Standard Invoice',
  display_order: 0,
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
  asMock(printTemplateMappingService.getById).mockResolvedValue({ success: true, data: mapping });
  asMock(printTemplateMappingService.listDocumentTypes).mockResolvedValue({
    success: true,
    document_types: [{ value: 'invoice', label: 'Invoice' }],
  });
  asMock(reportTemplateService.getAll).mockResolvedValue({ data: [{ id: 't1', name: 'Invoice Template' }] });
});

const renderExisting = () =>
  render(
    <MemoryRouter initialEntries={['/print-template-mapping/m1/edit']}>
      <Routes>
        <Route path="/print-template-mapping/:id/edit" element={<PrintTemplateMappingEdit />} />
        <Route path="/print-template-mapping/new" element={<PrintTemplateMappingEdit />} />
      </Routes>
    </MemoryRouter>,
  );

describe('PrintTemplateMappingEdit (integration)', () => {
  it('loads an existing mapping in read mode', async () => {
    renderExisting();

    expect(await screen.findByText('Edit Print Template Mapping')).toBeInTheDocument();
    expect(printTemplateMappingService.getById).toHaveBeenCalledWith('m1');
  });
});

// SECURITY. The lone gate on this page guards the Edit toggle
// (print_template_mapping.update, PrintTemplateMappingEdit.tsx:317) — the only way into
// edit mode for an existing mapping. This must FAIL if the gate is deleted.
describe('PrintTemplateMappingEdit — edit toggle is gated on print_template_mapping.update', () => {
  it('hides the Edit toggle without print_template_mapping.update', async () => {
    auth.hasPermission = () => false;
    renderExisting();

    // Positive anchor: the record really did load, so the negative below is meaningful.
    expect(await screen.findByText('Edit Print Template Mapping')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  // Discriminating control — proves the negative above isn't passing on a bad selector,
  // and that the gate keys on print_template_mapping.update, not any truthy permission.
  it('shows the Edit toggle with print_template_mapping.update (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'print_template_mapping.update';
    renderExisting();

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('does not unlock the toggle on the read-only permission', async () => {
    auth.hasPermission = (perm) => perm === 'print_template_mapping.read';
    renderExisting();

    expect(await screen.findByText('Edit Print Template Mapping')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });
});
