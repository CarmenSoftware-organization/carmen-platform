import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deploy: vi.fn(), deployStream: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import TenantMigrationCard from './TenantMigrationCard';
import tenantMigrationService from '../services/tenantMigrationService';

const PENDING = [
  '20260318094751_add_product_name_sku_localname',
  '20260319053650_change_name_poolable_to_portable',
  '20260323072913_add_po_type',
];

const renderCard = () =>
  render(
    <TenantMigrationCard
      buId="bu-1"
      buCode="CARMEN-AVG"
      buName="Carmen AVG"
      hasDbConnection
      isSuperAdmin
    />,
  );

describe('TenantMigrationCard', () => {
  beforeEach(() => {
    vi.mocked(tenantMigrationService.getStatus).mockResolvedValue({
      up_to_date: false,
      has_pending: true,
      pending: PENDING,
      raw: '',
    } as never);
  });

  it('lists the pending migrations in the card body after a status check', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: /check status/i }));
    expect(await screen.findByText(PENDING[0])).toBeInTheDocument();
  });

  it('confirm dialog shows the count but does NOT dump the full pending list', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: /check status/i }));
    await user.click(await screen.findByRole('button', { name: /apply 3 migration/i }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Apply 3 pending migration\(s\) to Carmen AVG \(CARMEN-AVG\)/i),
    ).toBeInTheDocument();
    // The migration names overflow the dialog — they belong in the card body, not
    // the confirm description. None of them should appear inside the dialog.
    for (const name of PENDING) {
      expect(within(dialog).queryByText(new RegExp(name))).not.toBeInTheDocument();
    }
  });

  it('renders a progress bar and live log from streamed events, then finalizes', async () => {
    const user = userEvent.setup();
    // drive deployStream by invoking onEvent synchronously, then resolving with a summary
    vi.mocked(tenantMigrationService.deployStream).mockImplementation(async (_buId, onEvent) => {
      onEvent({ type: 'start', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', total: 3 });
      onEvent({ type: 'applying', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', name: PENDING[0], index: 1, total: 3 });
      onEvent({ type: 'applying', bu_id: 'bu-1', bu_code: 'CARMEN-AVG', name: PENDING[1], index: 2, total: 3 });
      return { bu_id: 'bu-1', bu_code: 'CARMEN-AVG', success: true, already_up_to_date: false, applied_migrations: PENDING.slice(0, 2) };
    });

    renderCard();
    await user.click(screen.getByRole('button', { name: /check status/i }));
    await user.click(await screen.findByRole('button', { name: /apply 3 migration/i }));
    await user.click(await screen.findByRole('button', { name: /apply migrations/i })); // confirm dialog

    // progress bar reflects applied/total and the live log shows applied names
    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText(PENDING[0])).toBeInTheDocument();
    expect(tenantMigrationService.deployStream).toHaveBeenCalledWith('bu-1', expect.any(Function));
  });
});
