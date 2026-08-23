import { useState } from 'react';

interface HeroNameProps {
  value: string;
  disabled: boolean;
  /** Accessible name for the editor. Defaults to the business unit wording. */
  label?: string;
  /** Shown when the name is blank. Defaults to the business unit wording. */
  emptyText?: string;
  onCommit: (v: string) => void;
}

/**
 * The business unit's name, edited in place. Rendered as the `PageHeader` title so
 * the page has a real <h1> while keeping this page's one-document editing model
 * (there is no read/edit toggle — write access is gated on `canEdit` alone).
 *
 * `name` is one of the three fields `validateRequired()` enforces, hence the
 * required marker — shown only when the field is actually editable.
 *
 * The two wording props exist because the cluster plate reuses this editor verbatim: the
 * geometry, commit/revert semantics and 44px tap target are the same problem on both pages,
 * and only the words differ. They default to the business unit strings so this file's
 * original call sites read exactly as before.
 */
export function HeroName({
  value,
  disabled,
  label = 'Business unit name',
  emptyText = '(unnamed business unit)',
  onCommit,
}: HeroNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place
        autoFocus
        aria-label={label}
        aria-required="true"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="border-primary bg-background text-foreground w-full max-w-sm rounded-md border px-2 py-0.5 text-xl font-semibold tracking-tight outline-hidden"
      />
    );
  }

  return (
    <span className="inline-flex items-baseline gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="hover:bg-primary/5 -mx-1.5 min-h-[44px] rounded px-1.5 text-left disabled:hover:bg-transparent sm:min-h-0"
      >
        {value.trim() || emptyText}
      </button>
      {!disabled && (
        <span className="text-destructive text-base font-normal" aria-hidden="true">
          *
        </span>
      )}
    </span>
  );
}
