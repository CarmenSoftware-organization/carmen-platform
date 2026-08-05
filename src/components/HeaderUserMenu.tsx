import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDarkMode } from '../hooks/useDarkMode';
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

export interface UserInfo {
  initials: string;
  displayName: string;
  email: string;
}

interface HeaderUserMenuProps {
  userInfo: UserInfo;
  onLogout: () => void;
  /** Mobile placement: the header has no room for separate theme and version
   *  controls, so they fold into this dropdown instead. */
  compact?: boolean;
}

const HeaderUserMenu = ({ userInfo, onLogout, compact = false }: HeaderUserMenuProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useDarkMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('rounded-full', compact && 'h-10 w-10')}
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
              <Link to="/changelog" className="font-mono text-xs">
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
