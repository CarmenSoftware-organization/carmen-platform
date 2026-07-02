import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';

describe('Avatar', () => {
  it('renders the fallback text when no image loads', () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
        <AvatarImage src="https://example.invalid/broken.png" alt="Broken" />
      </Avatar>
    );
    // Radix only mounts AvatarImage into the DOM once it reports "loaded";
    // in jsdom images never load, so the Fallback is what actually renders.
    const fallback = screen.getByText('AB');
    expect(fallback).toBeInTheDocument();
  });

  it('applies rounded-full and default sizing classes to the Avatar root', () => {
    render(
      <Avatar data-testid="avatar-root">
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
    );
    const root = screen.getByTestId('avatar-root');
    expect(root.className).toContain('rounded-full');
    expect(root.className).toContain('relative');
    expect(root.className).toContain('flex');
    expect(root.className).toContain('h-10');
    expect(root.className).toContain('w-10');
    expect(root.className).toContain('shrink-0');
    expect(root.className).toContain('overflow-hidden');
  });

  it('merges a custom className on the Avatar root with the default classes', () => {
    render(
      <Avatar data-testid="avatar-root" className="h-8 w-8 custom-avatar">
        <AvatarFallback>EF</AvatarFallback>
      </Avatar>
    );
    const root = screen.getByTestId('avatar-root');
    expect(root.className).toContain('custom-avatar');
    expect(root.className).toContain('rounded-full');
  });

  it('applies default classes to AvatarFallback', () => {
    render(
      <Avatar>
        <AvatarFallback data-testid="fallback">GH</AvatarFallback>
      </Avatar>
    );
    const fallback = screen.getByTestId('fallback');
    expect(fallback.className).toContain('flex');
    expect(fallback.className).toContain('h-full');
    expect(fallback.className).toContain('w-full');
    expect(fallback.className).toContain('items-center');
    expect(fallback.className).toContain('justify-center');
    expect(fallback.className).toContain('rounded-full');
    expect(fallback.className).toContain('bg-muted');
  });

  it('merges a custom className on AvatarFallback', () => {
    render(
      <Avatar>
        <AvatarFallback data-testid="fallback" className="bg-primary text-primary-foreground">
          IJ
        </AvatarFallback>
      </Avatar>
    );
    const fallback = screen.getByTestId('fallback');
    expect(fallback.className).toContain('bg-primary');
    expect(fallback.className).toContain('text-primary-foreground');
  });

  it('accepts a name prop on Avatar without spreading it to the DOM', () => {
    render(
      <Avatar data-testid="avatar-root" name="Jane Doe">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    const root = screen.getByTestId('avatar-root');
    expect(root).not.toHaveAttribute('name');
  });

  it('forwards a ref to the Avatar root element', () => {
    const ref = { current: null as HTMLSpanElement | null };
    render(
      <Avatar ref={ref}>
        <AvatarFallback>KL</AvatarFallback>
      </Avatar>
    );
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
