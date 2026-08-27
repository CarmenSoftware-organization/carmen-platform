import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useI18n } from '../hooks/useI18n';
import type { TKey } from '../i18n/types';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

export type ThemeValue = 'light' | 'dark' | 'system';

export const THEME_OPTIONS: { value: ThemeValue; labelKey: TKey; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'theme.light', icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', icon: Moon },
  { value: 'system', labelKey: 'theme.system', icon: Monitor },
];

const ThemeToggle = () => {
  const { theme, setTheme } = useDarkMode();
  const { t } = useI18n();
  const active = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('theme.switch')}>
          <ActiveIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon className="mr-2 h-4 w-4" />
            <span>{t(labelKey)}</span>
            {theme === value && (
              <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
