import { useState } from 'react';
import { cn } from '../../lib/utils';

export interface PlateFieldProps {
  name: string;
  label: string;
  value: string;
  /**
   * Sets `aria-required` on the editor. Deliberately draws no `*`: an asterisk marks a field
   * you must fill before a submit, and this plate has no submit — every field commits on blur.
   * On a record that is already saved and already showing its value, the mark could only ever
   * decorate. The moment it would have something to say is the moment someone blanks the
   * field, and `validateField` already says it there, in words, through `error`.
   */
  required?: boolean;
  /** Shown in place of the value when it is blank. */
  placeholder?: string;
  /**
   * Hint shown inside the input while editing. Split from `placeholder` because the two say
   * different things: the read state reports that nothing is set, while the editor is where a
   * constraint like "Max 3 chars" is actually useful. One string doing both makes the plate
   * read as a form full of instructions.
   */
  editPlaceholder?: string;
  error?: string;
  disabled?: boolean;
  /** Commit a new value into formData. */
  onCommit: (name: string, value: string) => void;
  /** Optional field-level validation on commit. */
  onValidate?: (name: string, value: string) => void;
}

/**
 * One identifier on the cluster's plate: a small caption followed by the value, where the
 * value is the editor.
 *
 * Deliberately not `InlineField`. That one is a *document* row — label in a 150px gutter,
 * value on the right, one field per line — which is right for a form of fifteen fields and
 * wrong here: the plate sets a cluster's two identifiers on the same line as the words that
 * frame them, so they read as a caption, the way a code reads on a luggage tag. Committing,
 * reverting and the 44px tap target are the same contract as `InlineField`, on purpose:
 * Enter or blur commits, Escape reverts, the visual control stays 20px tall.
 */
export function PlateField({
  name,
  label,
  value,
  required,
  placeholder,
  editPlaceholder,
  error,
  disabled,
  onCommit,
  onValidate,
}: PlateFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(name, draft);
    onValidate?.(name, draft);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const prompt = placeholder || `Set ${label.toLowerCase()}…`;
  const editPrompt = editPlaceholder || prompt;
  const display = value.trim() ? value : null;

  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-muted-foreground shrink-0 text-[11px] tracking-wide uppercase">{label}</span>
      {editing ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place: focus the field the user just opened
          autoFocus
          aria-label={label}
          aria-required={required}
          aria-invalid={!!error}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder={editPrompt}
          className={cn(
            'bg-background text-foreground w-36 rounded-md border px-1.5 py-0.5 font-mono text-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
            error ? 'border-destructive' : 'border-primary',
          )}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className={cn(
            // Same ::before trick as InlineField: the visual chip stays on the caption's
            // baseline while the tappable area is a full 44px.
            "hover:bg-primary/5 relative -mx-1 truncate rounded px-1 font-mono text-sm tracking-wide disabled:hover:bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']",
            !display && 'text-muted-foreground font-sans italic',
          )}
        >
          {display ?? prompt}
        </button>
      )}
      {error && <span className="text-destructive text-xs">{error}</span>}
    </span>
  );
}
