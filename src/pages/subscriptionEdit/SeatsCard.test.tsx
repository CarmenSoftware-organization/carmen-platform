import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mutable auth so a test can revoke cluster.update. `Can` (the REAL component, not mocked)
// reads this via useAuth() — mocking `Can` itself would make the gating test below vacuous.
const auth = vi.hoisted(() => ({
  isSuperAdmin: false,
  hasPermission: (() => true) as (perm: string, ctx?: { clusterId?: string }) => boolean,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}));

import { SeatsCard } from './SeatsCard';
import type { SubscriptionBu, SubscriptionSeat } from '../../types';

beforeEach(() => {
  auth.isSuperAdmin = false;
  auth.hasPermission = () => true;
});

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

});

// Review I4: the old note fired on `licensedSum !== cap` and blamed "deactivated or deleted
// business units". Both halves were wrong. `cap` is the sum over EVERY active BU of the
// cluster (subscription.service.ts:700-706), while the list above covers only the BUs on THIS
// contract — so a partial-coverage contract (the whole reason the feature exists) tripped the
// note every single time, with an explanation that pointed at BUs which are not counted in
// `cap` to begin with. The replacement states the pool relationship unconditionally.
describe('SeatsCard — pool explanation, not a mismatch warning', () => {
  it('explains the cluster-wide pool even when licensed_users does not sum to cap', () => {
    renderCard({ used: 8, cap: 15, pending_invites: 0 }, [bu({ licensed_users: 10 })]);
    expect(screen.getByText(/ที่นั่งเป็น pool ของทั้ง cluster/)).toBeInTheDocument();
    expect(screen.queryByText(/ไม่เท่ากับเพดานรวม/)).toBeNull();
    expect(screen.queryByText(/ปิดใช้งานหรือถูกลบ/)).toBeNull();
  });

  it('shows the same explanation when licensed_users happens to sum to cap', () => {
    renderCard(
      { used: 8, cap: 15, pending_invites: 0 },
      [bu({ business_unit_id: 'bu1', licensed_users: 10 }), bu({ business_unit_id: 'bu2', licensed_users: 5 })],
    );
    expect(screen.getByText(/ที่นั่งเป็น pool ของทั้ง cluster/)).toBeInTheDocument();
  });
});

// Review M2: /business-units/:id/edit is gated on `cluster.update` (App.tsx), a different
// permission from this page's `subscription.manage` — an ungated link sends anyone holding
// only the latter straight into the Forbidden page.
describe('SeatsCard — "แก้เพดาน" is gated on cluster.update', () => {
  it('renders plain text instead of a link when the user lacks cluster.update', () => {
    auth.hasPermission = (perm) => perm === 'subscription.manage';
    renderCard({ used: 8, cap: 15, pending_invites: 0 }, [bu()]);

    expect(screen.queryByRole('link', { name: 'แก้เพดาน' })).toBeNull();
    expect(screen.getByText('แก้เพดานได้ที่หน้าหน่วยธุรกิจ')).toBeInTheDocument();
  });

  it('renders the link when the user does hold cluster.update (discriminating control)', () => {
    auth.hasPermission = (perm) => perm === 'cluster.update';
    renderCard({ used: 8, cap: 15, pending_invites: 0 }, [bu()]);

    expect(screen.getByRole('link', { name: 'แก้เพดาน' })).toHaveAttribute(
      'href',
      '/business-units/bu1/edit',
    );
  });
});
