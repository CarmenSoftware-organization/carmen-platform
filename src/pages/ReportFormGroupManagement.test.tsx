import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix dropdown/dialog rely on pointer-capture / scroll APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

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

// Routing stays real (MemoryRouter, Link); only the imperative navigate is spied
// so the "Add" prefill state can be asserted.
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// `Can` is deliberately NOT mocked — it reads this same auth object, so the
// permission assertions below exercise the real gate rather than a stub.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string) => boolean,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('../services/reportTemplateService', () => ({
  default: { getAll: vi.fn(), update: vi.fn(), setGroupDefault: vi.fn() },
}));

import ReportFormGroupManagement from './ReportFormGroupManagement';
import reportTemplateService from '../services/reportTemplateService';
import type { ReportTemplate } from '../services/reportTemplateService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const tpl = (over: Partial<ReportTemplate> & { id: string; name: string }): ReportTemplate => ({
  report_group: 'PR',
  dialog: '',
  content: '',
  is_standard: true,
  is_default: false,
  is_active: true,
  ...over,
});

/** The page's own read shape: { data: { data: [...], paginate: {...} } }. */
const page = (items: ReportTemplate[], total?: number) => ({
  data: { data: items, paginate: { total: total ?? items.length, page: 1, perpage: 500 } },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportFormGroupManagement />
    </MemoryRouter>,
  );

const conflictError = {
  response: {
    status: 409,
    data: { code: 'ALREADY_EXISTS', message: 'Record was modified by another request' },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.hasPermission = () => true;
  asMock(reportTemplateService.getAll).mockResolvedValue(page([]));
  asMock(reportTemplateService.update).mockResolvedValue({});
  asMock(reportTemplateService.setGroupDefault).mockResolvedValue(undefined);
});

describe('ReportFormGroupManagement — fetching every form template', () => {
  it('requests only form templates that are not soft-deleted', async () => {
    renderPage();

    await waitFor(() => expect(reportTemplateService.getAll).toHaveBeenCalled());
    const params = asMock(reportTemplateService.getAll).mock.calls[0][0];
    expect(JSON.parse(params.advance)).toEqual({
      where: { template_type: 'form', deleted_at: null },
    });
  });

  it('keeps paging until the reported total is reached', async () => {
    // Grouping over a silent subset would show wrong defaults, so a page that
    // reports more rows than it returned must be followed by another request.
    asMock(reportTemplateService.getAll)
      .mockResolvedValueOnce(page([tpl({ id: '1', name: 'First', report_group: 'PR' })], 2))
      .mockResolvedValueOnce(page([tpl({ id: '2', name: 'Second', report_group: 'PO' })], 2));

    renderPage();

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(reportTemplateService.getAll).toHaveBeenCalledTimes(2);
    expect(asMock(reportTemplateService.getAll).mock.calls[1][0].page).toBe(2);
  });

  it('stops on an empty page even when the reported total is never reached', async () => {
    // Guards against an infinite loop when the backend over-reports `total`.
    asMock(reportTemplateService.getAll)
      .mockResolvedValueOnce(page([tpl({ id: '1', name: 'Only', report_group: 'PR' })], 99))
      .mockResolvedValueOnce(page([], 99));

    renderPage();

    expect(await screen.findByText('Only')).toBeInTheDocument();
    expect(reportTemplateService.getAll).toHaveBeenCalledTimes(2);
  });

  it('stops after a short page when the response carries no total', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue({
      data: [tpl({ id: '1', name: 'Lonely', report_group: 'PR' })],
    });

    renderPage();

    expect(await screen.findByText('Lonely')).toBeInTheDocument();
    expect(reportTemplateService.getAll).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error state when the fetch fails', async () => {
    asMock(reportTemplateService.getAll).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/failed to load form templates/i)).toBeInTheDocument();

    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: '1', name: 'Recovered', report_group: 'PR' })]),
    );
    await user.click(screen.getByRole('button', { name: /retry|try again/i }));

    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });
});

