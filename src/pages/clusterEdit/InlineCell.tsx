import { useState } from 'react';
import { cn } from '../../lib/utils';

export interface InlineCellOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface InlineCellProps {
  value: string;
  display: React.ReactNode;
  options: InlineCellOption[];
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

const selectClass =
  'h-8 w-full max-w-[180px] rounded-md border border-primary bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Read-mode display that becomes a select on click; commits on change, reverts on Escape/blur. */
export function InlineCell({ value, display, options, ariaLabel, disabled, onCommit }: InlineCellProps) {
  const [editing, setEditing] = useState(false);

  if (disabled) return <>{display}</>;

  if (editing) {
    return (
      <select
        // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place: focus the field the user just opened
        autoFocus
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          setEditing(false);
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className={selectClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn('hover:bg-primary/5 -mx-1 rounded px-1 py-0.5 text-left transition-colors')}
    >
      {display}
    </button>
  );
}
