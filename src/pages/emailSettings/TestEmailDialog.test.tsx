import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestEmailDialog } from './TestEmailDialog';
import emailSettingService from '../../services/emailSettingService';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../services/emailSettingService', () => ({
  default: { sendTest: vi.fn() },
}));

const mockSendTest = emailSettingService.sendTest as unknown as ReturnType<typeof vi.fn>;

describe('TestEmailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the recipient when the caller has an email-shaped identity', () => {
    render(
      <TestEmailDialog open settingId="s1" defaultTo="admin@carmen.io" onOpenChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('ผู้รับ')).toHaveValue('admin@carmen.io');
  });

  it('leaves the recipient blank when the identity is a username, not an email', () => {
    render(<TestEmailDialog open settingId="s1" defaultTo="samutpra" onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('ผู้รับ')).toHaveValue('');
  });

  it('reports success with the address it was sent to', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: true });
    render(
      <TestEmailDialog open settingId="s1" defaultTo="admin@carmen.io" onOpenChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(mockSendTest).toHaveBeenCalledWith('s1', 'admin@carmen.io'));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('admin@carmen.io'),
    );
  });

  it('turns a decrypt-failed reason into an actionable message, not the raw code', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: false, reason: 'decrypt-failed' });
    render(<TestEmailDialog open settingId="s1" defaultTo="" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const message = toast.error.mock.calls[0][0] as string;
    expect(message).toContain('SECRET_ENCRYPTION_KEY');
    expect(message).not.toBe('decrypt-failed');
  });

  it('explains an smtp-error in terms of what to check', async () => {
    const user = userEvent.setup();
    mockSendTest.mockResolvedValue({ sent: false, reason: 'smtp-error' });
    render(<TestEmailDialog open settingId="s1" defaultTo="" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'ส่งเมลทดสอบ' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toContain('host');
  });
});
