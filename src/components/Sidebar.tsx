import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { PanelLeft, PanelLeftClose, LogOut, User, Sun, Moon, type LucideIcon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  Tooltip,
  Avatar,
  Divider,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  type DialogOpenChangeData,
} from '@fluentui/react-components';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  superAdminOnly?: boolean;
  group?: string;
}

interface UserInfo {
  initials: string;
  displayName: string;
  email: string;
  role?: string;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  navItems: NavItem[];
  isMobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  userInfo: UserInfo;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  navItems,
  isMobileOpen,
  onMobileOpenChange,
  userInfo,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();

  const isActive = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navGroups = React.useMemo(() => {
    const groups: { label: string | null; items: NavItem[] }[] = [];
    for (const item of navItems) {
      const label = item.group ?? null;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [navItems]);

  const NavLink: React.FC<{ item: NavItem; showLabel: boolean }> = ({ item, showLabel }) => {
    const Icon = item.icon;
    const active = isActive(item.path);

    return (
      <Link
        to={item.path}
        className={cn(
          'sidebar-item-transition flex items-center gap-3 rounded-lg text-sm font-medium',
          showLabel ? 'px-3 py-2' : 'justify-center px-2 py-2',
          active
            ? 'bg-primary/15 text-primary shadow-sm'
            : 'text-muted-foreground hover:bg-white/50 hover:text-foreground hover:shadow-sm'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {showLabel && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const UserMenu: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance="transparent"
          className={cn(
            'w-full justify-start h-auto p-0',
            collapsed && 'justify-center'
          )}
        >
          <Avatar
            name={userInfo.displayName}
            badge={userInfo.role ? { status: 'available' } : undefined}
            className={cn('shrink-0', collapsed ? 'h-7 w-7' : 'h-8 w-8')}
          />
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left ml-3">
              <div className="text-sm font-medium truncate">{userInfo.displayName}</div>
              {userInfo.email && (
                <div className="text-xs text-muted-foreground truncate">{userInfo.email}</div>
              )}
            </div>
          )}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList className="w-56">
          <MenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={onLogout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'sidebar-transition fixed inset-y-0 left-0 z-30 hidden md:flex flex-col glass border-r border-white/10',
          isCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b border-white/10 shrink-0',
          isCollapsed ? 'justify-center px-2' : 'px-4'
        )}>
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            {!isCollapsed && (
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent truncate">
                Carmen
              </h1>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {navGroups.map((g, gi) => (
            <div key={g.label ?? `__top_${gi}`} className={gi > 0 ? 'mt-4' : ''}>
              {!isCollapsed && g.label && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g.label}
                </p>
              )}
              {isCollapsed && gi > 0 && <Divider className="!my-2" />}
              <div className="space-y-1">
                {g.items.map((item) =>
                  isCollapsed ? (
                    <Tooltip key={item.path} content={item.label} relationship="label">
                      <div>
                        <NavLink item={item} showLabel={false} />
                      </div>
                    </Tooltip>
                  ) : (
                    <NavLink key={item.path} item={item} showLabel={true} />
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: User Profile + Toggle */}
        <div className="shrink-0 border-t border-white/10 p-2 space-y-1">
          {isCollapsed ? (
            <div className="flex justify-center pb-1">
              <Tooltip content="View changelog" relationship="label">
                <div>v0.1.1</div>
              </Tooltip>
            </div>
          ) : (
            <div className="flex justify-start px-1 pb-1">
              <span className="text-xs text-muted-foreground">v0.1.1</span>
            </div>
          )}
          {isCollapsed ? (
            <Tooltip content={userInfo.displayName} relationship="label">
              <div>
                <UserMenu collapsed />
              </div>
            </Tooltip>
          ) : (
            <UserMenu />
          )}
          <Divider className="!my-1.5" />
          <div className={cn('flex gap-1', isCollapsed ? 'flex-col' : 'flex-row')}>
            <Button
              appearance="transparent"
              size="small"
              onClick={toggle}
              className={cn(
                'flex-1 sidebar-item-transition',
                isCollapsed ? 'justify-center px-2' : 'justify-start px-3'
              )}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {!isCollapsed && <span className="ml-2 text-sm">{isDark ? 'Light' : 'Dark'}</span>}
            </Button>
            <Button
              appearance="transparent"
              size="small"
              onClick={onToggle}
              className={cn(
                'flex-1 sidebar-item-transition',
                isCollapsed ? 'justify-center px-2' : 'justify-start px-3'
              )}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="mr-2 h-4 w-4" />
                  <span className="text-sm">Collapse</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Drawer open={isMobileOpen} onOpenChange={(_ev: unknown, data: DialogOpenChangeData) => onMobileOpenChange(data.open)}>
        <DrawerHeader>
          <DrawerHeaderTitle>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Carmen
              </span>
            </div>
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <nav className="py-2">
            {navGroups.map((g, gi) => (
              <div key={g.label ?? `__top_${gi}`} className={gi > 0 ? 'mt-4' : ''}>
                {g.label && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {g.label}
                  </p>
                )}
                <div className="space-y-1">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => onMobileOpenChange(false)}
                        className={cn(
                          'sidebar-item-transition flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                          active
                            ? 'bg-primary/15 text-primary shadow-sm'
                            : 'text-muted-foreground hover:bg-white/50 hover:text-foreground hover:shadow-sm'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </DrawerBody>
      </Drawer>
    </>
  );
};

export default Sidebar;
