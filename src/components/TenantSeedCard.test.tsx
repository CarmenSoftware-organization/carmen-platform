import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('renders a checkbox per set (default checked) and counts selected missing', async () => {
    svc.getStatus.mockResolvedValue({
      bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
      sets: [
        { key: 'running-code', label: 'Running codes', defined: 14, present: 12, missing: ['PRODUCT', 'PRICE-LIST'] },
        { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
      ],
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // both sets checked by default -> 2 + 3 = 5 missing
    expect(await screen.findByRole('button', { name: /seed 5 row/i })).toBeEnabled();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    // uncheck the currencies set -> only running-code's 2 remain
    await userEvent.click(boxes[1]);
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

  it('seeds only the selected sets', async () => {
    svc.getStatus
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [
          { key: 'running-code', label: 'Running codes', defined: 14, present: 13, missing: ['PRODUCT'] },
          { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
        ],
      })
      .mockResolvedValueOnce({
        bu_id: 'bu-1', bu_code: 'ZEBRA', all_seeded: false,
        sets: [
          { key: 'running-code', label: 'Running codes', defined: 14, present: 14, missing: [] },
          { key: 'currencies', label: 'Currencies', defined: 3, present: 0, missing: ['USD', 'THB', 'EUR'] },
        ],
      });
    svc.deployStream.mockImplementation(async (_buId: string, onEvent: (e: SeedProgressEvent) => void) => {
      onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'ZEBRA', total: 1 });
      onEvent({ type: 'seeding', bu_id: 'bu-1', bu_code: 'ZEBRA', key: 'running-code', row_type: 'PRODUCT', index: 1, total: 1 });
      return { bu_id: 'bu-1', bu_code: 'ZEBRA', created: 1, skipped: 13 };
    });
    render(<TenantSeedCard {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    // uncheck currencies (2nd box), keep running-code
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[1]);
    await userEvent.click(await screen.findByRole('button', { name: /seed 1 row/i }));
    await userEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /^seed$/i }));
    await waitFor(() =>
      expect(svc.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function), ['running-code']),
    );
  });

  it('disables actions and shows a reason when not super-admin', () => {
    render(<TenantSeedCard {...baseProps} isSuperAdmin={false} />);
    expect(screen.getByRole('button', { name: /check status/i })).toBeDisabled();
  });
});
