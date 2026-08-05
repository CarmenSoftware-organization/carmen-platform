import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Network, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback } from './ui/avatar';
import { THEME_OPTIONS } from './ThemeToggle';
import { CURRENT_VERSION } from './VersionBadge';

interface HeaderUserInfo {
  initials: string;
  displayName: string;
  email: string;
}

interface HeaderUserMenuProps {
  userInfo: HeaderUserInfo;
  onLogout: () => void;
  /** Mobile placement: the header has no room for separate theme and version
   *  controls, so they fold into this dropdown instead. */
  compact?: boolean;
}

const HeaderUserMenu = ({ userInfo, onLogout, compact = false }: HeaderUserMenuProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useDarkMode();
  const { adminScope, effectivePermissions, isSuperAdmin } = useAuth();

  const inClusterAdmin = location.pathname.startsWith('/cluster-admin');
  const canClusterAdmin = !!adminScope && (adminScope.all || adminScope.clusters.length > 0);
  // Match checkPermission's bare (no clusterId) rule — and the login gate at
  // AuthContext.tsx's hasAnyPermission — rather than only the platform-scoped slice: a user
  // with cluster-scoped platform permissions (no platform-wide grant) still sees platform nav
  // items everywhere else in the app, so this item must not be the one place that disagrees.
  const canPlatformAdmin =
    isSuperAdmin ||
    (effectivePermissions?.platform.length ?? 0) > 0 ||
    Object.keys(effectivePermissions?.clusters ?? {}).length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('rounded-full', compact && 'h-11 w-11')}
          aria-label={`User menu — ${userInfo.displayName}`}
        >
          <Avatar className={compact ? 'h-8 w-8' : 'h-7 w-7'}>
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {userInfo.initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{userInfo.displayName}</div>
          {userInfo.email && (
            <div className="truncate text-xs text-muted-foreground">{userInfo.email}</div>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {inClusterAdmin && canPlatformAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Platform Admin view</span>
          </DropdownMenuItem>
        )}
        {!inClusterAdmin && canClusterAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/cluster-admin')}>
            <Network className="mr-2 h-4 w-4" />
            <span>Cluster Admin view</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>

        {compact && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                <Icon className="mr-2 h-4 w-4" />
                <span>{label}</span>
                {theme === value && (
                  <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/changelog" className="font-mono text-[11px]">
                v{CURRENT_VERSION}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onLogout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default HeaderUserMenu;
