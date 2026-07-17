import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Network } from 'lucide-react';
import { ActivityStream } from './ActivityStream';
import type { ActivityItem } from './activity';

const renderStream = (props: Partial<Parameters<typeof ActivityStream>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ActivityStream items={[]} loading={false} error={false} onRetry={() => {}} {...props} />
    </MemoryRouter>,
  );

describe('ActivityStream', () => {
  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    renderStream({ error: true, onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load recent activity.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there is no activity and no error', () => {
    renderStream({ items: [] });
    expect(screen.getByText('Nothing changed here yet')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    const { container } = renderStream({ loading: true });
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders items in the timeline when loaded', () => {
    const items: ActivityItem[] = [
      {
        id: 'c1',
        domainKey: 'clusters',
        domainLabel: 'Clusters',
        icon: Network,
        verb: 'created',
        name: 'Acme Cluster',
        at: new Date().toISOString(),
        href: '/clusters/c1/edit',
      },
    ];
    renderStream({ items });
    expect(screen.getByText('Acme Cluster')).toBeInTheDocument();
  });
});
