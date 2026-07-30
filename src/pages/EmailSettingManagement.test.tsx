import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const svc = emailSettingService as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const noReply: EmailSetting = {
  id: 's1',
  doc_version: 2,
  purpose: 'no_reply',
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

  it('renders a card for every purpose even when the API returns only one', async () => {
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    expect(await screen.findByText('No-reply')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getAllByText('ยังไม่ตั้งค่า')).toHaveLength(2);
  });

  it('shows the data but no mutating controls without the manage permission', async () => {
    auth.hasPermission = (perm) => perm === 'email_setting.read';
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    expect(await screen.findByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
  });

  it('surfaces a load failure with a retry affordance', async () => {
    svc.getAll.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks before abandoning unsaved edits when another card is opened', async () => {
    const user = userEvent.setup();
    svc.getAll.mockResolvedValue({ data: [noReply] });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('From name'));
    await user.type(screen.getByLabelText('From name'), 'changed');
    await user.click(screen.getAllByRole('button', { name: 'ตั้งค่า' })[0]);
    expect(await screen.findByText(/ทิ้งการแก้ไขที่ยังไม่บันทึก/)).toBeInTheDocument();
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
});
