import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformAccessSummary } from './PlatformAccessSummary';
import type { PlatformUserRegistrySummary } from '../../types';

const summary = (overrides: Partial<PlatformUserRegistrySummary> = {}): PlatformUserRegistrySummary => ({
  holders: 137,
  platform_wide: 6,
  cluster_only: 14,
  assignments: 28,
  inactive: 0,
  ...overrides,
});

describe('PlatformAccessSummary', () => {
  it('renders the registry-wide aggregate straight from `summary`, with no page-scoped qualifier', () => {
    render(<PlatformAccessSummary summary={summary()} loading={false} />);
    expect(screen.getByText('137')).toBeInTheDocument();
    expect(screen.getByText('holders')).toBeInTheDocument();
    expect(screen.getByText('Platform-wide')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Cluster-scoped')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();

    // The interim "This page only" caption (added while the breakdown really was
    // page-derived) must be gone now that the whole band is registry-wide.
    expect(screen.queryByText(/this page/i)).not.toBeInTheDocument();
  });

  it('singularizes the headline label for exactly one holder', () => {
    render(<PlatformAccessSummary summary={summary({ holders: 1 })} loading={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('holder')).toBeInTheDocument();
    expect(screen.queryByText('holders')).not.toBeInTheDocument();
  });

  it('shows a skeleton while the summary is loading', () => {
    const { container } = render(<PlatformAccessSummary summary={null} loading />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows an error state with a working retry instead of skeletoning forever', async () => {
    const onRetry = vi.fn();
    render(<PlatformAccessSummary summary={null} loading={false} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the registry summary.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an actionable inactive-holders warning, using the warning token rather than a raw color, and applies the filter on click', async () => {
    const onShowInactive = vi.fn();
    render(
      <PlatformAccessSummary
        summary={summary({ inactive: 3 })}
        loading={false}
        onShowInactive={onShowInactive}
      />,
    );
    const button = screen.getByRole('button', { name: /3 inactive holders still hold access/ });
    expect(button.className).toContain('text-warning');
    expect(button.className).not.toMatch(/amber|yellow/);
    await userEvent.click(button);
    expect(onShowInactive).toHaveBeenCalledTimes(1);
  });

  it('singularizes "holder" in the inactive warning for exactly one inactive holder', () => {
    render(<PlatformAccessSummary summary={summary({ inactive: 1 })} loading={false} />);
    expect(screen.getByRole('button', { name: /1 inactive holder still hold access/ })).toBeInTheDocument();
  });

  it('omits the inactive warning entirely when there are no inactive holders', () => {
    render(<PlatformAccessSummary summary={summary({ inactive: 0 })} loading={false} />);
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
  });

  it('surfaces the inactive warning from the registry-wide aggregate even when every loaded row is active — the false negative this change fixes', () => {
    // Regression guard for the bug this task exists to fix: with pagination, the sole
    // inactive holder can sort onto a page the admin never opens. The band must warn
    // from `summary.inactive` alone — it renders with no knowledge of any table rows at
    // all, so it cannot silently agree with a clean-looking page 1.
    render(<PlatformAccessSummary summary={summary({ inactive: 3 })} loading={false} />);
    expect(
      screen.getByRole('button', { name: /3 inactive holders still hold access/ }),
    ).toBeInTheDocument();
  });

  it('renders an explicit "unavailable" state when `summary` is absent, instead of defaulting counts to zero', () => {
    // Every request hits this path until the backend for this change deploys. Showing
    // "0 inactive holders" here would misreport the registry as clean — the one finding
    // this page exists to surface — so the band must say the data is unavailable rather
    // than fabricate zeros.
    render(<PlatformAccessSummary summary={null} loading={false} />);
    expect(screen.getByText(/registry summary isn.t available yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Platform-wide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
  });
});
