import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders with bg-border class', () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('div');

    expect(separator).toHaveClass('bg-border');
  });

  it('renders with shrink-0 class', () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('div');

    expect(separator).toHaveClass('shrink-0');
  });

  it('renders with role="none" when decorative prop is true (default)', () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('div');

    expect(separator).toHaveAttribute('role', 'none');
  });

  it('renders horizontal separator with h-[1px] w-full by default', () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('div');

    expect(separator).toHaveClass('h-[1px]');
    expect(separator).toHaveClass('w-full');
  });

  it('renders vertical separator with h-full w-[1px] when orientation="vertical"', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.querySelector('div');

    expect(separator).toHaveClass('h-full');
    expect(separator).toHaveClass('w-[1px]');
  });

  it('merges custom className with default classes', () => {
    const { container } = render(<Separator className="custom-separator-class" />);
    const separator = container.querySelector('div');

    expect(separator).toHaveClass('bg-border');
    expect(separator).toHaveClass('shrink-0');
    expect(separator).toHaveClass('custom-separator-class');
  });

  it('forwards ref to the DOM element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Separator ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DIV');
  });

  it('renders with role="separator" when decorative prop is false', () => {
    const { container } = render(<Separator decorative={false} />);
    const separator = container.querySelector('div');

    expect(separator).toHaveAttribute('role', 'separator');
  });
});
