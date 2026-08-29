import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from './PasswordField';

describe('PasswordField', () => {
  it('shows that a password is stored and emits nothing until touched', () => {
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    expect(screen.getByText('A password is set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.queryByLabelText('SMTP password')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the no-password state when nothing is stored', () => {
    render(<PasswordField hasStoredPassword={false} isNew={false} onChange={vi.fn()} />);
    expect(screen.getByText('No password set')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
  });

  it('emits the typed value while editing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'hunter2');
    expect(onChange).toHaveBeenLastCalledWith('hunter2');
  });

  it('emits undefined — never an empty string — when the field is left blank', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'ab');
    await user.clear(screen.getByLabelText('SMTP password'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(onChange).not.toHaveBeenCalledWith('');
    expect(onChange).not.toHaveBeenCalledWith(null);
    expect(screen.getByText('Leave blank to keep the current password')).toBeInTheDocument();
  });

  it('cancelling editing restores the idle state and emits undefined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordField hasStoredPassword isNew={false} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('SMTP password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('starts in editing mode for a new profile with no idle state to return to', () => {
    render(<PasswordField hasStoredPassword={false} isNew onChange={vi.fn()} />);
    expect(screen.getByLabelText('SMTP password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
