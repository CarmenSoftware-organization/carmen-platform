import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Radix DropdownMenu relies on pointer-capture APIs jsdom lacks.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// Mutable auth so a test can revoke individual news.* permissions. `Can` (the REAL
// component, not mocked here) reads this via useAuth() — mocking `Can` itself (or
// hardcoding `hasPermission: () => true`) would make the permission tests below
// vacuous, which is exactly how this page's 4 `<Can>` gates went untested.
const auth = vi.hoisted(() => ({
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/newsService', () => ({
  default: { getAll: vi.fn(), getTags: vi.fn(), delete: vi.fn(), update: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import NewsManagement from './NewsManagement';
import newsService from '../services/newsService';
import { toast } from 'sonner';

const NEWS = [
  { id: 'n1', title: 'Alpha', status: 'published' },
  { id: 'n2', title: 'Beta', status: 'draft' },
];

const renderPage = () => render(<MemoryRouter><NewsManagement /></MemoryRouter>);

// Node 26 exposes bare `localStorage` as undefined (experimental global requires
// --localstorage-file); jsdom's window.localStorage doesn't win at the bare reference.
// NewsManagement reads/writes localStorage directly during render, so stub it —
// same pattern as src/components/Sidebar.test.tsx and src/services/tenantMigrationService.test.ts.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: (_: number) => null,
  };
};

describe('NewsManagement bulk delete', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.clearAllMocks();
    auth.hasPermission = () => true;
    // The masthead issues a separate perpage:-1 roll-up; keep it empty so its
    // lead-story headline doesn't duplicate the table's row text in queries.
    vi.mocked(newsService.getAll).mockImplementation((p) =>
      Promise.resolve(
        p?.perpage === -1
          ? { data: [], paginate: { total: 0, page: 1, perpage: -1 } }
          : { data: NEWS, paginate: { total: 2, page: 1, perpage: 10 } },
      ) as never,
    );
    vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    vi.mocked(newsService.delete).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the selection toolbar with a count when rows are checked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('opens the confirm dialog and keeps Delete disabled until the code matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    // The toolbar (and its "Delete Selected" button) only appears once DataTable's
    // selection-changed effect round-trips back up through onSelectionChange into
    // this page's own state — a second render past the click itself. Waiting for
    // "1 selected" (rather than querying the button synchronously right after the
    // click) is what makes this deterministic; see the flake note below.
    await screen.findByText('1 selected');
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const del = within(dialog).getByRole('button', { name: /^delete$/i });
    expect(del).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'WRONG1');
    expect(del).toBeDisabled();
  });

  it('deletes every selected row on the correct code, toasts success, clears selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(newsService.delete).toHaveBeenCalledTimes(2));
    expect(newsService.delete).toHaveBeenCalledWith('n1');
    expect(newsService.delete).toHaveBeenCalledWith('n2');
    expect(toast.success).toHaveBeenCalledWith('Deleted 2 news article(s)');
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('warns on partial failure', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.delete)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({} as never);
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Deleted 1, 1 failed'));
  });

  it('hides selection entirely when the user lacks news.delete', async () => {
    auth.hasPermission = () => false;
    renderPage();
    await screen.findByText('Alpha');
    expect(screen.queryByLabelText('Select Alpha')).not.toBeInTheDocument();
  });

  it('errors when every bulk delete fails', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.delete).mockRejectedValue(new Error('nope'));
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete 2 news article(s)'));
  });

  it('resets bulk selection when the result set changes (e.g. a sort change)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    // Sorting is a real user interaction that changes paginate.sort — the
    // result-set-changed reset effect should discard the stale selection.
    await user.click(screen.getByRole('button', { name: /title/i }));
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
  });
});

const NEWS_DV = [
  { id: 'n1', title: 'Alpha', status: 'published', doc_version: 3 },
  { id: 'n2', title: 'Beta', status: 'draft' },
  { id: 'n3', title: 'Gamma', status: 'draft', doc_version: 0 },
];

