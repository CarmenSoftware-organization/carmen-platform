import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineField } from './InlineField';

const setup = (props: Partial<React.ComponentProps<typeof InlineField>> = {}) => {
  const onCommit = vi.fn();
  render(<InlineField name="name" label="Name" value="Alice" onCommit={onCommit} {...props} />);
  return { onCommit };
};

describe('InlineField', () => {
  it('shows the value and turns into an input when clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alice');
  });

  it('commits a changed value on blur', async () => {
    const user = userEvent.setup();
    const { onCommit } = setup();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith('name', 'Bob');
  });

  it('reverts on Escape without committing', async () => {
    const user = userEvent.setup();
    const { onCommit } = setup();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(input);
    await user.type(input, 'Bob{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /alice/i })).toBeInTheDocument();
  });

  it('shows a placeholder invitation when empty', () => {
    setup({ value: '' });
    expect(screen.getByRole('button', { name: /set name/i })).toBeInTheDocument();
  });

  it('does not become editable when disabled', async () => {
    const user = userEvent.setup();
    setup({ disabled: true });
    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
