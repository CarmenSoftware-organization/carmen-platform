import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders a button element with its text', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('applies destructive variant classes (red token, not primary)', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('bg-destructive');
  });

  it('applies icon size classes', () => {
    render(<Button size="icon" aria-label="icon-btn" />);
    const button = screen.getByRole('button', { name: 'icon-btn' });
    expect(button.className).toContain('h-9');
    expect(button.className).toContain('w-9');
  });

  it('renders the child element (not a button) when asChild is used', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Go</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('respects the disabled prop', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('merges a custom className with the variant classes', () => {
    render(<Button className="my-custom-class">Merged</Button>);
    const button = screen.getByRole('button', { name: 'Merged' });
    expect(button.className).toContain('my-custom-class');
    expect(button.className).toContain('bg-primary');
  });
});
