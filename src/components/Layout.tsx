import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { LayoutDashboard, Network, Building2, Users, FileText, Menu, Printer, Newspaper, Megaphone, AppWindow, ShieldCheck, ShieldAlert, UserCog, DatabaseZap, Database } from 'lucide-react';
import Sidebar, { type NavItem } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, hasPermission, isSuperAdmin } = useAuth();
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
    // Organization
    { path: '/clusters', label: 'Clusters', icon: Network, permission: 'cluster.read', group: 'Organization' },
    { path: '/business-units', label: 'Business Units', icon: Building2, permission: 'cluster.read', group: 'Organization' },
    { path: '/tenant-migrations', label: 'Tenant Migrations', icon: DatabaseZap, permission: 'cluster.read', group: 'Organization' },
    { path: '/users', label: 'Users', icon: Users, permission: 'user.read', group: 'Organization' },
    // Content
    { path: '/report-templates', label: 'Report Templates', icon: FileText, permission: 'report_template.read', group: 'Content' },
    { path: '/print-template-mapping', label: 'Print Mapping', icon: Printer, permission: 'print_template_mapping.read', group: 'Content' },
    { path: '/news', label: 'News', icon: Newspaper, permission: 'news.read', group: 'Content' },
    { path: '/broadcasts/new', label: 'Send Broadcast', icon: Megaphone, permission: 'broadcast.send', group: 'Content' },
    // Platform
    { path: '/applications', label: 'Applications', icon: AppWindow, permission: 'application.read', group: 'Platform' },
    { path: '/platform/roles', label: 'Roles', icon: ShieldCheck, permission: 'role.read', group: 'Platform' },
    { path: '/platform/super-admins', label: 'Super Admins', icon: ShieldAlert, superAdminOnly: true, group: 'Platform' },
    { path: '/platform/user-platform', label: 'User Platform', icon: UserCog, permission: 'user_platform.read', group: 'Platform' },
    { path: '/sql-workbench', label: 'SQL Workbench', icon: Database, permission: 'sql_workbench.read', group: 'Platform' },
  ];

  const navItems = allNavItems.filter(
    (item) =>
      (!item.permission || hasPermission(item.permission)) &&
      (!item.superAdminOnly || isSuperAdmin),
  );

  const getFullName = (): string => {
    const info = user?.user_info;
    const firstname = user?.firstname || info?.firstname;
    const middlename = user?.middlename || info?.middlename;
    const lastname = user?.lastname || info?.lastname;
    const parts = [firstname, middlename, lastname].filter(Boolean);
    return parts.join(' ');
  };

  const getUserInitials = (): string => {
    if (user?.alias_name) {
      return user.alias_name.toUpperCase().slice(0, 2);
    }
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
    <div className="min-h-dvh bg-background">
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
        'min-h-dvh sidebar-transition',
        isCollapsed ? 'md:ml-16' : 'md:ml-60'
      )}>
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 bg-background border-b border-border md:hidden">
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
                <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shadow-sm transition-shadow">
                  <span className="text-white font-bold text-base">C</span>
                </div>
                <h1 className="text-lg font-bold text-foreground hidden sm:block">
                  Carmen Platform
                </h1>
              </Link>
            </div>
          </div>
        </header>

        {/* Desktop breadcrumb bar */}
        <div className="sticky top-0 z-30 hidden h-12 items-center border-b border-border bg-background/80 px-6 backdrop-blur md:flex">
          <Breadcrumbs />
        </div>

        {/* Main Content */}
        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
