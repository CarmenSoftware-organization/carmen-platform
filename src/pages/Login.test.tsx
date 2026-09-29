import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// `useAuth` is mocked (not the real AuthContext) — Login.tsx only reads
// `isAuthenticated` from it now that the password form is gone.
const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

// Login.tsx renders standalone under <MemoryRouter> with no <Routes> to swap on navigate
// (matches how it's actually reached — App.tsx's real router owns that), so it never
// unmounts here regardless of what navigate() is called with — asserting on the DOM can't
// tell "redirected" apart from "didn't". Spy on the real useNavigate instead.
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import Login from './Login';

const API_BASE = import.meta.env.REACT_APP_API_BASE_URL;

function renderLogin(initialEntries: string[] = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Login />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.isAuthenticated = false;
  navigateMock.mockClear();
  vi.stubGlobal('location', { href: '' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Login — sign-in entry points', () => {
  it('navigates to the plain Keycloak-hosted authorize endpoint on "Sign in"', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(window.location.href).toBe(
      `${API_BASE}/api/auth/authorize?app=platform&locale=en`,
    );
  });

  it('navigates to the Google-hinted authorize endpoint on "Sign in with Google"', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(window.location.href).toBe(
      `${API_BASE}/api/auth/google/authorize?app=platform&locale=en`,
    );
  });

  it('does not render a username/password form', () => {
    renderLogin();

    expect(screen.queryByLabelText(/username|email/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });
});

describe('Login — google callback error banner', () => {
  it('shows the translated message for the google_auth_failed sentinel', () => {
    renderLogin(['/login?error=google_auth_failed']);

    expect(screen.getByRole('alert')).toHaveTextContent(/sign-in failed/i);
  });

  it('shows the raw message for any other error value', () => {
    renderLogin(['/login?error=Something%20specific%20went%20wrong']);

    expect(screen.getByRole('alert')).toHaveTextContent('Something specific went wrong');
  });

  it('renders no alert when there is no error param', () => {
    renderLogin();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Login — already authenticated', () => {
  it('navigates to /dashboard instead of staying on the sign-in page', () => {
    auth.isAuthenticated = true;
    renderLogin();

    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('does not navigate away when not authenticated', () => {
    renderLogin();

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
