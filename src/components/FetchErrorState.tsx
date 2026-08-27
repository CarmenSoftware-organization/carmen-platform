import { cn } from '../lib/utils';
import { useI18n } from '../hooks/useI18n';

export interface FetchErrorStateProps {
  message?: string;
  onRetry: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Compact inline "sub-fetch failed" affordance: muted message + underlined retry button.
 * Presentational only — callers own the fetch and pass `onRetry`; use `className` to
 * fit the surrounding card/panel (bordered callout, flex band, etc).
 */
export function FetchErrorState({
  message,
  onRetry,
  retryLabel,
  className,
}: FetchErrorStateProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground', className)}
    >
      <span>{message ?? t('common.couldNotLoad')}</span>{' '}
      <button type="button" onClick={onRetry} className="text-primary underline underline-offset-2">
        {retryLabel ?? t('common.tryAgain')}
      </button>
    </div>
  );
}
