import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mutable auth so each test controls loading/authenticated state. `useAuth` is
// mocked (not the real AuthContext) — Landing.tsx has no other dependency on
// AuthContext internals. Same pattern as Login.test.tsx / SuperAdminManagement.test.tsx.
const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  loading: false,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

import Landing from './Landing';

// Routes (not a bare MemoryRouter) so the redirect effect and the CTA's asChild
// Link have real destinations to land on — proves navigation actually works,
// not just that the DOM nodes look right.
function renderLanding(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.isAuthenticated = false;
  auth.loading = false;
});

describe('Landing — sign-in CTA markup', () => {
  it('renders sign-in CTAs as valid links (no button-in-anchor)', () => {
    renderLanding();
    const ctas = screen.getAllByRole('link', { name: /sign in/i });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    // Discriminating: fails against the current `<Link><Button>…</Button></Link>`
    // markup, which nests a real <button> inside the <a>.
    ctas.forEach((a) => expect(a.querySelector('button')).toBeNull());
  });

  it('renders two distinct sign-in CTAs (header + hero) — a legitimate landing pattern, not consolidated', () => {
    renderLanding();
    expect(screen.getAllByRole('link', { name: /sign in/i })).toHaveLength(2);
  });

  it('points every sign-in CTA at /login', () => {
    renderLanding();
    const ctas = screen.getAllByRole('link', { name: /sign in/i });
    ctas.forEach((a) => expect(a).toHaveAttribute('href', '/login'));
  });

  it('navigates to /login when a sign-in CTA is clicked (asChild Slot still renders a working link)', async () => {
    const user = userEvent.setup();
    renderLanding();
    const [firstCta] = screen.getAllByRole('link', { name: /sign in/i });
    await user.click(firstCta);
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});

describe('Landing — landmarks and structure', () => {
  it('exposes a main landmark', () => {
    renderLanding();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders the static operations index content', () => {
    renderLanding();
    expect(screen.getByText('Clusters')).toBeInTheDocument();
    expect(screen.getByText('Tenant Migrations')).toBeInTheDocument();
  });
});

describe('Landing — auth-check loading gate', () => {
  it('shows an announced status region while the auth check is loading, without rendering the main content', () => {
    auth.loading = true;
    renderLanding();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});

describe('Landing — authenticated redirect', () => {
  it('redirects an already-authenticated user to /dashboard', async () => {
    auth.isAuthenticated = true;
    renderLanding();
    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
  });
});
