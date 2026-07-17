import { cn } from '../lib/utils';

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
  message = "Couldn't load this.",
  onRetry,
  retryLabel = 'Try again',
  className,
}: FetchErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground', className)}
    >
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="text-primary underline underline-offset-2">
        {retryLabel}
      </button>
    </div>
  );
}
