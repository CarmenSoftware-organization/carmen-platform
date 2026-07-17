/**
 * Icon/text-button hit-slop. The visual control stays compact (so dense layouts —
 * tables, accordions, chip grids — don't bloat), while an invisible `::before`
 * overlay stretches the *tappable* area to 44px, centred on the control. Per the
 * A4 contract: "the tappable area governs, not the visual control."
 *
 * Shared across ClusterEdit, ApplicationEdit, ReportTemplateEdit, and
 * userEdit/UserAccessTree — hoist here rather than re-declaring per file.
 */
export const HIT_SLOP_44 =
  "relative before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

/** Same idea for a full-width text trigger: stretch the tappable band to 44px tall. */
export const HIT_SLOP_44_ROW =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']";
