import { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';

interface HeroNameProps {
  value: string;
  disabled: boolean;
  /** Accessible name for the editor. Defaults to the business unit wording. */
  label?: string;
  /** Shown when the name is blank. Defaults to the business unit wording. */
  emptyText?: string;
  /**
   * Draw the red required marker beside the name. Defaults to `true` so the two business-unit
   * call sites keep the mark they were built with.
   *
   * The cluster plate opts out. An asterisk marks a field you must fill before a submit; that
   * plate has no submit — the name commits on blur — so beside an already-saved name the mark
   * has nothing left to warn about, and it was landing in the loudest colour on the page right
   * next to the <h1>. `aria-required` on the editor is untouched either way: that is the part
   * of the contract that was never decoration.
   */
  showRequiredMarker?: boolean;
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
  label,
  emptyText,
  showRequiredMarker = true,
  onCommit,
}: HeroNameProps) {
  const { t } = useI18n();
  // `??`, not a JS default parameter — the fallback has to be a translated call, and default
  // parameter values can't reach a hook. src/pages/clusterAdmin/businessUnitForm/
  // BuPropertyPlate.tsx (slice 4) renders this component without either prop and inherits
  // these two defaults; src/pages/clusterEdit/ClusterPlate.tsx always passes its own
  // "Cluster name" / "(unnamed cluster)" literals, so it never reaches this fallback.
  const resolvedLabel = label ?? t('pages.businessUnits.heroNameLabel');
  const resolvedEmptyText = emptyText ?? t('pages.businessUnits.heroNameEmptyText');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place
        autoFocus
        aria-label={resolvedLabel}
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
        {value.trim() || resolvedEmptyText}
      </button>
      {showRequiredMarker && !disabled && (
        <span className="text-destructive text-base font-normal" aria-hidden="true">
          *
        </span>
      )}
    </span>
  );
}
