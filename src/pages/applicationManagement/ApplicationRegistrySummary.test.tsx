import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { summarizeApplications, ApplicationRegistrySummary } from './ApplicationRegistrySummary';

describe('summarizeApplications', () => {
  const list = [
    { is_active: true, allow_all: true, device: 'web' },
    { is_active: true, allow_all: false, device: 'web' },
    { is_active: false, allow_all: false, device: 'mobile' },
    { is_active: true, allow_all: false, device: 'pos' },
  ];

  it('counts status and API-access scope', () => {
    const s = summarizeApplications(list);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.inactive).toBe(1);
    expect(s.fullAccess).toBe(1);
    expect(s.scoped).toBe(3);
  });

  it('groups devices and orders them web, mobile, desktop, pos', () => {
    const s = summarizeApplications(list);
    expect(s.devices).toEqual([
      { device: 'web', count: 2 },
      { device: 'mobile', count: 1 },
      { device: 'pos', count: 1 },
    ]);
  });

  it('defaults a missing device to web', () => {
    const s = summarizeApplications([{ is_active: true, allow_all: false }]);
    expect(s.devices).toEqual([{ device: 'web', count: 1 }]);
  });
});

describe('ApplicationRegistrySummary', () => {
  const summary = {
    total: 12,
    active: 10,
    inactive: 2,
    fullAccess: 3,
    scoped: 9,
    devices: [
      { device: 'web', count: 7 },
      { device: 'mobile', count: 3 },
      { device: 'pos', count: 2 },
    ],
  };

  it('renders the total, active split and scope legend', () => {
    render(<ApplicationRegistrySummary summary={summary} loading={false} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/10 active/)).toBeInTheDocument();
    expect(screen.getByText('Full access')).toBeInTheDocument();
    expect(screen.getByText('Scoped')).toBeInTheDocument();
  });

  it('renders the device chips with uppercase POS', () => {
    render(<ApplicationRegistrySummary summary={summary} loading={false} />);
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
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
