import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders a label element with its text', () => {
    render(<Label>Username</Label>);
    const label = screen.getByText('Username');
    expect(label).toBeInTheDocument();
    expect(label.tagName).toBe('LABEL');
  });

  it('applies the htmlFor attribute to associate with an input', () => {
    render(<Label htmlFor="username-input">Username</Label>);
    const label = screen.getByText('Username');
    expect(label).toHaveAttribute('for', 'username-input');
  });

  it('merges a custom className with the default Label classes', () => {
    render(<Label className="custom-class">Email</Label>);
    const label = screen.getByText('Email');
    expect(label.className).toContain('custom-class');
    expect(label.className).toContain('text-sm');
    expect(label.className).toContain('font-medium');
  });

  it('applies default shadcn Label classes', () => {
    render(<Label>Default Classes</Label>);
    const label = screen.getByText('Default Classes');
    expect(label.className).toContain('text-sm');
    expect(label.className).toContain('font-medium');
    expect(label.className).toContain('leading-none');
    expect(label.className).toContain('peer-disabled:cursor-not-allowed');
    expect(label.className).toContain('peer-disabled:opacity-70');
  });

  it('forwards ref to the label element', () => {
    const ref = { current: null };
    render(<Label ref={ref}>Forward Ref Test</Label>);
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });
});
