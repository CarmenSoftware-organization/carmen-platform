import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterCountInput, deriveCounterState } from './character-count-input';

describe('CharacterCountInput - scaffold', () => {
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

describe('CharacterCountInput - counter color', () => {
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

describe('CharacterCountInput - hard cap', () => {
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

describe('CharacterCountInput - validation & a11y', () => {
  it('does not show an error while typing (before blur)', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Bio')).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows the Zod min-length error after blur', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} />,
    );
    const field = screen.getByLabelText('Bio');
    fireEvent.blur(field);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/at least/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveClass('border-destructive');
  });

  it('links the field to the error node via aria-describedby after blur', () => {
    render(
      <CharacterCountInput label="Bio" value="short" onChange={vi.fn()} minLength={10} id="bio" />,
    );
    const field = screen.getByLabelText('Bio');
    fireEvent.blur(field);
    expect(field.getAttribute('aria-describedby')).toContain('bio-error');
    expect(field.getAttribute('aria-describedby')).toContain('bio-counter');
  });

  it('reports an over-max error for an externally supplied value', () => {
    render(
      <CharacterCountInput label="Bio" value={'x'.repeat(11)} onChange={vi.fn()} maxLength={10} />,
    );
    fireEvent.blur(screen.getByLabelText('Bio'));
    expect(screen.getByRole('alert').textContent).toMatch(/at most/i);
  });
});

describe('CharacterCountInput - onValidChange', () => {
  it('reports invalid on mount and valid after the value satisfies the bounds', () => {
    const onValidChange = vi.fn();
    const { rerender } = render(
      <CharacterCountInput
        label="Bio" value="ab" onChange={vi.fn()} minLength={3} onValidChange={onValidChange}
      />,
    );
    expect(onValidChange).toHaveBeenLastCalledWith(false, expect.any(String));

    rerender(
      <CharacterCountInput
        label="Bio" value="abc" onChange={vi.fn()} minLength={3} onValidChange={onValidChange}
      />,
    );
    expect(onValidChange).toHaveBeenLastCalledWith(true, undefined);
  });
});

describe('CharacterCountInput - multiline', () => {
  it('renders a textarea when multiline', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} multiline />);
    const field = screen.getByLabelText('Bio');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveClass('resize-none');
  });

  it('applies the hard cap on the textarea too', () => {
    const onChange = vi.fn();
    render(
      <CharacterCountInput label="Bio" value="12345" onChange={onChange} maxLength={5} multiline />,
    );
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '123456' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies warning color and blur-gated error on the textarea', () => {
    render(
      <CharacterCountInput label="Bio" value="123456789" onChange={vi.fn()} maxLength={10} multiline />,
    );
    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');

    render(
      <CharacterCountInput label="Note" value="hey" onChange={vi.fn()} minLength={10} multiline />,
    );
    const field = screen.getByLabelText('Note');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(field);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('CharacterCountInput - embeddable (no visible label)', () => {
  it('renders no <label> element when label is omitted, naming the field via aria-label', () => {
    render(<CharacterCountInput ariaLabel="Alias" value="" onChange={vi.fn()} maxLength={3} />);
    expect(document.querySelector('label')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Alias' })).toBeInTheDocument();
  });

  it('still renders a visible label when label is provided', () => {
    render(<CharacterCountInput label="Bio" value="" onChange={vi.fn()} />);
    expect(screen.getByText('Bio').tagName).toBe('LABEL');
    expect(screen.getByLabelText('Bio')).toBeInTheDocument();
  });

  it('focuses the field on mount when autoFocus is set', () => {
    render(
      // eslint-disable-next-line jsx-a11y/no-autofocus -- verifying the autoFocus behavior
      <CharacterCountInput ariaLabel="Alias" value="" onChange={vi.fn()} autoFocus />,
    );
    expect(screen.getByRole('textbox', { name: 'Alias' })).toHaveFocus();
  });

  it('marks the field required for assistive tech when ariaRequired', () => {
    render(<CharacterCountInput ariaLabel="Code" value="" onChange={vi.fn()} ariaRequired />);
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveAttribute('aria-required', 'true');
  });
});