describe('ReportFormGroupManagement — grouping', () => {
  it('renders all twelve fixed groups even when no templates exist', async () => {
    renderPage();

    expect(await screen.findByText('PR')).toBeInTheDocument();
    for (const code of ['PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'IA', 'PC', 'SC', 'RFP', 'EOP']) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    expect(screen.getAllByText('No form templates')).toHaveLength(12);
  });

  it('appends a legacy group only when it holds at least one row', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: '1', name: 'Old report', report_group: 'LEGACY' })]),
    );
    renderPage();

    expect(await screen.findByText('LEGACY')).toBeInTheDocument();
    expect(screen.getByText('Old report')).toBeInTheDocument();
    // The fixed twelve are still there — legacy groups are additive.
    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  it('files a template with no report_group under the (none) group', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: '1', name: 'Ungrouped', report_group: '' })]),
    );
    renderPage();

    expect(await screen.findByText('(none)')).toBeInTheDocument();
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
  });

  it('sorts the default template first, then the rest by name', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([
        tpl({ id: '1', name: 'Alpha', report_group: 'PR' }),
        tpl({ id: '2', name: 'Zulu', report_group: 'PR', is_default: true }),
        tpl({ id: '3', name: 'Bravo', report_group: 'PR' }),
      ]),
    );
    const { container } = renderPage();

    await screen.findByText('Zulu');

    const names = Array.from(container.querySelectorAll('.truncate.text-sm.font-medium')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['Zulu', 'Alpha', 'Bravo']);
  });

  it('warns in-group when a group holds templates but none is the default', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: '1', name: 'Orphan', report_group: 'PR' })]),
    );
    renderPage();

    expect(await screen.findByText(/no default set/i)).toBeInTheDocument();
  });
});

describe('ReportFormGroupManagement — search and active-only filtering', () => {
  beforeEach(() => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([
        tpl({ id: '1', name: 'Purchase form', report_group: 'PR' }),
        tpl({ id: '2', name: 'Order form', report_group: 'PO' }),
        tpl({ id: '3', name: 'Retired form', report_group: 'PO', is_active: false }),
      ]),
    );
  });

  it('keeps a whole group when the query matches its code', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Purchase form');

    await user.type(screen.getByLabelText('Search form groups'), 'PO');

    expect(await screen.findByText('Order form')).toBeInTheDocument();
    expect(screen.queryByText('Purchase form')).toBeNull();
  });

  it('keeps only the matching rows when the query matches a template name', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Purchase form');

    await user.type(screen.getByLabelText('Search form groups'), 'Purchase');

    expect(screen.getByText('Purchase form')).toBeInTheDocument();
    expect(screen.queryByText('Order form')).toBeNull();
  });

  it('hides inactive templates once "Active only" is ticked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Retired form');

    await user.click(screen.getByRole('checkbox'));

    expect(screen.queryByText('Retired form')).toBeNull();
    expect(screen.getByText('Order form')).toBeInTheDocument();
  });

  it('reports an empty result set rather than rendering bare group shells', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Purchase form');

    await user.type(screen.getByLabelText('Search form groups'), 'nothing-matches-this');

    expect(await screen.findByText('No groups match your search.')).toBeInTheDocument();
  });
});

describe('ReportFormGroupManagement — setting a group default', () => {
  const withDefault = [
    tpl({ id: 'old', name: 'Current default', report_group: 'PR', is_default: true, doc_version: 3 }),
    tpl({ id: 'new', name: 'Challenger', report_group: 'PR', doc_version: 7 }),
  ];

  it('names the template being replaced before writing anything', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(withDefault));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Challenger');

    await user.click(screen.getByLabelText('Set Challenger as default for PR'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/replaces "Current default"/i)).toBeInTheDocument();
    expect(reportTemplateService.setGroupDefault).not.toHaveBeenCalled();
  });

  it('sends both doc_version tokens so the swap is optimistically locked', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(withDefault));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Challenger');

    await user.click(screen.getByLabelText('Set Challenger as default for PR'));
    await user.click(await screen.findByRole('button', { name: 'Set default' }));

    await waitFor(() =>
      expect(reportTemplateService.setGroupDefault).toHaveBeenCalledWith({
        current: { id: 'old', doc_version: 3 },
        target: { id: 'new', doc_version: 7 },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Set "Challenger" as default for PR');
  });

  it('passes a null current when the group has no default yet', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: 'solo', name: 'First one', report_group: 'PR', doc_version: 1 })]),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('First one');

    await user.click(screen.getByLabelText('Set First one as default for PR'));
    await user.click(await screen.findByRole('button', { name: 'Set default' }));

    await waitFor(() =>
      expect(reportTemplateService.setGroupDefault).toHaveBeenCalledWith({
        current: null,
        target: { id: 'solo', doc_version: 1 },
      }),
    );
  });

  it('reports a stale write as a version conflict and reloads', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(withDefault));
    asMock(reportTemplateService.setGroupDefault).mockRejectedValue(conflictError);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Challenger');

    await user.click(screen.getByLabelText('Set Challenger as default for PR'));
    await user.click(await screen.findByRole('button', { name: 'Set default' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This record was changed by someone else',
        expect.objectContaining({ description: expect.stringContaining('Reloading') }),
      ),
    );
    // Both the conflict path and the plain-error path refetch here.
    await waitFor(() => expect(reportTemplateService.getAll).toHaveBeenCalledTimes(2));
  });

  it('cannot make an inactive template the default', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(
      page([tpl({ id: 'off', name: 'Dormant', report_group: 'PR', is_active: false })]),
    );
    renderPage();
    await screen.findByText('Dormant');

    expect(screen.getByLabelText('Set Dormant as default for PR')).toBeDisabled();
  });
});

