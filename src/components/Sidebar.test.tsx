import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import Sidebar, { type NavItem } from './Sidebar';
import { ThemeProvider } from '../hooks/useDarkMode';

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/users', label: 'Users', icon: Users, group: 'Organization' },
];

const userInfo = { initials: 'JD', displayName: 'Jane Doe', email: 'jane@example.com', role: 'admin' };

// Node 26 exposes bare `localStorage` as undefined (experimental global requires
// --localstorage-file); jsdom's window.localStorage doesn't win at the bare reference.
// useDarkMode's ThemeProvider calls localStorage.getItem/setItem directly, so stub it.
const makeLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    setItem: (k: string, v: string) => { store[k] = v; },
    getItem: (k: string) => store[k] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    length: 0,
    key: (_: number) => null,
  };
};

type SidebarProps = React.ComponentProps<typeof Sidebar>;

const renderSidebar = (props?: Partial<SidebarProps>) => {
  const onMobileOpenChange = vi.fn();
  const utils = render(
    <MemoryRouter>
      <ThemeProvider>
        <Sidebar
          isCollapsed={false}
          onToggle={vi.fn()}
          navItems={navItems}
          isMobileOpen={false}
          onMobileOpenChange={onMobileOpenChange}
          userInfo={userInfo}
          onLogout={vi.fn()}
          {...props}
        />
      </ThemeProvider>
    </MemoryRouter>
  );
  return { ...utils, onMobileOpenChange };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorage());

  // jsdom does not implement matchMedia; useDarkMode's ThemeProvider needs it.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sidebar', () => {
  it('renders grouped nav items with group label', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('does not render the mobile sheet dialog when closed', () => {
    renderSidebar({ isMobileOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the mobile sheet with nav items when open, and closes on nav click', () => {
    const { onMobileOpenChange } = renderSidebar({ isMobileOpen: true });
    const dialog = screen.getByRole('dialog');
    const usersLink = within(dialog).getByRole('link', { name: 'Users' });
    fireEvent.click(usersLink);
    expect(onMobileOpenChange).toHaveBeenCalledWith(false);
  });
});
