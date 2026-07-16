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

describe('InlineField (select)', () => {
  const clusters = [
    { value: 'c1', label: 'ZEBRA' },
    { value: 'c2', label: 'CARMEN' },
  ];
  const setupSelect = (value = '') => {
    const onCommit = vi.fn();
    render(
      <InlineField
        name="cluster"
        label="Cluster"
        type="select"
        options={clusters}
        value={value}
        onCommit={onCommit}
      />,
    );
    return { onCommit };
  };

  it('shows the option label, not the raw stored value, in read mode', () => {
    setupSelect('c2');
    expect(screen.getByRole('button', { name: 'CARMEN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'c2' })).toBeNull();
  });

  it('renders a non-committing prompt option so the first real option is selectable when empty', async () => {
    const user = userEvent.setup();
    setupSelect('');
    await user.click(screen.getByRole('button', { name: /set cluster/i }));
    // an empty-valued prompt sits at the top; without it the browser would show
    // the first real option as already-selected and clicking it fires no change.
    const prompt = screen.getByRole('option', { name: /set cluster/i });
    expect(prompt).toHaveValue('');
  });

  it('commits the chosen option value', async () => {
    const user = userEvent.setup();
    const { onCommit } = setupSelect('');
    await user.click(screen.getByRole('button', { name: /set cluster/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Cluster' }), 'c1');
    expect(onCommit).toHaveBeenCalledWith('cluster', 'c1');
  });
});
