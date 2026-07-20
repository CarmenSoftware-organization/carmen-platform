import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterCountInput, deriveCounterState } from './character-count-input';

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

describe('deriveCounterState', () => {
  it('is normal below the warning threshold', () => {
    expect(deriveCounterState(5, 9, 10)).toBe('normal');
  });
  it('is warning at/above the threshold and up to max', () => {
    expect(deriveCounterState(9, 9, 10)).toBe('warning');
    expect(deriveCounterState(10, 9, 10)).toBe('warning');
  });
  it('is error above max (over-max wins over warning)', () => {
    expect(deriveCounterState(11, 9, 10)).toBe('error');
  });
});

describe('CharacterCountInput — counter color', () => {
  it('shows amber (text-warning) within 10% of the limit', () => {
    render(
      <CharacterCountInput label="Bio" value="123456789" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');
  });

  it('shows neutral (text-muted-foreground) well below the limit', () => {
    render(
      <CharacterCountInput label="Bio" value="12345678" onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('8 / 10')).toHaveClass('text-muted-foreground');
  });

  it('shows red (text-destructive) when the value is over max', () => {
    render(
      <CharacterCountInput label="Bio" value={'x'.repeat(11)} onChange={vi.fn()} maxLength={10} />,
    );
    expect(screen.getByText('11 / 10')).toHaveClass('text-destructive');
  });
});

describe('CharacterCountInput — hard cap', () => {
  it('blocks a change that would exceed maxLength (default hardCap)', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Code" value="12345" onChange={onChange} maxLength={5} />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows a change within maxLength', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Code" value="123" onChange={onChange} maxLength={5} />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234' } });
    expect(onChange).toHaveBeenCalledWith('1234');
  });

  it('allows exceeding when hardCap is false', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput
        label="Code"
        value="12345"
        onChange={onChange}
        maxLength={5}
        hardCap={false}
      />,
    );
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    expect(onChange).toHaveBeenCalledWith('123456');
  });
});
