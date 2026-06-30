import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/tenantMigrationService', () => ({
  default: { getStatus: vi.fn(), deploy: vi.fn() },
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
});
