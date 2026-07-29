import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const router = vi.hoisted(() => ({ navigate: vi.fn(), key: 'a1b2c3' }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => router.navigate,
    useLocation: () => ({ key: router.key }),
  };
});

const auth = vi.hoisted(() => ({ isAuthenticated: true, loading: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import NotFound from './NotFound';

beforeEach(() => {
  router.navigate.mockClear();
  router.key = 'a1b2c3';
  auth.isAuthenticated = true;
  auth.loading = false;
});

const renderPage = () => render(<MemoryRouter><NotFound /></MemoryRouter>);

describe('NotFound (404)', () => {
  it('shows only a loading placeholder while auth is resolving', () => {
    auth.loading = true;
    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // Without this gate the anonymous variant would flash before auth settles.
    expect(screen.queryByText('404')).toBeNull();
  });

  it('renders inside the app shell and offers the dashboard when authenticated', () => {
    renderPage();

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to home/i })).toBeNull();
  });

  it('renders without the app shell and offers home when logged out', () => {
    auth.isAuthenticated = false;
    renderPage();

    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to dashboard/i })).toBeNull();
  });

  it('"Go to Dashboard" navigates to the dashboard', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));

    expect(router.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('"Go to Home" navigates to the landing page when logged out', async () => {
    auth.isAuthenticated = false;
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go to home/i }));

    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  it('"Go Back" steps back in history when there is somewhere to return to', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('"Go Back" falls back to the landing page for a logged-out direct hit', async () => {
    auth.isAuthenticated = false;
    router.key = 'default';
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
