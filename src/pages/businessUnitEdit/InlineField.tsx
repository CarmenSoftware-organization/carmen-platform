import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface InlineOption {
  value: string;
  label: string;
}

interface InlineFieldProps {
  name: string;
  label: string;
  value: string;
  type?: 'text' | 'number' | 'email' | 'textarea' | 'select';
  options?: InlineOption[];
  mono?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Renders a required marker and sets aria-required on the control. */
  required?: boolean;
  /** Commit a new value into formData. */
  onCommit: (name: string, value: string) => void;
  /** Optional field-level validation on commit. */
  onValidate?: (name: string, value: string) => void;
}

const inputBase =
  'w-full max-w-sm rounded-md border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring';

// The contract pairs the message with a destructive border; the border must track
// the error, not stay primary while the message shouts.
const inputClassFor = (error?: string) => cn(inputBase, error ? 'border-destructive' : 'border-primary');

/**
 * Read-mode control. The visual box stays compact (~32px) — a ~50-row form would
 * bloat badly at 44px of real padding — while an invisible ::before overlay
 * stretches the *tappable* area to 44px, centred on the row. Row pitch is already
 * 44px (12px wrapper padding + 32px control), so hit areas tile without overlap.
 * Per the A4 contract: "the tappable area governs, not the visual control".
 */
const readButtonClass =
  'group hover:bg-primary/5 relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default disabled:hover:bg-transparent ' +
  "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']";

/**
 * One row of the edit-in-place document: shows the value, and turns into an
 * input when clicked. Commits to formData on blur / Enter; Escape reverts.
 */
export function InlineField({
  name,
  label,
  value,
  type = 'text',
  options,
  mono,
  placeholder,
  error,
  disabled,
  required,
  onCommit,
  onValidate,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(name, draft);
    onValidate?.(name, draft);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const promptText = placeholder || `Set ${label.toLowerCase()}…`;
  // Selects store the option value (e.g. a UUID); show its human label in read mode.
  const displayValue =
    type === 'select'
      ? (options?.find((o) => o.value === value)?.label ?? (value.trim() ? value : null))
      : value.trim()
        ? value
        : null;

  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[150px_1fr] sm:items-start sm:gap-3">
      <span className="text-muted-foreground pt-2 text-xs">
        {label}
        {/* Required markers only mean something where the field can be filled in. */}
        {required && !disabled && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <div className="min-w-0">
        {editing ? (
          type === 'select' ? (
            <select
              // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place: focus the field the user just opened
              autoFocus
              aria-label={label}
              aria-required={required}
              aria-invalid={!!error}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setEditing(false);
                if (e.target.value !== value) onCommit(name, e.target.value);
              }}
              onBlur={cancel}
              className={inputClassFor(error)}
            >
              {/* Empty prompt so an unset select shows the placeholder (not the
                  first option as pre-selected) — otherwise picking that first
                  option fires no change event and never commits. */}
              <option value="" disabled>
                {promptText}
              </option>
              {options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : type === 'textarea' ? (
            <textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place
              autoFocus
              aria-label={label}
              aria-required={required}
              aria-invalid={!!error}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              rows={3}
              className={cn(inputClassFor(error), 'resize-y', mono && 'font-mono')}
            />
          ) : (
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place
              autoFocus
              aria-label={label}
              aria-required={required}
              aria-invalid={!!error}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onKeyDown}
              className={cn(inputClassFor(error), mono && 'font-mono')}
            />
          )
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className={cn(
              readButtonClass,
              !displayValue && 'text-muted-foreground italic',
              mono && displayValue && 'font-mono tabular-nums',
            )}
          >
            <span className="whitespace-pre-line">{displayValue ?? promptText}</span>
            {!disabled && (
              <Pencil className="text-muted-foreground/60 ml-auto size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        )}
        {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      </div>
    </div>
  );
}
