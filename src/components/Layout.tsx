import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { LayoutDashboard, Network, Building2, Users, Menu } from 'lucide-react';
import Sidebar, { type NavItem } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile sheet on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const newValue = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', String(newValue));
      } catch {
        // localStorage unavailable
      }
      return newValue;
    });
  };

  const allNavItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/clusters', label: 'Clusters', icon: Network, roles: ['platform_admin', 'support_manager', 'support_staff'] },
    { path: '/business-units', label: 'Business Units', icon: Building2 },
    { path: '/users', label: 'Users', icon: Users },
  ];

  const navItems = allNavItems.filter(item => !item.roles || hasRole(item.roles));

  const getFullName = (): string => {
    const info = user?.user_info;
    const firstname = user?.firstname || info?.firstname;
    const middlename = user?.middlename || info?.middlename;
    const lastname = user?.lastname || info?.lastname;
    const parts = [firstname, middlename, lastname].filter(Boolean);
    return parts.join(' ');
  };

  const getUserInitials = (): string => {
    const fullName = getFullName();
    if (fullName) {
      return fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.name) {
      return user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const userInfo = {
    initials: getUserInitials(),
    displayName: getFullName() || user?.name || user?.email || 'User',
    email: user?.email || '',
    role: user?.role,
  };

  return (
    <div className="min-h-screen bg-background bg-mesh">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={toggleSidebar}
        navItems={navItems}
        isMobileOpen={isMobileOpen}
        onMobileOpenChange={setIsMobileOpen}
        userInfo={userInfo}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className={cn(
        'min-h-screen sidebar-transition',
        isCollapsed ? 'md:ml-16' : 'md:ml-60'
      )}>
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 glass border-b border-white/10 md:hidden">
          <div className="px-4">
            <div className="flex h-14 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Link to="/dashboard" className="flex items-center gap-3 group">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
                  <span className="text-white font-bold text-base">C</span>
                </div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent hidden sm:block">
                  Carmen Platform
                </h1>
              </Link>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
