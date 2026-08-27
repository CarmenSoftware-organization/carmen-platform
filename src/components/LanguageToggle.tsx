import { Languages } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import type { Lang } from '../i18n/types';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

/**
 * The languages offered, in menu order. Shared with HeaderUserMenu's compact block,
 * which folds these options into the account dropdown on mobile — the same
 * arrangement THEME_OPTIONS uses.
 *
 * Each label is written in its own language, not translated: someone who has landed
 * in a language they cannot read still needs to find their way out.
 */
export const LANGUAGE_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
];

const LanguageToggle = () => {
  const { lang, setLang, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('language.switch')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGE_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem key={value} onClick={() => setLang(value)}>
            <span>{label}</span>
            {lang === value && (
              <span className="ml-auto pl-4 text-xs text-muted-foreground">&#10003;</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageToggle;
