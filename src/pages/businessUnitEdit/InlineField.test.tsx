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

  it('pairs the error message with a destructive border, not the resting primary one', async () => {
    const user = userEvent.setup();
    setup({ error: 'Bad value' });
    expect(screen.getByText('Bad value')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.className).toContain('border-destructive');
    expect(input.className).not.toContain('border-primary');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the primary border when there is no error', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.className).toContain('border-primary');
    expect(input.className).not.toContain('border-destructive');
  });

  // The visual box stays ~32px so a ~50-row form does not bloat; a ::before
  // overlay carries the 44px tappable area instead.
  it('gives the read control a 44px tappable overlay without a taller visual box', () => {
    setup();
    const btn = screen.getByRole('button', { name: /alice/i });
    expect(btn.className).toContain('before:h-11');
    expect(btn.className).toContain('relative');
    // still the compact resting padding — no min-h bloat
    expect(btn.className).toContain('py-1.5');
    expect(btn.className).not.toContain('min-h-');
  });

  it('marks a required field and flags it to assistive tech', async () => {
    const user = userEvent.setup();
    setup({ required: true });
    expect(screen.getByText('*')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-required', 'true');
  });

  it('does not mark required on a field the user cannot edit', () => {
    setup({ required: true, disabled: true });
    expect(screen.queryByText('*')).toBeNull();
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
