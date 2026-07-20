import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterCountInput } from './character-count-input';

describe('CharacterCountInput — scaffold', () => {
  it('associates the label with a single-line text input', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} />);
    const field = screen.getByLabelText('Bio');
    expect(field).toBeInTheDocument();
    expect(field.tagName).toBe('INPUT');
  });

  it('shows the counter as `current / max` using the default max of 200', () => {
    render(<CharacterCountInput label="Bio" value="hello" onChange={vi.fn()} />);
    expect(screen.getByText('5 / 200')).toBeInTheDocument();
  });

  it('honors a custom maxLength in the counter', () => {
    render(
      <CharacterCountInput label="Bio" value="hi" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });
});
