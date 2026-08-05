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

const auth = vi.hoisted(() => ({ loading: false, hasPlatformAuthority: true }));
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
  auth.loading = false;
});

const renderPage = () => render(<MemoryRouter><NotFound /></MemoryRouter>);

describe('NotFound (404)', () => {
  it('shows only a loading placeholder while auth is resolving', () => {
    auth.loading = true;
    renderPage();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    // Without this gate the shell flashes an empty sidebar during the window
    // where AuthProvider is still deciding whether to redirect to /login.
    expect(screen.queryByText('404')).toBeNull();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('renders the status inside the app shell once auth has resolved', () => {
    renderPage();

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist or may have been moved/i)).toBeInTheDocument();
  });

  it('offers exactly two ways out', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument();
    // The shell-less logged-out variant was removed — AuthProvider redirects an
    // anonymous visitor to /login before this page can render.
    expect(screen.queryByRole('button', { name: /go to home/i })).toBeNull();
  });

  it('"Go to Dashboard" navigates to the dashboard', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));

    expect(router.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('"Go Back" steps back in history when there is somewhere to return to', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('"Go Back" falls back to the dashboard on a direct hit', async () => {
    router.key = 'default';
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
