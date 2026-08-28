import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionSummary } from './SubscriptionSummary';

const summary = {
  total: 42,
  active: 30,
  expired: 5,
  expiring_soon: 4,
  deleted: 3,
};

describe('SubscriptionSummary', () => {
  it('renders all 5 cards with their backend-supplied counts', () => {
    render(<SubscriptionSummary summary={summary} loading={false} error="" onRetry={() => {}} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Expiring soon')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // The "deleted" card — a past bug shipped this band missing exactly this card.
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a skeleton per card while loading with no summary yet', () => {
    const { container } = render(<SubscriptionSummary summary={null} loading error="" onRetry={() => {}} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(5);
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    render(<SubscriptionSummary summary={null} loading={false} error="Failed to load subscription summary." onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load subscription summary.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('defaults every count to 0 when the summary is missing but not loading/erroring', () => {
    render(<SubscriptionSummary summary={null} loading={false} error="" onRetry={() => {}} />);
    expect(screen.getAllByText('0')).toHaveLength(5);
  });
});
