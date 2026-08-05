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

const auth = vi.hoisted(() => ({ hasPlatformAuthority: true }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

// Layout pulls in AuthContext, the sidebar and localStorage; the 403 page only
// needs to prove it renders *inside* the shell.
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import Forbidden from './Forbidden';

beforeEach(() => {
  router.navigate.mockClear();
  router.key = 'a1b2c3';
});

const renderPage = () => render(<MemoryRouter><Forbidden /></MemoryRouter>);

describe('Forbidden (403)', () => {
  it('renders the status code, title and description inside the app shell', () => {
    renderPage();

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
    expect(screen.getByText(/don't have permission to access this page/i)).toBeInTheDocument();
  });

  it('"Go Back" steps back in history when there is somewhere to return to', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith(-1);
  });

  it('"Go Back" falls back to the dashboard when this is the first history entry', async () => {
    router.key = 'default';
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(router.navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('"Go to Dashboard" navigates to the dashboard', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));

    expect(router.navigate).toHaveBeenCalledWith('/dashboard');
  });
});
