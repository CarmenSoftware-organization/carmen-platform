import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailSettingCard } from './EmailSettingCard';
import emailSettingService from '../../services/emailSettingService';
import type { EmailSetting } from '../../types';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// This matches the existing pattern in BroadcastCompose.test.tsx:34 and others.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../services/emailSettingService', () => ({
  default: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), sendTest: vi.fn() },
}));

const svc = emailSettingService as unknown as {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const setting: EmailSetting = {
  id: 's1',
  doc_version: 3,
  name: 'no_reply',
  from_email: 'no-reply@carmen.io',
  from_name: 'Carmen',
  smtp_host: 'smtp.sendgrid.net',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: 'apikey',
  smtp_password: '••••••',
  is_active: true,
  note: null,
};

const baseProps = {
  profileKey: 'p-1',
  label: 'No-reply',
  description: 'อีเมลอัตโนมัติ',
  lane: null,
  canManage: true,
  isEditing: false,
  onRequestEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onSaved: vi.fn(),
};

describe('EmailSettingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unconfigured state with a setup button when there is no profile', () => {
    render(<EmailSettingCard {...baseProps} setting={null} />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument();
  });

  it('summarises a configured profile without revealing the password', () => {
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.getByText('smtp.sendgrid.net:587')).toBeInTheDocument();
    // The fixture's smtp_password is the actual API mask ('••••••') — assert that value
    // itself never renders as visible text, rather than matching against strings
    // (hunter2/apikey-secret) that appear nowhere in the fixture or component and so
    // could never make this assertion fail.
    expect(screen.queryByText(setting.smtp_password!)).not.toBeInTheDocument();
  });

  it('hides every mutating control when the user lacks manage permission', () => {
    render(<EmailSettingCard {...baseProps} canManage={false} setting={setting} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear setting' })).not.toBeInTheDocument();
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
  });

  it('renders no credential form body — nor Save/Cancel — when isEditing but the user lacks manage permission', () => {
    render(<EmailSettingCard {...baseProps} canManage={false} isEditing setting={setting} />);
    // The gate under test lives at the form-body block (`isEditing && canManage`), which is
    // a *different* condition from the one guarding the Save/Cancel buttons (`canManage`
    // alone, already true regardless of this fix). Asserting only Save/Cancel absence would
    // pass even if the form body were unconditionally rendered on `isEditing` — so assert the
    // credential inputs themselves are gone, which is the thing the fix actually controls.
    expect(screen.queryByLabelText('From email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SMTP host')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set password' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });


  it('replaces the test button with an explanation while editing', () => {
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument();
    expect(screen.getByText('Save before you can test')).toBeInTheDocument();
  });

  it('sends doc_version on update and reports success', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    const onSaved = vi.fn();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} onSaved={onSaved} />);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'Carmen Platform');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).toMatchObject({ doc_version: 3, from_name: 'Carmen Platform' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('omits smtp_password from the update payload when it was never touched', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'X');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).not.toHaveProperty('smtp_password');
  });

  it('sends the typed password on save when the password field was opened and filled in', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).toMatchObject({ smtp_password: 'hunter2' });
  });

  it('omits smtp_password from the update payload when the password field was opened then left blank', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'temporary');
    await user.clear(screen.getByLabelText('SMTP password'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).not.toHaveProperty('smtp_password');
  });

  it('blocks saving when the from address is not a valid email', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('From email'));
    await user.type(screen.getByLabelText('From email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(svc.update).not.toHaveBeenCalled();
    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
  });

  it('blocks saving when the SMTP port is out of range', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('SMTP port'));
    await user.type(screen.getByLabelText('SMTP port'), '99999');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(svc.update).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Port must be a whole number between 1 and 65535'),
    ).toBeInTheDocument();
  });

  it('creates a new profile carrying its name and no doc_version', async () => {
    const user = userEvent.setup();
    svc.create.mockResolvedValue({ data: { id: 'new' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={null} />);
    await user.type(screen.getByLabelText('Profile name'), 'No-reply');
    await user.type(screen.getByLabelText('From email'), 'no-reply@carmen.io');
    await user.type(screen.getByLabelText('SMTP host'), 'smtp.carmen.io');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.create).toHaveBeenCalled());
    expect(svc.create.mock.calls[0][0]).toMatchObject({ name: 'No-reply' });
    expect(svc.create.mock.calls[0][0]).not.toHaveProperty('doc_version');
  });

  it('saves on Ctrl+S while editing', async () => {
    const user = userEvent.setup();
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
  });

  it('does not hijack Ctrl+S when this card is not the one being edited', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing={false} setting={setting} />);
    await user.keyboard('{Control>}s{/Control}');
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('asks the page to reload but keep editing when the save hits a version conflict', async () => {
    const user = userEvent.setup();
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    const onSaved = vi.fn();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ keepEditing: true }));
  });

  it('shows the canonical version-conflict toast when the save hits a 409', async () => {
    const user = userEvent.setup();
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // notifyVersionConflict() (src/utils/docVersion.ts) is the single canonical conflict
    // toast — assert through the already-mocked `sonner` toast rather than mocking
    // docVersion itself, matching this file's existing style of asserting on `toast`.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This record was changed by someone else',
        expect.objectContaining({
          description: 'Reloading the latest version. Please re-apply your changes.',
        }),
      ),
    );
  });

  it('explains the env fallback before unsetting a profile', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'Clear setting' }));
    expect(await screen.findByText(/falls back to the SMTP values from the server environment/)).toBeInTheDocument();
  });
});
