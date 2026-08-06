import { useEffect, useRef, useState } from 'react';

/**
 * Debounces `value` by `delayMs` before it is reflected in the returned
 * tuple's first element.
 *
 * `onSettle`, if given, runs exactly when the debounce timer actually fires
 * — in the same tick as the `setDebounced` call, so React batches them into
 * one render. Use it for a side effect that must land atomically with the
 * debounced value (e.g. resetting a paginate page to 1): if that reset were
 * done in a separate effect watching the debounced output instead, the
 * settle would commit in one render (new filter, still-stale page) and the
 * reset in the next (correct page) — two renders means `fetchEvents` (or
 * whatever consumes the debounced value) fires an extra request against the
 * mismatched intermediate state before the corrected one goes out.
 *
 * The second returned element, `flush`, bypasses the delay entirely — call
 * it for discrete, one-shot changes (a "clear filter" button, jumping to a
 * related record via a drill-down action) that must take effect
 * immediately. `flush` does NOT call `onSettle` — callers that need a
 * side effect there too are expected to trigger it themselves in the same
 * handler (still batched, since it's the same synchronous call stack).
 * Only keystroke-driven typing into a text input should ever go through the
 * timer path at all.
 *
 * `T` must be safely comparable with `===` (this hook is written for the
 * primitive string filter values it's used for in this app).
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  onSettle?: (next: T) => void,
): [T, (next: T) => void] {
  const [debounced, setDebounced] = useState(value);
  // The most recent `value` this hook has already reflected into `debounced`
  // — via either the timer firing or a `flush` call. Lets the effect below
  // no-op when a flush already applied the value it was about to schedule,
  // and lets a flush pre-empt an in-flight timer without a stale double-set.
  const appliedRef = useRef(value);

  useEffect(() => {
    if (value === appliedRef.current) return;
    const t = setTimeout(() => {
      appliedRef.current = value;
      setDebounced(value);
      onSettle?.(value);
    }, delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, onSettle]);

  const flush = (next: T) => {
    appliedRef.current = next;
    setDebounced(next);
  };

  return [debounced, flush];
}
