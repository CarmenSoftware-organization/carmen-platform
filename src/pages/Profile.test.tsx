import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Node 26 exposes bare `localStorage` as undefined; Profile writes to it on fetch
// (localStorage.setItem('user', ...)).
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: () => null,
  };
};

// Mock the shell so no Sidebar/nav chrome is needed.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Profile reads `user`/`refreshUser` off useAuth() directly (not via a service). `refreshUser`
// MUST be a stable reference (as it is in the real AuthContext, via useCallback) — Profile's
// fetchProfile effect depends on it (`[refreshUser]`); a fresh `vi.fn()` on every call would
// re-trigger the fetch on every render and clobber in-progress edits mid-test.
const authState = vi.hoisted(() => ({
  user: { id: 'u1', email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe' },
  refreshUser: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

// Profile talks to the raw `api` client (GET/PATCH /api/user/profile), not a *Service module.
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import Profile from './Profile';
import api from '../services/api';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const fakeProfile = {
  id: 'u1',
  email: 'jane@example.com',
  alias_name: 'JD',
  firstname: 'Jane',
  middlename: '',
  lastname: 'Doe',
  telephone: '+1 555 123 4567',
  role: 'admin',
  created_at: '2026-01-01T00:00:00Z',
  business_unit: [
    { id: 'bu1', code: 'BU1', name: 'Business Unit One', is_active: true },
  ],
};

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', makeLocalStorage());
});

describe('Profile — fetch failure surfaces a visible error (P1)', () => {
  it('shows a visible role="alert" error when the profile fetch fails', async () => {
    asMock(api.get).mockRejectedValue({ response: { status: 500 } });
    renderProfile();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Profile — Business Units empty state uses the shared EmptyState (P1)', () => {
  it('renders the shared EmptyState (icon + heading), not a bare <p>, when there are no business units', async () => {
    asMock(api.get).mockResolvedValue({
      data: { ...fakeProfile, business_unit: [] },
    });
    renderProfile();

    // Discriminating: EmptyState renders its title as a heading (<h3>). A hand-rolled
    // `<p>No business units found.</p>` has no heading role at all, so this assertion
    // fails against the pre-fix markup.
    expect(await screen.findByRole('heading', { name: /no business units/i })).toBeInTheDocument();
  });
});

describe('Profile — field-level validation (P2)', () => {
  it('flags an invalid telephone number on blur', async () => {
    asMock(api.get).mockResolvedValue({ data: fakeProfile });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    const tel = screen.getByLabelText(/telephone/i);
    await user.clear(tel);
    await user.type(tel, 'abc');
    await user.tab();

    expect(await screen.findByText(/invalid phone number format/i)).toBeInTheDocument();
  });

  it('flags an invalid alias name on blur', async () => {
    asMock(api.get).mockResolvedValue({ data: fakeProfile });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    const alias = screen.getByLabelText(/alias name/i);
    await user.clear(alias);
    await user.type(alias, 'way-too-long-alias');
    await user.tab();

    expect(await screen.findByText(/alias must be 1-3 alphanumeric characters/i)).toBeInTheDocument();
  });
});

describe('Profile — edit/read-only toggle is preserved (A4 contract)', () => {
  it('starts read-only, then reveals editable inputs after Edit is pressed', async () => {
    asMock(api.get).mockResolvedValue({ data: fakeProfile });
    const user = userEvent.setup();
    renderProfile();

    await screen.findByText('Jane Doe');
    // Read-only: no inputs for profile fields yet.
    expect(screen.queryByLabelText(/telephone/i)).toBeNull();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText(/telephone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
