import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/newsService', () => ({
  default: { getAll: vi.fn(), getTags: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import NewsManagement from './NewsManagement';
import newsService from '../services/newsService';
import { useAuth } from '../context/AuthContext';
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
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => true } as never);
    vi.mocked(newsService.getAll).mockResolvedValue({
      data: NEWS,
      paginate: { total: 2, page: 1, perpage: 10 },
    } as never);
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
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Deleted 1, 1 failed'));
  });

  it('hides selection entirely when the user lacks news.delete', async () => {
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => false } as never);
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
