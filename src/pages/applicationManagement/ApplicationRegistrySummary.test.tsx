import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationRegistrySummary } from './ApplicationRegistrySummary';

describe('ApplicationRegistrySummary', () => {
  const summary = {
    total: 12,
    active: 10,
    inactive: 2,
    deleted: 1,
    full_access: 3,
    scoped: 9,
    // Deliberately NOT in display order — the endpoint sends busiest-first, and the band is
    // responsible for re-sorting. A fixture already in order could not catch a lost sort.
    devices: [
      { device: 'pos', count: 2 },
      { device: 'web', count: 7 },
      { device: 'mobile', count: 3 },
    ],
  };

  it('renders the total, active split and scope legend', () => {
    render(<ApplicationRegistrySummary summary={summary} loading={false} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/10 active/)).toBeInTheDocument();
    expect(screen.getByText('Full access')).toBeInTheDocument();
    expect(screen.getByText('Scoped')).toBeInTheDocument();
  });

  it('renders the device chips in platform order with uppercase POS, whatever order they arrive in', () => {
    render(<ApplicationRegistrySummary summary={summary} loading={false} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
    // The selector matches on the chip's own text node (just the label); `textContent` then
    // also picks up the count from the nested span. Asserting the concatenation pins the
    // order AND that each label kept its own number.
    const chips = screen.getAllByText(/^(Web|Mobile|Desktop|POS)$/).map((el) => el.textContent);
    expect(chips).toEqual(['Web7', 'Mobile3', 'POS2']);
  });

  it('shows a skeleton while loading', () => {
    const { container } = render(<ApplicationRegistrySummary summary={null} loading />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    render(<ApplicationRegistrySummary summary={null} loading={false} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the registry summary.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
