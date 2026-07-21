import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the shell so no AuthContext/Sidebar is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The XML editors wrap CodeMirror, which doesn't need exercising here — this
// page's own load/save/gating/probe logic is the thing under test (same
// approach NewsEdit.test.tsx takes with MarkdownEditor).
vi.mock('../components/XmlEditor', () => ({
  XmlEditor: ({ label }: { label?: string }) => <div data-testid={`xml-editor-${label}`} />,
}));
vi.mock('../components/DialogPreview', () => ({
  DialogPreview: () => <div data-testid="dialog-preview" />,
}));

// Mutable auth so a test can revoke report_template.update. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself
// to always render its children would make the permission tests below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/reportTemplateService', () => ({
  default: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    listDbObjects: vi.fn(),
  },
}));

import ReportTemplateEdit from './ReportTemplateEdit';
import reportTemplateService from '../services/reportTemplateService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

// Node 26 exposes bare `localStorage` as undefined; the page reads/writes it
// for the probe-BU picker (see ClusterManagement.test.tsx for precedent).
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

const fakeTemplate = {
  id: 'rt1',
  name: 'PR Summary',
  description: 'Purchase request summary report',
  report_group: 'procurement',
  dialog: '<Dialog></Dialog>',
  content: '<Content></Content>',
  is_standard: true,
  allow_business_unit: [],
  deny_business_unit: [],
  is_active: true,
  template_type: 'list',
  builder_key: 'pr-summary',
  source_type: 'function',
  source_name: 'fn_pr_report',
  source_params: { params: [{ filter: 'DateFrom', type: 'date', nullable: false }] },
  created_at: '2026-01-05T10:00:00Z',
  created_by_name: 'Ada Lovelace',
  updated_at: '2026-02-10T10:00:00Z',
  updated_by_name: 'Grace Hopper',
  doc_version: 3,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/report-templates/new" element={<ReportTemplateEdit />} />
        <Route path="/report-templates/:id/edit" element={<ReportTemplateEdit />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
});

describe('ReportTemplateEdit (integration)', () => {
  it('loads an existing template, including audit meta in the new single-line style', async () => {
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/rt1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'PR Summary' })).toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-05/)).toBeInTheDocument();
    expect(screen.getByText(/by Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByText(/by Grace Hopper/)).toBeInTheDocument();
  });

  it('renders the read-only description via ReadOnlyField', async () => {
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/rt1/edit');

    expect(await screen.findByText(fakeTemplate.description)).toBeInTheDocument();
  });

  it('starts a new template in edit mode without calling getById', async () => {
    renderAt('/report-templates/new');

    expect(await screen.findByText('New Report Template')).toBeInTheDocument();
    expect(reportTemplateService.getById).not.toHaveBeenCalled();
  });
});

