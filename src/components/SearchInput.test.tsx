import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('emits typed value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="" onValueChange={onValueChange} placeholder="Search…" />);
    await user.type(screen.getByPlaceholderText('Search…'), 'a');
    expect(onValueChange).toHaveBeenCalledWith('a');
  });

  it('shows a clear button only when there is a value, and clears', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<SearchInput value="" onValueChange={onValueChange} />);
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    rerender(<SearchInput value="abc" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('uses a token active-state, not raw yellow', () => {
    render(<SearchInput value="abc" onValueChange={() => {}} />);
    const input = screen.getByRole('textbox');
    expect(input.className).not.toContain('yellow');
  });
});
