# Summary Band

Management pages carry a stat band above the table: `<Entity>Summary.tsx` in the page's subdirectory. Seven exist — `UserDirectorySummary`, `NewsroomSummary`, `ApplicationRegistrySummary`, `BuSummary`, `RolesAccessSummary`, `PlatformAccessSummary`, `FleetCapacity`.

## Preferred: read the aggregate from the backend

Reference: `UserPlatformManagement.tsx`.

```ts
const [summary, setSummary] = useState<PlatformUserRegistrySummary | null>(null);
setSummary(data?.summary ?? null);        // registry-wide, from the list response
```

The band is **registry-wide** — it describes the whole table, not the current page and not the active filters. Say so in a comment; readers assume otherwise.

`summary` stays `null` until the backend deploys (see `api/backend-deploy-order.md`). Render a headline the band can compute without it — `paginate.total` usually equals the top-line count.

## Aggregating client-side

Six older pages fetch every row and aggregate in the browser:

```ts
userService.getAll({ perpage: -1, advance: ... })
```

This works while the table is small and degrades quietly as it grows. Reach for it only after the options above don't fit:

1. Ask the backend for a `summary` block on the list endpoint
2. Derive the number from `paginate.total` on a filtered 1-row query — the pattern already used for the archived count
3. A **bounded** pagination loop with a `MAX_PAGES` guard
4. `perpage: -1` — acceptable when the backend can't be changed yet and the row count is genuinely bounded. Note the assumption in a comment so the next person can find it.

## Page wiring

Three state slots, loaded separately from the table:

```ts
const [summary, setSummary] = useState<T | null>(null);
const [summaryLoading, setSummaryLoading] = useState(true);
const [summaryError, setSummaryError] = useState(false);
```

- `loadSummary` is a `useCallback`; call it after **every** mutation, not just on mount
- Props are always `{ summary, loading, error, onRetry }`
- **The band fails independently.** On error set `summary = null` + `summaryError = true`; the table keeps working and the band shows its own inline retry. Never let a failed aggregate blank the page.
- Client-side shaping exports a pure `summarize<Entity>()` from the same file as the component — unit-test that, not the component
