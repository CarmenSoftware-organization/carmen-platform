# Fetching Hooks — race guards

Any hook that fires a request from an effect must guard against a stale response landing after
a newer one. Pick by whether the hook refetches.

## One-shot load → `cancelled` flag

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    const data = await service.getAll(…);
    if (cancelled) return;
    setOptions(data);
  })();
  return () => { cancelled = true; };
}, []);
```

Reference: `useAnalyticsFilterOptions`.

## Refetching on changing input → generation counter

A `cancelled` flag alone is not enough: two in-flight requests can both be "current", and the
slower, older one resolves last.

```ts
const generationRef = useRef(0);
const generation = ++generationRef.current;
service.getAll({ search: q }).then((res) => {
  if (generation !== generationRef.current) return;   // stale — drop it
  setResults(res.data);
});
```

Guard **every** branch — `then`, `catch` and `finally`. A `setLoading(false)` from a dropped
response turns the spinner off while the current request is still running.

Reference: `useUserSearch`.

## A failed fetch must stay retryable

If the hook memoises "this query is already fetched", clear that memo in `catch` — otherwise
the failure is permanent for that input and reopening the dropdown shows a stuck error.

```ts
.catch((err) => {
  setError(parseApiError(err).message);
  fetchedQueryRef.current = null;   // forget it, so the same query can be retried
})
```

## Keep previous results when disabled

`enabled: false` (e.g. a closed dropdown) stops requests — it does **not** clear state.
Reopening should show what it showed before, not flash empty.
