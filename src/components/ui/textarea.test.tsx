import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('fires onChange when typing', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<Textarea onChange={handleChange} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'hello');

    expect(handleChange).toHaveBeenCalled();
    expect(textarea.value).toBe('hello');
  });

  it('forwards ref to the DOM textarea element', () => {
    const ref = React.createRef<HTMLTextAreaElement>();

    render(<Textarea ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('TEXTAREA');
  });

  it('merges className prop', () => {
    const { container } = render(<Textarea className="custom-class" />);
    const textarea = container.querySelector('textarea');

    expect(textarea).toHaveClass('custom-class');
    expect(textarea).toHaveClass('rounded-md'); // Standard shadcn class
  });

  it('passes through placeholder, disabled, and other props', () => {
    const { container } = render(
      <Textarea
        placeholder="Enter your message"
        disabled
        rows={5}
      />
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;

    expect(textarea.placeholder).toBe('Enter your message');
    expect(textarea.disabled).toBe(true);
    expect(textarea.rows).toBe(5);
  });
});
