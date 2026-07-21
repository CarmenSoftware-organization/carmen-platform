// src/pages/TenantMigrationManagement.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/KeyboardShortcuts', () => ({ useGlobalShortcuts: () => {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/businessUnitService', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deployStream: vi.fn(), deployAllStream: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import TenantMigrationManagement from './TenantMigrationManagement';
import businessUnitService from '../services/businessUnitService';
import tenantMigrationService from '../services/tenantMigrationService';
import { useAuth } from '../context/AuthContext';

const BUS = [
  { id: 'b1', code: 'BU01', name: 'Hotel One', is_active: true },
  { id: 'b2', code: 'BU02', name: 'Hotel Two', is_active: true },
];

const renderPage = () => render(<MemoryRouter><TenantMigrationManagement /></MemoryRouter>);

describe('TenantMigrationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
    vi.mocked(businessUnitService.getAll).mockResolvedValue({ data: BUS } as never);
  });

  it('renders a row per BU with Unknown status and does NOT fetch status on load', async () => {
    renderPage();
    expect(await screen.findByText('BU01')).toBeInTheDocument();
    expect(screen.getByText('Hotel Two')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('Not checked').length).toBeGreaterThanOrEqual(2);
    expect(tenantMigrationService.getStatus).not.toHaveBeenCalled();
  });

  it('shows an Export button once BUs are loaded', async () => {
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /export/i })).toBeEnabled();
  });

  it('Check all fetches status for every BU and updates badges + summary', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.getStatus).mockImplementation(async (id: string) =>
      id === 'b1'
        ? ({ bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never)
        : ({ bu_id: 'b2', bu_code: 'BU02', up_to_date: false, has_pending: true, pending: ['m1', 'm2'], raw: '' } as never),
    );
    renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getByRole('button', { name: /check all/i }));

    expect(await screen.findByText('2 behind')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('In sync').length).toBeGreaterThanOrEqual(1);
    expect(tenantMigrationService.getStatus).toHaveBeenCalledTimes(2);
  });

  it('per-row Check fetches just that BU', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.getStatus).mockResolvedValue(
      { bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never,
    );
    renderPage();
    await screen.findByText('BU01');
    const checkButtons = screen.getAllByRole('button', { name: /^check$/i });
    await user.click(checkButtons[0]);
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('In sync')).toBeInTheDocument());
    expect(tenantMigrationService.getStatus).toHaveBeenCalledTimes(1);
  });

  it('per-row Apply streams progress then re-checks the row', async () => {
    const user = userEvent.setup();
    // first check → pending; after deploy re-check → up to date
    vi.mocked(tenantMigrationService.getStatus)
      .mockResolvedValueOnce({ bu_id: 'b1', bu_code: 'BU01', up_to_date: false, has_pending: true, pending: ['m1', 'm2'], raw: '' } as never)
      .mockResolvedValue({ bu_id: 'b1', bu_code: 'BU01', up_to_date: true, has_pending: false, pending: [], raw: '' } as never);
    vi.mocked(tenantMigrationService.deployStream).mockImplementation(async (_id, onEvent) => {
      onEvent({ type: 'start', bu_id: 'b1', bu_code: 'BU01', total: 2 });
      onEvent({ type: 'applying', bu_id: 'b1', bu_code: 'BU01', name: 'm1', index: 1, total: 2 });
      onEvent({ type: 'applying', bu_id: 'b1', bu_code: 'BU01', name: 'm2', index: 2, total: 2 });
      return { bu_id: 'b1', bu_code: 'BU01', success: true, already_up_to_date: false, applied_migrations: ['m1', 'm2'] } as never;
    });

    renderPage();
    await screen.findByText('BU01');
    const checkButtons = screen.getAllByRole('button', { name: /^check$/i });
    await user.click(checkButtons[0]);                                  // → pending, Apply appears
    await user.click(await screen.findByRole('button', { name: /^apply$/i }));
    await user.click(await screen.findByRole('button', { name: /apply migrations/i })); // confirm

    expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('b1', expect.any(Function), expect.any(AbortSignal));
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('In sync')).toBeInTheDocument());
  });

  it('Deploy all streams batch events, flips rows live, and toasts the summary', async () => {
    const user = userEvent.setup();
    vi.mocked(tenantMigrationService.deployAllStream).mockImplementation(async (onEvent) => {
      onEvent({ type: 'start', bu_id: 'all', bu_code: 'ALL', total: 2 });
      onEvent({ type: 'bu-complete', bu_id: 'b1', bu_code: 'BU01', success: true, applied: ['m1'], already_up_to_date: false });
      onEvent({ type: 'bu-complete', bu_id: 'b2', bu_code: 'BU02', success: true, applied: [], already_up_to_date: true });
      return { total: 2, succeeded: 2, failed: 0, results: [] } as never;
    });

    renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getByRole('button', { name: /deploy all/i }));            // header button
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^deploy all$/i })); // confirm (dialog)

    // both rows flip to in sync from the bu-complete events
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByText('In sync')).toHaveLength(2));
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Deployed: 2 ok, 0 failed.');
  });

  // This does NOT prove the migration is cancelled on the server — it isn't (see the doc
  // comment on tenantMigrationService._streamDeploy: the micro-business handler is explicitly
  // designed to keep running `prisma migrate deploy` to completion after a client disconnect).
  // It proves the client stops waiting / holding the fetch open when the page is left mid-apply,
  // which is the honest scope of what an AbortController can do here — no user-facing Cancel is
  // shipped because one would lie about stopping an irreversible schema migration.
  it('aborts the in-flight per-row deploy stream request on unmount (client-side only — the migration itself keeps running)', async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(tenantMigrationService.getStatus).mockResolvedValue(
      { bu_id: 'b1', bu_code: 'BU01', up_to_date: false, has_pending: true, pending: ['m1'], raw: '' } as never,
    );
    vi.mocked(tenantMigrationService.deployStream).mockImplementation(
      (_id, _onEvent, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }) as never,
    );

    const { unmount } = renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getAllByRole('button', { name: /^check$/i })[0]);
    await screen.findByText('1 behind');
    await user.click(await screen.findByRole('button', { name: /^apply$/i }));
    await user.click(await screen.findByRole('button', { name: /apply migrations/i }));

    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('aborts the in-flight Deploy all stream request on unmount (client-side only — the BU mid-migration keeps running)', async () => {
    const user = userEvent.setup();
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(tenantMigrationService.deployAllStream).mockImplementation(
      (_onEvent, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }) as never,
    );

    const { unmount } = renderPage();
    await screen.findByText('BU01');
    await user.click(screen.getByRole('button', { name: /deploy all/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^deploy all$/i }));

    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('disables all action buttons for a non-super-admin', async () => {
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: false } as never);
    renderPage();
    await screen.findByText('BU01');
    expect(screen.getByRole('button', { name: /check all/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deploy all/i })).toBeDisabled();
    for (const btn of screen.getAllByRole('button', { name: /^check$/i })) {
      expect(btn).toBeDisabled();
    }
  });

  // Fix 1 (defence-in-depth): applyOne/deployAll now early-return `if (!isSuperAdmin) return;`
  // before ever calling the service. The disabled buttons already block a normal click (see
  // the test above), so to prove the *handler's own* guard — not just the disabled attribute
  // — is what stops the mutating call, these tests open the ConfirmDialog while isSuperAdmin
  // is still true (a real, reachable state), then flip isSuperAdmin to false and force a
  // re-render *before* clicking Confirm. The ConfirmDialog's own Confirm button is never
  // itself gated on isSuperAdmin, so this is the one path that reaches the handler without
  // going through a disabled DOM button — modelling a permission revoked mid-session (e.g. a
  // role change or token refresh) between opening the dialog and confirming it. This also
  // requires applyOne/deployAll's useCallback dependency arrays to include `isSuperAdmin`
  // (fixed alongside the guard) — otherwise the callback would close over the stale `true`
  // from when the dialog was opened and the guard would never see the revoked state.
  describe('handler-level super-admin guard (defence-in-depth)', () => {
    it('applyOne does NOT call deployStream if isSuperAdmin is revoked after the confirm dialog opens', async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
      vi.mocked(tenantMigrationService.getStatus).mockResolvedValue(
        { bu_id: 'b1', bu_code: 'BU01', up_to_date: false, has_pending: true, pending: ['m1', 'm2'], raw: '' } as never,
      );
      const { rerender } = renderPage();
      await screen.findByText('BU01');

      const checkButtons = screen.getAllByRole('button', { name: /^check$/i });
      await user.click(checkButtons[0]);
      await screen.findByText('2 behind');
      await user.click(await screen.findByRole('button', { name: /^apply$/i }));
      await screen.findByRole('dialog');

      vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: false } as never);
      rerender(<MemoryRouter><TenantMigrationManagement /></MemoryRouter>);

      await user.click(screen.getByRole('button', { name: /apply migrations/i }));

      expect(tenantMigrationService.deployStream).not.toHaveBeenCalled();
    });

    it('applyOne DOES call deployStream when isSuperAdmin stays true throughout (positive control)', async () => {
      const user = userEvent.setup();
      vi.mocked(tenantMigrationService.getStatus).mockResolvedValue(
        { bu_id: 'b1', bu_code: 'BU01', up_to_date: false, has_pending: true, pending: ['m1'], raw: '' } as never,
      );
      vi.mocked(tenantMigrationService.deployStream).mockResolvedValue(
        { bu_id: 'b1', bu_code: 'BU01', success: true, already_up_to_date: false, applied_migrations: ['m1'] } as never,
      );
      renderPage();
      await screen.findByText('BU01');

      await user.click(screen.getAllByRole('button', { name: /^check$/i })[0]);
      await screen.findByText('1 behind');
      await user.click(await screen.findByRole('button', { name: /^apply$/i }));
      await user.click(await screen.findByRole('button', { name: /apply migrations/i }));

      expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('b1', expect.any(Function), expect.any(AbortSignal));
    });

    it('deployAll does NOT call deployAllStream if isSuperAdmin is revoked after the confirm dialog opens', async () => {
      const user = userEvent.setup();
      vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
      const { rerender } = renderPage();
      await screen.findByText('BU01');

      await user.click(screen.getByRole('button', { name: /deploy all/i }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /^deploy all$/i })).toBeInTheDocument();

      vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: false } as never);
      rerender(<MemoryRouter><TenantMigrationManagement /></MemoryRouter>);

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^deploy all$/i }));

      expect(tenantMigrationService.deployAllStream).not.toHaveBeenCalled();
    });

    it('deployAll DOES call deployAllStream when isSuperAdmin stays true throughout (positive control)', async () => {
      const user = userEvent.setup();
      vi.mocked(tenantMigrationService.deployAllStream).mockResolvedValue(
        { total: 2, succeeded: 2, failed: 0, results: [] } as never,
      );
      renderPage();
      await screen.findByText('BU01');

      await user.click(screen.getByRole('button', { name: /deploy all/i }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^deploy all$/i }));

      expect(tenantMigrationService.deployAllStream).toHaveBeenCalled();
    });
  });
});

// Mirrors the clusters/business-units treatment: content-based layout, single-line
// Code + Name, and three frozen left columns (#, Code, Name).
describe('TenantMigrationManagement — table fit-content & sticky', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ isSuperAdmin: true } as never);
    vi.mocked(businessUnitService.getAll).mockResolvedValue({ data: BUS } as never);
  });

  it('uses content-based (table-auto) layout and freezes three left columns', async () => {
    const { container } = renderPage();
    await screen.findByText('BU01');

    const table = container.querySelector('table');
    expect(table?.className).toContain('table-auto');
    expect(table?.className).toContain('table-sticky-left-3');
  });

  it('renders the Code link single-line (whitespace-nowrap)', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'BU01' });
    expect(link.className).toContain('whitespace-nowrap');
  });

  it('renders the Name single-line (whitespace-nowrap)', async () => {
    renderPage();

    const name = await screen.findByText('Hotel One');
    expect(name.className).toContain('whitespace-nowrap');
  });
});
