import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import Sidebar, { type NavItem } from './Sidebar';

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/users', label: 'Users', icon: Users, group: 'Organization' },
];

type SidebarProps = React.ComponentProps<typeof Sidebar>;

const renderSidebar = (props?: Partial<SidebarProps>) => {
  const onMobileOpenChange = vi.fn();
  const utils = render(
    <MemoryRouter>
      <Sidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        navItems={navItems}
        isMobileOpen={false}
        onMobileOpenChange={onMobileOpenChange}
        {...props}
      />
    </MemoryRouter>
  );
  return { ...utils, onMobileOpenChange };
};

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
