import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserOption } from '../../types';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// Matches the pattern in EmailSettingManagement.test.tsx / TestEmailDialog.test.tsx.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../../services/userPlatformService', () => ({
  default: { assignBulk: vi.fn() },
}));
vi.mock('../../services/roleService', () => ({
  default: { getAll: vi.fn() },
}));
vi.mock('../../services/clusterService', () => ({
  default: { getAll: vi.fn() },
}));

// Stubbed as a single button: the picker's own search/typeahead behavior is
// UserPicker's responsibility (covered by its own tests) — this dialog only needs
// to prove it wires the selected UserOption through to the submit payload.
const fixedUser: UserOption = { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' };
vi.mock('../../components/UserPicker', () => ({
  UserPicker: ({ onChange }: { onChange: (next: UserOption | null) => void }) => (
    <button type="button" onClick={() => onChange(fixedUser)}>
      Pick Jane
    </button>
  ),
}));

import { GrantAccessDialog } from './GrantAccessDialog';
import userPlatformService from '../../services/userPlatformService';
import roleService from '../../services/roleService';
import clusterService from '../../services/clusterService';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const roleOptions = [
  { id: 'role-1', name: 'Platform Admin' },
  { id: 'role-2', name: 'Viewer' },
];
const clusterOptions = [{ id: 'cluster-1', name: 'Cluster One' }];

const renderDialog = () => {
  const onOpenChange = vi.fn();
  const onGranted = vi.fn();
  render(<GrantAccessDialog open onOpenChange={onOpenChange} onGranted={onGranted} />);
  return { onOpenChange, onGranted };
};

// Both role and cluster options must be loaded (the dialog's `open` effect fetches
// them asynchronously) before a test interacts with the role list or scope select.
const waitForOptionsLoaded = async () => {
  await screen.findByText('Platform Admin');
  await screen.findByText('Viewer');
};

const pickUser = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Pick Jane' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  asMock(roleService.getAll).mockResolvedValue({ data: roleOptions });
  asMock(clusterService.getAll).mockResolvedValue({ data: clusterOptions });
});

