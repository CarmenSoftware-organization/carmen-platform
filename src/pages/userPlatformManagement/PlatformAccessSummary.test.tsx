import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeUserPlatform, PlatformAccessSummary } from './PlatformAccessSummary';

describe('summarizeUserPlatform', () => {
  const users = [
    { id: 'a', is_active: true },
    { id: 'b', is_active: true },
    { id: 'c', is_active: false },
    { id: 'd', is_active: true },
  ];
  const counts = { a: 2, b: 0, c: 1, d: 0 };

  it('counts status', () => {
    const s = summarizeUserPlatform(users, counts);
    expect(s.total).toBe(4);
    expect(s.active).toBe(3);
    expect(s.inactive).toBe(1);
  });

  it('splits privileged (holds a role) from unprivileged and sums assignments', () => {
    const s = summarizeUserPlatform(users, counts);
    expect(s.privileged).toBe(2); // a, c
    expect(s.unprivileged).toBe(2); // b, d
    expect(s.assignments).toBe(3); // 2 + 0 + 1 + 0
  });

  it('treats a user missing from the count map as unprivileged', () => {
    const s = summarizeUserPlatform([{ id: 'x', is_active: true }], {});
    expect(s.privileged).toBe(0);
    expect(s.unprivileged).toBe(1);
    expect(s.unknown).toBe(0);
    expect(s.assignments).toBe(0);
  });

  it('counts a failed role fetch as unknown, not unprivileged, and excludes it from assignments', () => {
    const s = summarizeUserPlatform(
      [{ id: 'a', is_active: true }, { id: 'b', is_active: true }],
      { a: 'error', b: 3 },
    );
    expect(s.privileged).toBe(1); // b only
    expect(s.unprivileged).toBe(0); // a is unknown, not unprivileged
    expect(s.unknown).toBe(1); // a
    expect(s.assignments).toBe(3); // a's failed fetch contributes nothing
  });
});

describe('PlatformAccessSummary', () => {
  const summary = {
    total: 34,
    active: 32,
    inactive: 2,
    privileged: 8,
    unprivileged: 26,
    unknown: 0,
    assignments: 18,
  };

  it('renders the total, status split and platform-access breakdown', () => {
    render(<PlatformAccessSummary summary={summary} loading={false} />);
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText(/32 active/)).toBeInTheDocument();
    expect(screen.getByText('With platform roles')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows the total assignments granted', () => {
    render(<PlatformAccessSummary summary={summary} loading={false} />);
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText(/role assignments/)).toBeInTheDocument();
  });

  it('singularizes a lone assignment', () => {
    render(<PlatformAccessSummary summary={{ ...summary, assignments: 1 }} loading={false} />);
    expect(screen.getByText('role assignment')).toBeInTheDocument();
  });

  it('shows a skeleton while the N+1 role counts resolve', () => {
    const { container } = render(<PlatformAccessSummary summary={null} loading />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('surfaces failed role fetches as a distinct "Unknown" segment, not folded into privileged/unprivileged', () => {
    render(
      <PlatformAccessSummary
        summary={{ ...summary, total: 36, privileged: 8, unprivileged: 26, unknown: 2 }}
        loading={false}
      />,
    );
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });

  it('omits the "Unknown" segment when every role fetch resolved', () => {
    render(<PlatformAccessSummary summary={summary} loading={false} />);
    expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument();
  });
});
