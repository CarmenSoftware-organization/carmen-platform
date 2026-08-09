# `useDebouncedValue`

```ts
const [debouncedSearch, flushSearch] = useDebouncedValue(search, 400, onSettle?);
```

Returns `[debounced, flush]`. Debounce exists to stop **keystrokes** from firing a request per
character — nothing else.

## Timer vs `flush`

| Change | Path |
|---|---|
| typing into a text input | the timer (that's the point) |
| "Clear filter" button, drill-down into a related record, selecting from a dropdown | `flush(next)` |

A discrete, one-shot change must take effect immediately — waiting 400ms after a button click
reads as a broken button.

## `onSettle` — for side effects that must land in the same render

`onSettle` runs in the same tick as the internal `setDebounced`, so React batches them into one
render. Use it for state that must move *with* the debounced value — canonically resetting
pagination to page 1:

```ts
const [q] = useDebouncedValue(search, 400, () => setPaginate(p => ({ ...p, page: 1 })));
```

Doing that reset in a separate effect watching the debounced output instead produces two
renders — (new filter, stale page), then (new filter, page 1) — and the fetch fires once against
the mismatched intermediate state before the correct request goes out.

**`flush` does not call `onSettle`.** A handler that flushes must perform the side effect itself
in the same call stack (still one render).

## Constraints

- `T` must be `===`-comparable. Written for primitive filter values; passing an object refires
  on every render.
- **Debounce only when typing triggers a fetch.** Server-side list pages debounce
  (`ActivityEvent` does, via this hook). Client-filtered pages — `SuperAdmin`,
  `TenantMigration` — filter one already-fetched array in memory, so debouncing there only
  delays the UI for no saved request. See `pages/management-page.md`.
