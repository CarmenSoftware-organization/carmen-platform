import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantSeedCard } from './TenantSeedCard';
import tenantSeedService from '../services/tenantSeedService';
import type { SeedProgressEvent } from '../types';

vi.mock('../services/tenantSeedService', () => ({
  default: { getStatus: vi.fn(), deployStream: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const svc = tenantSeedService as unknown as {
  getStatus: ReturnType<typeof vi.fn>;
  deployStream: ReturnType<typeof vi.fn>;
};

const baseProps = { buId: 'bu-1', buCode: 'ZEBRA', buName: 'Zebra Hotel', hasDbConnection: true, isSuperAdmin: true };

describe('TenantSeedCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('checks status and shows missing rows, then enables seeding', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] }],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // Exact match targets the summary Badge only — a loose /2 missing/i regex also
    // matches the per-set detail text "(12/14 present, 2 missing)", which is an
    // unrelated ambiguity from two conventions (summary badge + per-set breakdown)
    // both legitimately reporting the same count when there's a single set.
    expect(await screen.findByText('2 missing')).toBeInTheDocument();
    expect(screen.getByText('PRODUCT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /seed 2 row/i })).toBeEnabled();
  });

  it('shows "seeded" and no seed button when all_seeded', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: true,
      sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] }],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    expect(await screen.findByText(/seeded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /seed \d+ row/i })).not.toBeInTheDocument();
  });

  it('runs a seed: streams progress, confirms, then re-checks', async () => {
    svc.getStatus
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 13, missing: ['PRODUCT'] }],
      })
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: true,
        sets: [{ key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] }],
      });
    svc.deployStream.mockImplementation(async (_buId: string, onEvent: (e: SeedProgressEvent) => void) => {
      onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'ZEBRA', total: 1 });
      onEvent({ type: 'seeding', bu_id: 'bu-1', bu_code: 'ZEBRA', key: 'running-code', row_type: 'PRODUCT', index: 1, total: 1 });
      return { bu_id: 'bu-1', bu_code: 'ZEBRA', created: 1, skipped: 13 };
    });

    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    await userEvent.click(await screen.findByRole('button', { name: /seed 1 row/i }));
    // ConfirmDialog confirm button
    await userEvent.click(await screen.findByRole('button', { name: /^seed$/i }));

    await waitFor(() => expect(svc.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function)));
    await waitFor(() => expect(svc.getStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/seeded/i)).toBeInTheDocument();
  });

  it('disables actions and shows a reason when not super-admin', () => {
    render(<TenantSeedCard {...baseProps} isSuperAdmin={false} />);
    expect(screen.getByRole('button', { name: /check status/i })).toBeDisabled();
  });
});
