import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonItem } from './skeleton';

describe('Skeleton', () => {
  it('renders a div element', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.tagName).toBe('DIV');
  });

  it('applies animate-pulse class', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('animate-pulse');
  });

  it('applies rounded-md class', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('rounded-md');
  });

  it('applies bg-muted class', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('bg-muted');
  });

  it('merges custom className with default classes', () => {
    render(<Skeleton className="h-12 w-12" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('rounded-md');
    expect(skeleton.className).toContain('bg-muted');
    expect(skeleton.className).toContain('h-12');
    expect(skeleton.className).toContain('w-12');
  });

  it('passes through other HTML attributes', () => {
    render(<Skeleton aria-label="Loading" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveAttribute('aria-label', 'Loading');
  });

  it('supports ref forwarding', () => {
    const ref = { current: null };
    render(<Skeleton ref={ref} data-testid="skeleton" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('SkeletonItem', () => {
  it('renders a div element (stub alias)', () => {
    render(<SkeletonItem data-testid="skeleton-item" />);
    const skeletonItem = screen.getByTestId('skeleton-item');
    expect(skeletonItem).toBeInTheDocument();
    expect(skeletonItem.tagName).toBe('DIV');
  });

  it('applies default classes', () => {
    render(<SkeletonItem data-testid="skeleton-item" />);
    const skeletonItem = screen.getByTestId('skeleton-item');
    expect(skeletonItem.className).toContain('animate-pulse');
    expect(skeletonItem.className).toContain('bg-muted');
  });

  it('merges custom className', () => {
    render(<SkeletonItem className="h-8 w-8" data-testid="skeleton-item" />);
    const skeletonItem = screen.getByTestId('skeleton-item');
    expect(skeletonItem.className).toContain('h-8');
    expect(skeletonItem.className).toContain('w-8');
    expect(skeletonItem.className).toContain('animate-pulse');
  });
});
