import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders as a div element with children', () => {
    render(<Badge>Test Badge</Badge>);
    const badge = screen.getByText('Test Badge');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('DIV');
  });

  it('applies default variant with bg-primary class', () => {
    render(<Badge variant="default">Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('bg-primary');
  });

  it('applies secondary variant with bg-secondary class', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText('Secondary');
    expect(badge.className).toContain('bg-secondary');
    expect(badge.className).not.toContain('bg-primary');
  });

  it('applies destructive variant with bg-destructive class', () => {
    render(<Badge variant="destructive">Destructive</Badge>);
    const badge = screen.getByText('Destructive');
    expect(badge.className).toContain('bg-destructive');
  });

  it('applies success variant with bg-success class', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success');
    expect(badge.className).toContain('bg-success');
  });

  it('applies outline variant with border and text-foreground (no bg-primary)', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText('Outline');
    expect(badge.className).toContain('border');
    expect(badge.className).toContain('text-foreground');
    expect(badge.className).not.toContain('bg-primary');
    expect(badge.className).not.toContain('bg-secondary');
    expect(badge.className).not.toContain('bg-destructive');
    expect(badge.className).not.toContain('bg-success');
  });

  it('passes through title attribute', () => {
    render(<Badge title="Hover text">Hover me</Badge>);
    const badge = screen.getByText('Hover me');
    expect(badge).toHaveAttribute('title', 'Hover text');
  });

  it('merges custom className with variant classes', () => {
    render(<Badge className="my-custom-class">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge.className).toContain('my-custom-class');
    expect(badge.className).toContain('bg-primary');
  });

  it('exports badgeVariants CVA', () => {
    expect(badgeVariants).toBeDefined();
    // Verify it's a function (CVA returns a function)
    expect(typeof badgeVariants).toBe('function');
  });

  it('includes base classes from CVA', () => {
    render(<Badge>Base</Badge>);
    const badge = screen.getByText('Base');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).toContain('items-center');
    expect(badge.className).toContain('rounded-md');
    expect(badge.className).toContain('border');
    expect(badge.className).toContain('px-2.5');
    expect(badge.className).toContain('py-0.5');
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('font-medium');
  });

  it('applies foreground colors for each variant', () => {
    const { rerender } = render(<Badge variant="default">Test</Badge>);
    expect(screen.getByText('Test').className).toContain('text-primary-foreground');

    rerender(<Badge variant="secondary">Test</Badge>);
    expect(screen.getByText('Test').className).toContain('text-secondary-foreground');

    rerender(<Badge variant="destructive">Test</Badge>);
    expect(screen.getByText('Test').className).toContain('text-destructive-foreground');

    rerender(<Badge variant="success">Test</Badge>);
    expect(screen.getByText('Test').className).toContain('text-success-foreground');
  });

  it('renders warning and info variants with their status backgrounds', () => {
    const { rerender } = render(<Badge variant="warning">At risk</Badge>);
    expect(screen.getByText('At risk')).toHaveClass('bg-warning');
    rerender(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info')).toHaveClass('bg-info');
  });
});
