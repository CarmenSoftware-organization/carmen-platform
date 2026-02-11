import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { PanelLeft, PanelLeftClose, LogOut, User, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
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

  const isActive = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full rounded-lg hover:bg-white/50 sidebar-item-transition',
            collapsed ? 'justify-center px-2 h-9' : 'justify-start gap-3 px-3 h-auto py-2'
          )}
        >
          <Avatar className={cn('shrink-0 ring-2 ring-primary/20', collapsed ? 'h-7 w-7' : 'h-8 w-8')}>
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold">
              {userInfo.initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium truncate">{userInfo.displayName}</div>
              {userInfo.email && (
                <div className="text-xs text-muted-foreground truncate">{userInfo.email}</div>
              )}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 glass-strong"
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        sideOffset={8}
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userInfo.displayName}</p>
            {userInfo.email && (
              <p className="text-xs leading-none text-muted-foreground">{userInfo.email}</p>
            )}
            {userInfo.role && (
              <p className="text-xs leading-none text-muted-foreground capitalize mt-1">
                Role: {userInfo.role}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer rounded-lg">
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
          <div className="space-y-1">
            <TooltipProvider delayDuration={200}>
              {navItems.map((item) =>
                isCollapsed ? (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <div>
                        <NavLink item={item} showLabel={false} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <NavLink key={item.path} item={item} showLabel={true} />
                )
              )}
            </TooltipProvider>
          </div>
        </nav>

        {/* Bottom: User Profile + Toggle */}
        <div className="shrink-0 border-t border-white/10 p-2 space-y-1">
          {isCollapsed ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <UserMenu collapsed />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {userInfo.displayName}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <UserMenu />
          )}
          <Separator className="!my-1.5" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
              'w-full sidebar-item-transition',
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
      </aside>

      {/* Mobile Sheet */}
      <Sheet open={isMobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 p-0 glass-strong flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Carmen
              </span>
            </SheetTitle>
          </SheetHeader>
          <Separator className="my-2" />
          <nav className="flex-1 px-2 py-2">
            <div className="space-y-1">
              {navItems.map((item) => {
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
          </nav>
          {/* Mobile User Profile */}
          <div className="shrink-0 border-t border-white/10 p-2">
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default Sidebar;