describe('ReportTemplateEdit — loading state', () => {
  it('marks the loading region with role=status', async () => {
    const deferred = createDeferred<{ data: typeof fakeTemplate }>();
    asMock(reportTemplateService.getById).mockReturnValue(deferred.promise);
    renderAt('/report-templates/rt1/edit');

    expect(screen.getByRole('status', { name: /loading report template/i })).toBeInTheDocument();
    deferred.resolve({ data: fakeTemplate });
    expect(await screen.findByRole('heading', { level: 1, name: 'PR Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /loading report template/i })).toBeNull();
  });
});

describe('ReportTemplateEdit — not-found state', () => {
  it('gates the edit shell behind a not-found state on a 404', async () => {
    asMock(reportTemplateService.getById).mockRejectedValue({ response: { status: 404 } });
    renderAt('/report-templates/nope/edit');

    expect(await screen.findByText('Report template not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /back to report templates/i })).toBeInTheDocument();
  });

  it('treats a 200 carrying no record as not-found', async () => {
    asMock(reportTemplateService.getById).mockResolvedValue({ data: null });
    renderAt('/report-templates/nope/edit');

    expect(await screen.findByText('Report template not found')).toBeInTheDocument();
  });

  it('keeps the retryable inline banner for a transient failure (not not-found)', async () => {
    asMock(reportTemplateService.getById).mockRejectedValue({ response: { status: 500 } });
    renderAt('/report-templates/rt1/edit');

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to load report template/i);
    expect(screen.queryByText('Report template not found')).toBeNull();
  });
});

describe('ReportTemplateEdit — Edit is gated on report_template.update', () => {
  beforeEach(() => {
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
  });

  it('hides Edit without report_template.update', async () => {
    auth.hasPermission = () => false;
    renderAt('/report-templates/rt1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'PR Summary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('shows Edit when report_template.update is held (discriminating control)', async () => {
    renderAt('/report-templates/rt1/edit');

    expect(await screen.findByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });
});

describe('ReportTemplateEdit — remove-parameter control', () => {
  it('has an accessible name via aria-label (was icon-only with no label)', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/rt1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    expect(screen.getByRole('button', { name: /remove parameter "DateFrom"/i })).toBeInTheDocument();
  });
});

describe('ReportTemplateEdit — DB objects probe', () => {
  it('shows FetchErrorState on probe failure, then retries and clears on demand', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    asMock(reportTemplateService.listDbObjects)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ views: [], functions: [{ name: 'fn_pr_report', kind: 'function' }], procedures: [] });
    renderAt('/report-templates/rt1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));
    await user.type(screen.getByLabelText(/browse in bu/i), 'T03');
    await user.click(screen.getByRole('button', { name: /^load$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load DB objects from T03.");

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reportTemplateService.listDbObjects).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('fn_pr_report')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ReportTemplateEdit — Template Type in Template Info', () => {
  it('renders Template Type before Name in the Template Info card (new template)', async () => {
    renderAt('/report-templates/new');

    const type = await screen.findByLabelText(/Template Type/);
    const name = screen.getByLabelText(/^Name/);
    // Template Type must come first in DOM order.
    expect(type.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('defaults Template Type to empty on a new template', async () => {
    renderAt('/report-templates/new');

    const type = (await screen.findByLabelText(/Template Type/)) as HTMLSelectElement;
    expect(type.value).toBe('');
  });

  it('blocks submit and shows an error when no type is chosen', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    // Name/Report Group carry a native HTML `required` attribute — leaving
    // them empty would make jsdom's (and real browsers') constraint
    // validation block requestSubmit() before handleSubmit's JS-level checks
    // ever run. Fill them so this test isolates the new template_type check.
    await user.type(await screen.findByLabelText(/^Name/), 'My Report');
    await user.type(screen.getByLabelText(/Report Group/), 'inventory');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    expect(await screen.findByText('Template type is required')).toBeInTheDocument();
    expect(reportTemplateService.create).not.toHaveBeenCalled();
  });

  it('creates a list template with a chosen type (happy path)', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.type(screen.getByLabelText(/^Name/), 'My Report');
    await user.type(screen.getByLabelText(/Report Group/), 'inventory');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'list', name: 'My Report', report_group: 'inventory' }),
      ),
    );
  });

  it('no longer renders a Template Type control in the Data Source card', async () => {
    renderAt('/report-templates/new');

    // Exactly one Template Type label now (in Template Info, not Data Source).
    expect(await screen.findAllByText(/^Template Type/)).toHaveLength(1);
  });
});

describe('ReportTemplateEdit — Report Group forks on Template Type', () => {
  it('is a textbox for list and a select for form', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    expect((screen.getByLabelText(/Report Group/) as HTMLElement).tagName).toBe('INPUT');

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    const group = screen.getByLabelText(/Report Group/) as HTMLElement;
    expect(group.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'PR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EOP' })).toBeInTheDocument();
  });

  it('stores the bare code when a form group is chosen', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'form');
    await user.type(screen.getByLabelText(/^Name/), 'Form Report');
    await user.selectOptions(screen.getByLabelText(/Report Group/), 'PO');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'form', report_group: 'PO' }),
      ),
    );
  });

  it('preserves an out-of-list report_group on an existing form record', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.getById).mockResolvedValue({
      data: { ...fakeTemplate, template_type: 'form', report_group: 'inventory' },
    });
    renderAt('/report-templates/rt1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    const group = screen.getByLabelText(/Report Group/) as HTMLSelectElement;
    expect(group.value).toBe('inventory');
    expect(screen.getByRole('option', { name: 'inventory' })).toBeInTheDocument();
  });
});

describe('ReportTemplateEdit — Standard hidden + forced in form mode', () => {
  it('hides the Standard checkbox and header badge in form mode', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    expect(screen.getByLabelText('Standard')).toBeInTheDocument();
    expect(screen.getByLabelText('Active')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    expect(screen.queryByLabelText('Standard')).toBeNull();
    expect(screen.getByLabelText('Active')).toBeInTheDocument();
  });

  it('forces is_standard true in the form-mode payload even after unchecking it', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    // Uncheck Standard while in list mode…
    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.click(screen.getByLabelText('Standard'));
    // …then switch to form and save.
    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    await user.type(screen.getByLabelText(/^Name/), 'Form Report');
    await user.selectOptions(screen.getByLabelText(/Report Group/), 'PR');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_standard: true }),
      ),
    );
  });
});