describe('ReportFormGroupManagement — activating and deactivating', () => {
  const rows = [
    tpl({ id: 'a', name: 'Toggle me', report_group: 'PR', doc_version: 4 }),
    tpl({ id: 'd', name: 'The default', report_group: 'PR', is_default: true }),
  ];

  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('button', { name: `Actions for ${name}` }));

  it('deactivates with the record\'s doc_version attached', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(rows));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Toggle me');

    await openRowMenu(user, 'Toggle me');
    await user.click(await screen.findByRole('menuitem', { name: /deactivate/i }));

    await waitFor(() =>
      expect(reportTemplateService.update).toHaveBeenCalledWith('a', {
        is_active: false,
        doc_version: 4,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Deactivated "Toggle me"');
  });

  it('locks deactivation of the group default', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(rows));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('The default');

    await openRowMenu(user, 'The default');

    const item = await screen.findByRole('menuitem', { name: /deactivate \(default\)/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('does NOT reload after an ordinary failure — only the toast fires', async () => {
    // Deliberate asymmetry with confirmDefault, which reloads on every error.
    // Locked in as current behaviour; change the code and this test must change too.
    asMock(reportTemplateService.getAll).mockResolvedValue(page(rows));
    asMock(reportTemplateService.update).mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Toggle me');

    await openRowMenu(user, 'Toggle me');
    await user.click(await screen.findByRole('menuitem', { name: /deactivate/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to update')),
    );
    expect(reportTemplateService.getAll).toHaveBeenCalledTimes(1);
  });

  it('DOES reload after a version conflict', async () => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(rows));
    asMock(reportTemplateService.update).mockRejectedValue(conflictError);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Toggle me');

    await openRowMenu(user, 'Toggle me');
    await user.click(await screen.findByRole('menuitem', { name: /deactivate/i }));

    await waitFor(() => expect(reportTemplateService.getAll).toHaveBeenCalledTimes(2));
    expect(toast.error).toHaveBeenCalledWith(
      'This record was changed by someone else',
      expect.anything(),
    );
  });
});

describe('ReportFormGroupManagement — permission gates', () => {
  const rows = [tpl({ id: 'a', name: 'Some form', report_group: 'PR' })];

  beforeEach(() => {
    asMock(reportTemplateService.getAll).mockResolvedValue(page(rows));
  });

  it('hides both create affordances without report_template.create', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Some form');

    expect(screen.queryByRole('button', { name: /new form template/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^add$/i })).toBeNull();
  });

  it('shows both create affordances with report_template.create (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.create';
    renderPage();
    await screen.findByText('Some form');

    expect(screen.getByRole('button', { name: /new form template/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^add$/i }).length).toBeGreaterThan(0);
  });

  it('disables the default radio and hides row actions without report_template.update', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.create';
    renderPage();
    await screen.findByText('Some form');

    expect(screen.getByLabelText('Set Some form as default for PR')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /actions for some form/i })).toBeNull();
  });

  it('enables the default radio and row actions with report_template.update (discriminating control)', async () => {
    auth.hasPermission = (perm) => perm === 'report_template.update';
    renderPage();
    await screen.findByText('Some form');

    expect(screen.getByLabelText('Set Some form as default for PR')).toBeEnabled();
    expect(screen.getByRole('button', { name: /actions for some form/i })).toBeInTheDocument();
  });

  it('prefills the group code when adding from inside a group card', async () => {
    auth.hasPermission = () => true;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Some form');

    // Every group card renders its own Add; the first belongs to PR.
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(navigate).toHaveBeenCalledWith('/report-templates/new', {
      state: { template_type: 'form', report_group: 'PR' },
    });
  });

  it('omits the group code when adding from the page header', async () => {
    auth.hasPermission = () => true;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Some form');

    await user.click(screen.getByRole('button', { name: /new form template/i }));

    expect(navigate).toHaveBeenCalledWith('/report-templates/new', {
      state: { template_type: 'form' },
    });
  });
});
