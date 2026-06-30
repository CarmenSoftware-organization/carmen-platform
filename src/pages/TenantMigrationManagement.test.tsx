// src/pages/TenantMigrationManagement.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(2);
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

    expect(await screen.findByText('Up to date')).toBeInTheDocument();
    expect(await screen.findByText('2 pending')).toBeInTheDocument();
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
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
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

    expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('b1', expect.any(Function));
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
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

    // both rows flip to up to date from the bu-complete events
    expect(await screen.findAllByText('Up to date')).toHaveLength(2);
    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Deployed: 2 ok, 0 failed.');
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
});
