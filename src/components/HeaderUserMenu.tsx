import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
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
  const { hasPlatformAuthority, hasClusterAdminScope, adminScope } = useAuth();
  const { clusterId } = useParams<{ clusterId: string }>();

  const inClusterAdmin = location.pathname.startsWith('/cluster-admin');

  // A clusterId in the URL wins outright, whatever the user's platform authority: a super admin
  // who has switched into the cluster-admin view is *in* it, and opening Profile must not
  // silently eject them into the platform shell — that is what the "Platform Admin view" item
  // above is for. On the picker page (/cluster-admin, no param) a membership-only admin falls
  // back to their first cluster; the choice is arbitrary and harmless, since Profile's content
  // is identical under every cluster and only the sidebar differs.
  const fallbackClusterId = hasPlatformAuthority ? undefined : adminScope?.clusters[0]?.id;
  const profileClusterId = clusterId ?? fallbackClusterId;
  const profileTo = profileClusterId ? `/cluster-admin/${profileClusterId}/profile` : '/profile';

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

        {inClusterAdmin && hasPlatformAuthority && (
          <DropdownMenuItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Platform Admin view</span>
          </DropdownMenuItem>
        )}
        {!inClusterAdmin && hasClusterAdminScope && (
          <DropdownMenuItem onSelect={() => navigate('/cluster-admin')}>
            <Network className="mr-2 h-4 w-4" />
            <span>Cluster Admin view</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => navigate(profileTo)}>
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
