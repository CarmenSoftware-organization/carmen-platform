import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailSettingManagement from './EmailSettingManagement';
import emailSettingService from '../services/emailSettingService';
import type { EmailSetting } from '../types';

// vi.hoisted is REQUIRED: vi.mock is hoisted above const declarations, so a plain
// `const toast = {...}` throws "Cannot access 'toast' before initialization".
// This matches the existing pattern in BroadcastCompose.test.tsx:34 and others.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// vi.hoisted for the same reason as `toast` above — vi.mock is hoisted above consts.
const auth = vi.hoisted(() => ({
  hasPermission: (() => true) as (perm: string) => boolean,
  user: { email: 'admin@carmen.io' } as { email?: string } | null,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('../services/emailSettingService', () => ({
  default: { getAll: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), sendTest: vi.fn() },
}));

// การ์ด mapping อ่าน platform config ตอน mount — mock ไว้ให้คืน routing ที่ชี้โปรไฟล์แรก
// The routing card reads platform config on mount.
vi.mock('../services/platformConfigService', () => ({
  default: {
    getByKey: vi.fn().mockResolvedValue({ key: 'email_routing', value: { default: 's1' } }),
    update: vi.fn().mockResolvedValue({}),
  },
}));

const svc = emailSettingService as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const noReply: EmailSetting = {
  id: 's1',
  doc_version: 2,
  name: 'No-reply',
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

const support: EmailSetting = {
  id: 's2',
  doc_version: 1,
  name: 'Support',
  from_email: 'support@carmen.io',
  from_name: 'Carmen Support',
  smtp_host: 'smtp.sendgrid.net',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: 'apikey',
  smtp_password: '••••••',
  is_active: true,
  note: null,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <EmailSettingManagement />
    </MemoryRouter>,
  );

describe('EmailSettingManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.hasPermission = () => true;
    auth.user = { email: 'admin@carmen.io' };
  });

  it('renders one card per stored profile, plus the routing card', async () => {
    svc.getAll.mockResolvedValue({ data: [noReply, support] });
    renderPage();
    expect(await screen.findByText('No-reply')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Email routing')).toBeInTheDocument();
    // โปรไฟล์เป็นรายการหลักแล้ว — ไม่มีการ์ด "ยังไม่ตั้งค่า" ของ purpose ที่ยังไม่มีแถวอีกต่อไป
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('shows the data but no mutating controls without the manage permission', async () => {
    auth.hasPermission = (perm) => perm === 'email_setting.read';
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    expect(await screen.findByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send test email' })).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a retry affordance', async () => {
    svc.getAll.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks before abandoning unsaved edits when another card is opened', async () => {
    const user = userEvent.setup();
    // ต้องมีสองโปรไฟล์ เพราะการ์ดที่ยังไม่ตั้งค่าไม่มีอยู่ในโมเดลใหม่แล้ว การสลับจึงเป็นการกด Edit
    // ของอีกโปรไฟล์หนึ่ง / Two profiles: switching now means opening another profile's Edit.
    svc.getAll.mockResolvedValue({ data: [noReply, support] });
    renderPage();
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'changed');
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText(/Discard unsaved changes/)).toBeInTheDocument();
  });

  it('reloads and stays in edit mode when the save hits a version conflict', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply] });
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'changed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.getAll).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // This is the test that pins the `key={`${meta.value}-${setting?.doc_version ?? 'new'}`}`
  // mechanism on EmailSettingCard in EmailSettingManagement.tsx. EmailSettingCard seeds its
  // `formData` with a `useState` initializer that runs once per mount and never resyncs when
  // the `setting` prop changes later. Without a doc_version-based key, a 409 recovery
  // (onSaved({ keepEditing: true }) -> page refetches -> setting prop changes) would NOT
  // remount the card, so the typed-but-unsaved value would survive the "reload latest" step
  // and the next Save would silently overwrite whoever saved first. This test proves the
  // reload actually replaces the on-screen value with the server's fresh data, not just that
  // getAll was called twice.
  it('replaces the unsaved input with the server value after a 409 reload (proves the doc_version remount key)', async () => {
    const user = userEvent.setup();
    svc.getAll
      .mockResolvedValueOnce({ data: [noReply] })
      .mockResolvedValueOnce({ data: [{ ...noReply, doc_version: 3, from_name: 'ServerWon' }] });
    svc.update.mockRejectedValue({
      response: { status: 409, data: { message: 'Record was modified by another request' } },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'MINE');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.getAll).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText('From name')).toHaveValue('ServerWon'),
    );
    expect(screen.queryByDisplayValue('MINE')).not.toBeInTheDocument();
  });

  // Pins the purpose-currying fix in `handleSaved` (EmailSettingManagement.tsx). `onSaved`
  // is the SAME callback instance handed to every card, so without currying the purpose in,
  // the page cannot tell which card called it — an Unset on an unrelated, non-editing card
  // would clear `editingPurpose` unconditionally and remount (and thus silently discard) a
  // different card's in-progress edit, bypassing the "discard unsaved edits?" guard entirely.
  // Reproduces the reviewer's exact scenario: two configured profiles, edit the first and
  // type into it, unset the SECOND (unrelated) one and confirm, then assert the first card's
  // typed value is still on screen and it is still in edit mode.
  it('keeps an unrelated card\'s unsaved edit intact when a different card is unset', async () => {
    const user = userEvent.setup();
    svc.getAll
      .mockResolvedValueOnce({ data: [noReply, support] })
      .mockResolvedValueOnce({ data: [noReply] });
    svc.remove.mockResolvedValue({});
    renderPage();

    // Edit the first card (No-reply) and type an unsaved change.
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'UnsavedNoReplyEdit');

    // Unset the second, unrelated card (Support) and confirm.
    await user.click(screen.getByRole('button', { name: 'Clear setting' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear setting' }));

    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('s2'));
    await waitFor(() => expect(svc.getAll).toHaveBeenCalledTimes(2));

    // The No-reply card's unsaved edit must survive, and it must still be in edit mode.
    expect(screen.getByLabelText('From name')).toHaveValue('UnsavedNoReplyEdit');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  // F1 (final-fix-report.md) — EmailSettingCard never unmounts when the page switches
  // editingPurpose away from it (only PasswordField does, since it's conditionally
  // rendered inside `isEditing && canManage`). Without a reset keyed off leaving edit
  // mode, the card's `password` state from an abandoned edit survives silently and gets
  // written into the NEXT save's payload, even though the admin explicitly discarded it
  // and the UI shows a fresh, untouched PasswordField. Reproduces the reviewer's exact
  // sequence: type a password into No-reply, switch to Support confirming the discard
  // prompt, switch back to No-reply confirming discard again, then Save without touching
  // the password field — the payload must carry no smtp_password key at all.
  it('F1: does not resurrect an abandoned SMTP password on the next save', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply, support] });
    svc.update.mockResolvedValue({ data: { id: 's1' } });
    renderPage();

    // Edit No-reply, open the password field, type a new password — then never save it.
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'abandoned-secret');

    // Switch to Support, confirming the "discard unsaved edits?" prompt.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    // Switch back to No-reply, confirming discard again — matching the reviewer's repro.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    // Save without ever reopening the password field — the abandoned password must not ride along.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.update).toHaveBeenCalled());
    expect(svc.update.mock.calls[0][1]).not.toHaveProperty('smtp_password');
  });

  // F3 (final-fix-report.md) — same root cause as F1: `formData` is seeded once by a
  // `useState` initializer that never resyncs when the card leaves edit mode without
  // remounting. Confirming "ทิ้งการแก้ไข" LOOKS like it discards the edit (the page moves
  // editingPurpose away) but the typed value is still sitting in the card's state, so
  // re-entering the same card shows the abandoned text instead of the server's value.
  it('F3: shows the server value in From name after a discarded switch-away and back, not the abandoned typed value', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply, support] });
    renderPage();

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'DISCARDED');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByLabelText('From name')).toHaveValue(noReply.from_name);
  });

  // F2 (final-fix-report.md) — the "discard unsaved edits?" prompt is a page-owned Radix
  // dialog; it does not stop propagation of the window-level Escape listener that
  // useGlobalShortcuts registers for the card underneath it. Without shortcutsEnabled
  // gating, Escape — meant only to dismiss the prompt — also fires the card's onCancel
  // and destroys exactly the draft the prompt exists to protect.
  it('F2: Escape on the discard-unsaved-edits prompt does not cancel the edit underneath it', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply, support] });
    renderPage();

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'STILL-TYPING');

    // Open the discard prompt but do not confirm it.
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    // The underlying editor must still be open, with the typed value intact.
    expect(screen.getByLabelText('From name')).toHaveValue('STILL-TYPING');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
