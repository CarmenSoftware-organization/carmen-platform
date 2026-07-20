import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UsersSection } from './UsersSection';
import type { ClusterUser, BusinessUnit } from '../../../types';

const users: ClusterUser[] = [
  { id: 'cu1', user_id: 'u1', email: 'jane@x.com', role: 'admin', is_active: true, userInfo: { firstname: 'Jane', lastname: 'Doe' } },
  { id: 'cu2', user_id: 'u2', email: 'bob@x.com', role: 'user', is_active: false, userInfo: { firstname: 'Bob', lastname: 'Roe' } },
];
const bus: BusinessUnit[] = [{ id: 'b1', code: 'HQ', name: 'Head Office', is_active: true }];

function renderSection(extra?: Partial<React.ComponentProps<typeof UsersSection>>) {
  return render(
    <UsersSection
      users={users} businessUnits={bus} loading={false} canEdit
      onRefresh={() => {}} onAddUser={() => {}}
      onUpdateUser={vi.fn().mockResolvedValue(undefined)}
      onRemoveUser={vi.fn().mockResolvedValue(undefined)}
      onBulkRemove={vi.fn().mockResolvedValue(undefined)}
      onBulkMoveBu={vi.fn().mockResolvedValue(undefined)}
      {...extra}
    />,
  );
}

describe('UsersSection', () => {
  it('searches by name', async () => {
    renderSection();
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'jane');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Bob Roe')).toBeNull();
  });

  it('selecting a row reveals the bulk bar and remove fires onBulkRemove', async () => {
    const onBulkRemove = vi.fn().mockResolvedValue(undefined);
    renderSection({ onBulkRemove });
    await userEvent.click(screen.getByRole('checkbox', { name: /select jane doe/i }));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    // BulkActionBar "Remove" opens the confirm dialog
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    expect(onBulkRemove).toHaveBeenCalledWith(['cu1']);
  });

  it('hides checkboxes and inline editors when canEdit is false', () => {
    renderSection({ canEdit: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
    // role shows as plain badge text, not an editable trigger
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});
