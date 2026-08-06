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

  it('renders an explicit "unavailable" state when `summary` is absent and no fallback total is known, instead of defaulting counts to zero', () => {
    // Every request hits this path until the backend for this change deploys. Showing
    // "0 inactive holders" here would misreport the registry as clean — the one finding
    // this page exists to surface — so the band must say the data is unavailable rather
    // than fabricate zeros. This is the fully-unknown case (no `fallbackHolderTotal`
    // either) — e.g. before the first successful fetch resolves.
    render(<PlatformAccessSummary summary={null} loading={false} />);
    expect(screen.getByText(/registry summary isn.t available yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Platform-wide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
  });

  it('still renders the headline holder count from `fallbackHolderTotal` when `summary` is absent, marking only the breakdown unavailable', () => {
    // `paginate.total` (passed through as `fallbackHolderTotal`) and `summary.holders`
    // describe the same registry-wide count by contract, so the headline can render from
    // either without becoming a page-derived guess. Only the scope breakdown and the
    // inactive warning depend on fields that exist nowhere outside `summary`.
    render(<PlatformAccessSummary summary={null} fallbackHolderTotal={42} loading={false} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('holders')).toBeInTheDocument();
    expect(screen.getByText(/scope breakdown isn.t available yet/i)).toBeInTheDocument();

    // The breakdown itself must not appear — there is no `summary.platform_wide` /
    // `cluster_only` / `assignments` to source it from.
    expect(screen.queryByText('Platform-wide')).not.toBeInTheDocument();
    expect(screen.queryByText('Cluster-scoped')).not.toBeInTheDocument();
    expect(screen.queryByText('Assignments')).not.toBeInTheDocument();

    // No inactive warning either — a suppressed warning is honest; a fabricated "0
    // inactive" would misreport the registry as clean, the one failure mode this whole
    // band exists to prevent.
    expect(screen.queryByRole('button', { name: /inactive/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/inactive/i)).not.toBeInTheDocument();
  });

  it('singularizes the fallback headline label for exactly one holder', () => {
    render(<PlatformAccessSummary summary={null} fallbackHolderTotal={1} loading={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('holder')).toBeInTheDocument();
    expect(screen.queryByText('holders')).not.toBeInTheDocument();
  });

  it('renders the headline from `fallbackHolderTotal` even when it is zero, rather than treating zero as "unset"', () => {
    // `0 != null` — a registry with no matching holders is a known fact, not a missing
    // one, so it must not fall through to the fully-unavailable branch (which would be
    // misleading in the opposite direction: it would look like the count itself is
    // unknown, when it is in fact known to be zero).
    render(<PlatformAccessSummary summary={null} fallbackHolderTotal={0} loading={false} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('holders')).toBeInTheDocument();
    expect(screen.getByText(/scope breakdown isn.t available yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/registry summary isn.t available yet/i)).not.toBeInTheDocument();
  });
});