describe('NewsManagement bulk archive', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.clearAllMocks();
    auth.hasPermission = () => true;
    vi.mocked(newsService.getAll).mockImplementation((p) =>
      Promise.resolve(
        p?.perpage === -1
          ? { data: [], paginate: { total: 0, page: 1, perpage: -1 } }
          : { data: NEWS_DV, paginate: { total: 3, page: 1, perpage: 10 } },
      ) as never,
    );
    vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    vi.mocked(newsService.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows both Archive and Delete for a user with both permissions', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByRole('button', { name: /archive selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument();
  });

  it('shows Archive but not Delete for a news.update-only user', async () => {
    auth.hasPermission = (k: string) => k === 'news.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByRole('button', { name: /archive selected/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument();
  });

  it('archives every selected row with status archived, forwarding doc_version only when present', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /archive selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(newsService.update).toHaveBeenCalledTimes(2));
    expect(newsService.update).toHaveBeenCalledWith('n1', { status: 'archived', doc_version: 3 });
    expect(newsService.update).toHaveBeenCalledWith('n2', { status: 'archived' });
    expect(toast.success).toHaveBeenCalledWith('Archived 2 news article(s)');
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('warns on partial archive failure', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.update)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({} as never);
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /archive selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Archived 1, 1 failed'));
  });

  it('forwards doc_version: 0 (a valid version) when archiving', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Gamma');
    await user.click(screen.getByLabelText('Select Gamma'));
    await screen.findByText('1 selected');
    await user.click(screen.getByRole('button', { name: /archive selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(newsService.update).toHaveBeenCalledWith('n3', { status: 'archived', doc_version: 0 }));
  });

  it('shows Publish and Archive but not Delete for a news.update-only user', async () => {
    auth.hasPermission = (k: string) => k === 'news.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByRole('button', { name: /publish selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive selected/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument();
  });

  it('publishes every selected row with status published, forwarding doc_version when present', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /publish selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(newsService.update).toHaveBeenCalledTimes(2));
    expect(newsService.update).toHaveBeenCalledWith('n1', { status: 'published', doc_version: 3 });
    expect(newsService.update).toHaveBeenCalledWith('n2', { status: 'published' });
    expect(toast.success).toHaveBeenCalledWith('Published 2 news article(s)');
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('warns on partial publish failure', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.update)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({} as never);
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await screen.findByText('2 selected');
    await user.click(screen.getByRole('button', { name: /publish selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Published 1, 1 failed'));
  });
});

// SECURITY. 4 `<Can>` gates guard this page's write surfaces: the row Edit
// (news.update), the row Delete (news.delete), the header Add News (news.create)
// and the empty-state Add News (news.create). This file used to mask them with
// `hasPermission: () => true`, which is vacuous — every gate test below is paired
// with a discriminating positive control so a deleted `<Can>` fails the suite.
const openRowMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /actions for alpha/i }));

describe('NewsManagement — row action gates (news.update / news.delete)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.clearAllMocks();
    auth.hasPermission = () => true;
    vi.mocked(newsService.getAll).mockImplementation((p) =>
      Promise.resolve(
        p?.perpage === -1
          ? { data: [], paginate: { total: 0, page: 1, perpage: -1 } }
          : { data: NEWS, paginate: { total: 2, page: 1, perpage: 10 } },
      ) as never,
    );
    vi.mocked(newsService.getTags).mockResolvedValue([] as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides both row actions without news.update / news.delete', async () => {
    auth.hasPermission = () => false;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  // Discriminating control: proves the negative assertions above aren't vacuous /
  // aren't passing because of a bad selector.
  it('shows both row actions with full permissions (discriminating control)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('gates the row Edit action on news.update alone', async () => {
    auth.hasPermission = (perm: string) => perm === 'news.update';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');

    await openRowMenu(user);

    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
  });

  it('gates the row Delete action on news.delete alone', async () => {
    auth.hasPermission = (perm: string) => perm === 'news.delete';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');

    await openRowMenu(user);

    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });
});

describe('NewsManagement — Add News gates (news.create)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('with existing rows (header button)', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', makeLocalStorage());
      vi.clearAllMocks();
      auth.hasPermission = () => true;
      vi.mocked(newsService.getAll).mockImplementation((p) =>
        Promise.resolve(
          p?.perpage === -1
            ? { data: [], paginate: { total: 0, page: 1, perpage: -1 } }
            : { data: NEWS, paginate: { total: 2, page: 1, perpage: 10 } },
        ) as never,
      );
      vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    });

    it('hides the header Add News button without news.create', async () => {
      auth.hasPermission = () => false;
      renderPage();
      await screen.findByText('Alpha');

      expect(screen.queryByRole('button', { name: /add news/i })).toBeNull();
    });

    it('shows the header Add News button with news.create (discriminating control)', async () => {
      auth.hasPermission = (perm: string) => perm === 'news.create';
      renderPage();
      await screen.findByText('Alpha');

      expect(screen.getByRole('button', { name: /add news/i })).toBeInTheDocument();
    });
  });

  describe('with an empty list (header + empty-state button)', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', makeLocalStorage());
      vi.clearAllMocks();
      auth.hasPermission = () => true;
      vi.mocked(newsService.getAll).mockResolvedValue({ data: [], paginate: { total: 0, page: 1, perpage: 10 } } as never);
      vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    });

    it('hides the empty-state Add News button without news.create', async () => {
      auth.hasPermission = () => false;
      renderPage();

      expect(await screen.findByText('No news yet')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add news/i })).toBeNull();
    });

    it('shows the empty-state Add News button with news.create (discriminating control)', async () => {
      auth.hasPermission = (perm: string) => perm === 'news.create';
      renderPage();

      expect(await screen.findByText('No news yet')).toBeInTheDocument();
      // Header + empty-state gate both render one Add News button; both gated on
      // the same news.create permission.
      expect(screen.getAllByRole('button', { name: /add news/i }).length).toBeGreaterThan(0);
    });
  });
});
