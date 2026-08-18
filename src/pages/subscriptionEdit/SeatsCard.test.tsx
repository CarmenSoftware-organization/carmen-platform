import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeatsCard } from './SeatsCard';
import type { SubscriptionBu, SubscriptionSeat } from '../../types';

const renderCard = (seat: SubscriptionSeat, bus: SubscriptionBu[]) =>
  render(
    <MemoryRouter>
      <SeatsCard seat={seat} bus={bus} />
    </MemoryRouter>,
  );

const bu = (over: Partial<SubscriptionBu> = {}): SubscriptionBu => ({
  business_unit_id: 'bu1',
  bu_code: 'BU1',
  bu_name: 'Acme BU',
  feature_keys: [],
  licensed_users: 10,
  ...over,
});

describe('SeatsCard — cluster-level pool, never "unlimited"', () => {
  it('shows used/cap even when cap is 0 (zero seats, not unlimited)', () => {
    renderCard({ used: 0, cap: 0, pending_invites: 0 }, []);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.queryByText(/unlimited/i)).toBeNull();
    expect(screen.queryByText(/ไม่จำกัด/)).toBeNull();
  });

  it('applies the destructive style once used reaches cap', () => {
    renderCard({ used: 10, cap: 10, pending_invites: 0 }, []);
    expect(screen.getByText('10 / 10')).toHaveClass('text-destructive');
  });

  it('applies the warning style at 90%+ but under cap', () => {
    renderCard({ used: 9, cap: 10, pending_invites: 0 }, []);
    expect(screen.getByText('9 / 10')).toHaveClass('text-warning');
  });

  it('does not show a pending-invite line when there are none', () => {
    renderCard({ used: 5, cap: 10, pending_invites: 0 }, []);
    expect(screen.queryByText(/รอตอบรับ/)).toBeNull();
  });

  it('shows pending invites without a projected-overflow warning when they would not exceed cap', () => {
    renderCard({ used: 5, cap: 10, pending_invites: 2 }, []);
    expect(screen.getByText(/รอตอบรับ 2/)).toBeInTheDocument();
    expect(screen.queryByText(/อาจถึง/)).toBeNull();
  });

  it('warns with the projected total when pending invites would exceed cap', () => {
    renderCard({ used: 9, cap: 10, pending_invites: 3 }, []);
    const line = screen.getByText(/รอตอบรับ 3/);
    expect(line).toHaveTextContent('อาจถึง 12/10');
    expect(line).toHaveClass('text-warning');
  });

  it('lists each BU with what it bought and a link to fix its cap on the BU edit page', () => {
    renderCard(
      { used: 15, cap: 15, pending_invites: 0 },
      [bu({ business_unit_id: 'bu1', bu_name: 'Acme BU', licensed_users: 10 }), bu({ business_unit_id: 'bu2', bu_name: 'Beta BU', licensed_users: 5 })],
    );
    expect(screen.getByText('Acme BU · ซื้อ 10')).toBeInTheDocument();
    expect(screen.getByText('Beta BU · ซื้อ 5')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'แก้เพดาน' });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/business-units/bu1/edit');
    expect(links[1]).toHaveAttribute('href', '/business-units/bu2/edit');
  });

  it('shows an empty note when the subscription has no BUs yet', () => {
    renderCard({ used: 0, cap: 0, pending_invites: 0 }, []);
    expect(screen.getByText(/no business units on this subscription yet/i)).toBeInTheDocument();
  });

  it('shows a soft mismatch note when licensed_users does not sum to cap', () => {
    renderCard({ used: 8, cap: 15, pending_invites: 0 }, [bu({ licensed_users: 10 })]);
    expect(screen.getByText(/ผลรวมที่นั่งที่ซื้อ \(10\) ไม่เท่ากับเพดานรวม \(15\)/)).toBeInTheDocument();
  });

  it('hides the mismatch note when licensed_users sums to cap', () => {
    renderCard(
      { used: 8, cap: 15, pending_invites: 0 },
      [bu({ business_unit_id: 'bu1', licensed_users: 10 }), bu({ business_unit_id: 'bu2', licensed_users: 5 })],
    );
    expect(screen.queryByText(/ผลรวมที่นั่งที่ซื้อ/)).toBeNull();
  });
});
