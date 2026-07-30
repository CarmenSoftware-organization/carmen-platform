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

const baseProps = {
  purpose: 'no_reply' as const,
  label: 'No-reply',
  description: 'อีเมลอัตโนมัติ',
  inUse: true,
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
    expect(screen.getByText('ยังไม่ตั้งค่า')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ตั้งค่า' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
  });

  it('summarises a configured profile without revealing the password', () => {
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
    expect(screen.getByText('smtp.sendgrid.net:587')).toBeInTheDocument();
    expect(screen.queryByText(/hunter2|apikey-secret/)).not.toBeInTheDocument();
  });

  it('hides every mutating control when the user lacks manage permission', () => {
    render(<EmailSettingCard {...baseProps} canManage={false} setting={setting} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ยกเลิกการตั้งค่า' })).not.toBeInTheDocument();
    expect(screen.getByText(/no-reply@carmen\.io/)).toBeInTheDocument();
  });

  it('warns when no system sends through this purpose yet', () => {
    render(<EmailSettingCard {...baseProps} inUse={false} setting={null} />);
    expect(screen.getByText(/ยังไม่มีระบบไหนส่งอีเมลผ่านช่องทางนี้/)).toBeInTheDocument();
  });

  it('replaces the test button with an explanation while editing', () => {
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    expect(screen.queryByRole('button', { name: 'ส่งเมลทดสอบ' })).not.toBeInTheDocument();
    expect(screen.getByText('บันทึกก่อนจึงจะทดสอบได้')).toBeInTheDocument();
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

  it('blocks saving when the from address is not a valid email', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} isEditing setting={setting} />);
    await user.clear(screen.getByLabelText('From email'));
    await user.type(screen.getByLabelText('From email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(svc.update).not.toHaveBeenCalled();
    expect(await screen.findByText('Invalid email format')).toBeInTheDocument();
  });

  it('creates a new profile carrying the purpose and no doc_version', async () => {
    const user = userEvent.setup();
    svc.create.mockResolvedValue({ data: { id: 'new' } });
    render(<EmailSettingCard {...baseProps} isEditing setting={null} />);
    await user.type(screen.getByLabelText('From email'), 'no-reply@carmen.io');
    await user.type(screen.getByLabelText('SMTP host'), 'smtp.carmen.io');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(svc.create).toHaveBeenCalled());
    expect(svc.create.mock.calls[0][0]).toMatchObject({ purpose: 'no_reply' });
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

  it('explains the env fallback before unsetting a profile', async () => {
    const user = userEvent.setup();
    render(<EmailSettingCard {...baseProps} setting={setting} />);
    await user.click(screen.getByRole('button', { name: 'ยกเลิกการตั้งค่า' }));
    expect(await screen.findByText(/กลับไปใช้ค่า SMTP จาก environment/)).toBeInTheDocument();
  });
});
