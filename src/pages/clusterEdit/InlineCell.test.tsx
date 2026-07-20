import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineCell } from './InlineCell';

const opts = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

describe('InlineCell', () => {
  it('shows the display node in read mode and opens a select on click', async () => {
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" onCommit={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /role/i }));
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
  });

  it('commits a changed value', async () => {
    const onCommit = vi.fn();
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" onCommit={onCommit} />);
    await userEvent.click(screen.getByRole('button', { name: /role/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'admin');
    expect(onCommit).toHaveBeenCalledWith('admin');
  });

  it('does not render a trigger button when disabled', () => {
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" disabled onCommit={() => {}} />);
    expect(screen.queryByRole('button', { name: /role/i })).toBeNull();
    expect(screen.getByText('User')).toBeInTheDocument();
  });
});
