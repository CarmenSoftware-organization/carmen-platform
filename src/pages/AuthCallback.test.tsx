import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ loginWithTokens: vi.fn() }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}));

import AuthCallback from './AuthCallback';

function Where() {
  const location = useLocation();
  return <div data-testid="where">{`${location.pathname}${location.search}`}</div>;
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/login/callback']}>
      <Routes>
        <Route path="/login/callback" element={<AuthCallback />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const originalHash = window.location.hash;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.location.hash = originalHash;
});

describe('AuthCallback', () => {
  it('signs in with the fragment tokens and lands on the dashboard by default', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr';
    auth.loginWithTokens.mockResolvedValue({ success: true });

    const { findByTestId } = renderCallback();

    expect(await findByTestId('where')).toHaveTextContent('/dashboard');
    expect(auth.loginWithTokens).toHaveBeenCalledWith('acc', 'rfr');
  });

  it('returns to the deep link carried in `next`', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr&next=%2Fclusters';
    auth.loginWithTokens.mockResolvedValue({ success: true });

    const { findByTestId } = renderCallback();

    expect(await findByTestId('where')).toHaveTextContent('/clusters');
  });

  it('refuses an off-site `next` and falls back to the dashboard', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr&next=%2F%2Fevil.example.com';
    auth.loginWithTokens.mockResolvedValue({ success: true });

    const { findByTestId } = renderCallback();

    expect(await findByTestId('where')).toHaveTextContent('/dashboard');
  });

  it('goes back to /login with the access-denied code when the user has no Platform authority', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr';
    auth.loginWithTokens.mockResolvedValue({
      success: false,
      code: 'access_denied_platform',
      error: 'Access Denied. You are not authorized to access this platform.',
    });

    const { findByTestId } = renderCallback();

    expect(await findByTestId('where')).toHaveTextContent('/login?error=access_denied_platform');
  });

  it('goes back to /login with the generic Google error code on any other failure', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr';
    auth.loginWithTokens.mockResolvedValue({ success: false, code: 'login_failed', error: 'x' });

    const { findByTestId } = renderCallback();

    expect(await findByTestId('where')).toHaveTextContent('/login?error=google_failed');
  });

  it('goes back to /login without calling the sign-in when the tokens are missing', async () => {
    window.location.hash = '';

    const { findByTestId } = renderCallback();

    await waitFor(async () =>
      expect(await findByTestId('where')).toHaveTextContent('/login?error=google_failed'),
    );
    expect(auth.loginWithTokens).not.toHaveBeenCalled();
  });
});

describe('AuthCallback — fragment hygiene', () => {
  it('removes the tokens from the address bar as soon as it has read them', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr';
    auth.loginWithTokens.mockResolvedValue({ success: true });

    const { findByTestId } = renderCallback();
    await findByTestId('where');

    expect(window.location.hash).toBe('');
  });

  it('signs in once under StrictMode (the effect runs twice in dev) and still lands on the dashboard', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr';
    auth.loginWithTokens.mockResolvedValue({ success: true });

    const { findByTestId } = render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/login/callback']}>
          <Routes>
            <Route path="/login/callback" element={<AuthCallback />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>,
    );

    expect(await findByTestId('where')).toHaveTextContent('/dashboard');
    expect(auth.loginWithTokens).toHaveBeenCalledTimes(1);
  });

  it('does not forward an unsafe `next` back to /login', async () => {
    window.location.hash = '#access_token=acc&refresh_token=rfr&next=%2F%09%2Fevil.example.com';
    auth.loginWithTokens.mockResolvedValue({ success: false, code: 'login_failed', error: 'x' });

    const { findByTestId } = renderCallback();

    const where = await findByTestId('where');
    expect(where).toHaveTextContent('/login?error=google_failed');
    expect(where).not.toHaveTextContent('evil');
  });
});