describe('GrantAccessDialog', () => {
  it('shows an error and never calls assignBulk when no user is selected', async () => {
    const user = userEvent.setup();
    const { onGranted } = renderDialog();
    await waitForOptionsLoaded();

    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    expect(toast.error).toHaveBeenCalledWith('Select a user');
    expect(userPlatformService.assignBulk).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('shows an error and never calls assignBulk when a user is picked but no role is checked', async () => {
    const user = userEvent.setup();
    const { onGranted } = renderDialog();
    await waitForOptionsLoaded();

    await pickUser(user);
    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    expect(toast.error).toHaveBeenCalledWith('Select at least one role');
    expect(userPlatformService.assignBulk).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('blocks submission when "A specific cluster" is chosen but no cluster is picked', async () => {
    const user = userEvent.setup();
    const { onGranted } = renderDialog();
    await waitForOptionsLoaded();

    await pickUser(user);
    await user.click(screen.getByRole('checkbox', { name: 'Platform Admin' }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'A specific cluster');
    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    expect(toast.error).toHaveBeenCalledWith('Select a cluster');
    expect(userPlatformService.assignBulk).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('calls assignBulk with every checked role id and the shared scope, then onGranted, on success', async () => {
    const user = userEvent.setup();
    asMock(userPlatformService.assignBulk).mockResolvedValue({});
    const { onGranted, onOpenChange } = renderDialog();
    await waitForOptionsLoaded();

    await pickUser(user);
    await user.click(screen.getByRole('checkbox', { name: 'Platform Admin' }));
    await user.click(screen.getByRole('checkbox', { name: 'Viewer' }));
    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    await waitFor(() =>
      expect(userPlatformService.assignBulk).toHaveBeenCalledWith('user-1', {
        role_ids: ['role-1', 'role-2'],
        scope: { type: 'platform' },
      }),
    );
    expect(onGranted).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it('sends a cluster scope when "A specific cluster" is chosen and a cluster is picked', async () => {
    const user = userEvent.setup();
    asMock(userPlatformService.assignBulk).mockResolvedValue({});
    renderDialog();
    await waitForOptionsLoaded();

    await pickUser(user);
    await user.click(screen.getByRole('checkbox', { name: 'Platform Admin' }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'A specific cluster');
    await user.selectOptions(screen.getByLabelText('Cluster'), 'Cluster One');
    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    await waitFor(() =>
      expect(userPlatformService.assignBulk).toHaveBeenCalledWith('user-1', {
        role_ids: ['role-1'],
        scope: { type: 'cluster', cluster_id: 'cluster-1' },
      }),
    );
  });

  it('on 409, leaves the dialog open, marks the conflicting role, and never calls onGranted — nothing was written', async () => {
    const user = userEvent.setup();
    asMock(userPlatformService.assignBulk).mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Role Viewer is already assigned at this scope' },
      },
    });
    const { onGranted, onOpenChange } = renderDialog();
    await waitForOptionsLoaded();

    await pickUser(user);
    // Captured before submission: once the 409 flags the role, the label's accessible
    // name gains the "Already granted" text, so re-querying by name: 'Viewer' afterward
    // would no longer match — the stored element reference is what stays valid.
    const viewerCheckbox = screen.getByRole('checkbox', { name: 'Viewer' });
    await user.click(viewerCheckbox);
    await user.click(screen.getByRole('button', { name: /Grant access/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());

    // Nothing was written, so the dialog stays open with everything the user
    // typed still intact — the conflicting role is flagged, not cleared.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onGranted).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Already granted')).toBeInTheDocument();
    expect(viewerCheckbox).toBeChecked();
    expect(screen.getByText('Grant platform access')).toBeInTheDocument();
  });

  // pickerOpenRef itself cannot be asserted on directly here: it is a private ref with
  // no independent DOM-observable effect — it only gates Radix's Escape-key dismissal
  // (`onEscapeKeyDown` on DialogContent), and that dismissal path does not fire under
  // jsdom in this suite at all, even for a dialog that never touched the picker (a
  // fresh-dialog `user.keyboard('{Escape}')` control case was tried and also failed to
  // close). So an Escape-based test here would pass or fail for reasons unrelated to the
  // fix. What IS honestly testable: `pickerOpenRef.current = false` sits in the same
  // `[open]` effect, ahead of the same unconditional statements that reset `user` and
  // `selectedRoleIds` and refetch role/cluster options — so proving that effect body
  // re-executes on every reopen is the strongest available signal that the ref reset
  // line runs too.
  it('clears prior selections and refetches options on every reopen — the same effect that resets the Escape-key guard the picker owns', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onGranted = vi.fn();
    const { rerender } = render(
      <GrantAccessDialog open onOpenChange={onOpenChange} onGranted={onGranted} />,
    );
    await waitForOptionsLoaded();

    await pickUser(user);
    await user.click(screen.getByRole('checkbox', { name: 'Platform Admin' }));
    expect(screen.getByRole('checkbox', { name: 'Platform Admin' })).toBeChecked();

    // Simulate the dialog being closed by a path that never fires Radix's own
    // onOpenChange — exactly the documented failure mode (a controlled parent close,
    // not a user gesture the picker's own dropdown-close listeners would catch) —
    // then reopened.
    rerender(<GrantAccessDialog open={false} onOpenChange={onOpenChange} onGranted={onGranted} />);
    rerender(<GrantAccessDialog open onOpenChange={onOpenChange} onGranted={onGranted} />);
    await waitForOptionsLoaded();

    expect(screen.getByRole('checkbox', { name: 'Platform Admin' })).not.toBeChecked();
    expect(asMock(roleService.getAll)).toHaveBeenCalledTimes(2);
    expect(asMock(clusterService.getAll)).toHaveBeenCalledTimes(2);
  });
});
