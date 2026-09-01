import { useCallback, useRef } from 'react';
import { useI18n } from '../../hooks/useI18n';

interface PaneDividerProps {
  /** Share of the split region the pane BELOW the divider takes, 0–1. */
  value: number;
  onChange: (next: number) => void;
  /** The element the two panes divide — the drag maps pointer position to a share of its height. */
  regionRef: React.RefObject<HTMLDivElement | null>;
  /** Share to return to on double-click / Home. */
  defaultValue: number;
  min?: number;
  max?: number;
}

/** Keyboard nudge, in share units — roughly one text row on a typical pane. */
const STEP = 0.03;

/**
 * The handle between the SQL editor and the result grid.
 *
 * How much of the pane the rows deserve is a question about the query, not about the app: a
 * 40-line procedure and a 5000-row SELECT want opposite splits, and the same person wants both
 * within a minute of each other. So the split is theirs to set, and it is remembered.
 *
 * Desktop only. Below `lg` the work column is content-height rather than a fixed frame, so the
 * flex shares have nothing to divide and each pane stands on its own min-height instead.
 */
export function PaneDivider({
  value,
  onChange,
  regionRef,
  defaultValue,
  min = 0.15,
  max = 0.85,
}: PaneDividerProps) {
  const { t } = useI18n();
  const draggingRef = useRef(false);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const applyFromPointer = useCallback(
    (clientY: number) => {
      const region = regionRef.current;
      if (!region) return;
      const rect = region.getBoundingClientRect();
      if (rect.height <= 0) return;
      // Measured from the bottom: the divider's job is "how much do the rows get".
      onChange(clamp((rect.bottom - clientY) / rect.height));
    },
    [regionRef, onChange, clamp],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Pointer capture, not window listeners: the drag keeps tracking when the cursor leaves the
    // 6px handle — which it does immediately — and releases cleanly if the pointer is cancelled.
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    applyFromPointer(e.clientY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Up grows the pane below, matching the drag: moving the divider up gives the rows more room.
    if (e.key === 'ArrowUp') onChange(clamp(value + STEP));
    else if (e.key === 'ArrowDown') onChange(clamp(value - STEP));
    else if (e.key === 'Home') onChange(defaultValue);
    else return;
    e.preventDefault();
  };

  return (
    // A focusable `separator` carrying aria-valuenow IS the ARIA window-splitter pattern — the
    // role is defined to take focus and arrow keys when it is a resize handle. jsx-a11y only
    // knows `separator` in its static, decorative form and so reads both the key handler and the
    // tabIndex as mistakes.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('pages.sqlWorkbench.resizeResults')}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      title={t('pages.sqlWorkbench.resizeResultsHint')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onChange(defaultValue)}
      className="group border-border hover:bg-primary/15 focus-visible:bg-primary/15 focus-visible:ring-ring hidden h-1.5 shrink-0 cursor-row-resize touch-none items-center justify-center border-t outline-hidden focus-visible:ring-2 focus-visible:ring-inset lg:flex"
    >
      {/* A grip, not a full-width bar: the divider has to read as draggable without becoming a
          second horizontal rule competing with the pane borders it sits between. */}
      <span
        aria-hidden="true"
        className="bg-border group-hover:bg-primary group-focus-visible:bg-primary h-0.5 w-8 rounded-full transition-colors"
      />
    </div>
  );
}
