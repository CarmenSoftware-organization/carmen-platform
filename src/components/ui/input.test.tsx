import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Input } from './input';

describe('Input', () => {
  it('fires onChange when typing', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<Input onChange={handleChange} />);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'hello');

    expect(handleChange).toHaveBeenCalled();
    expect(input.value).toBe('hello');
  });

  it('forwards ref to the DOM input element', () => {
    const ref = React.createRef<HTMLInputElement>();

    render(<Input ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('merges className prop', () => {
    const { container } = render(<Input className="custom-class" />);
    const input = container.querySelector('input');

    expect(input).toHaveClass('custom-class');
    expect(input).toHaveClass('rounded-md'); // Standard shadcn class
  });

  it('passes through placeholder, type, and disabled props', () => {
    const { container } = render(
      <Input
        placeholder="Enter text"
        type="password"
        disabled
      />
    );
    const input = container.querySelector('input') as HTMLInputElement;

    expect(input.placeholder).toBe('Enter text');
    expect(input.type).toBe('password');
    expect(input.disabled).toBe(true);
  });
});
