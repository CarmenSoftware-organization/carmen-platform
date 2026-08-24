# Summary Band

Management pages carry a stat band above the table: `<Entity>Summary.tsx` in the page's subdirectory. Seven exist — `UserDirectorySummary`, `NewsroomSummary`, `ApplicationRegistrySummary`, `BuSummary`, `RolesAccessSummary`, `PlatformAccessSummary`, `FleetCapacity`.

## Decide first: what does the band claim to describe?

Before picking a data source, answer one question:

> **Does this band sit above the filter and claim to describe the whole set, or does it describe the filtered result set?**

Get this backwards and the band either lies about scope (renders registry-wide numbers under a "matches your search" framing) or moves when it shouldn't (tracks the filter when it sits above one, claiming to describe everything). The second failure is the one this file used to prescribe: five bands sat above their filter bar yet read the list endpoint's filter-scoped `summary`, so typing into `/news`'s search box could turn a page with three published articles into "Nothing published yet — Publish an article to make it visible to readers." Full incident and fix: `docs/superpowers/specs/2026-08-24-summary-band-follows-filter-five-pages-design.md`.

Pick the section below that matches what your band claims — they use different sources on purpose, and swapping one for the other is exactly the bug above.

## Band describes the filtered result set: read the aggregate from the backend

Reference: `UserPlatformManagement.tsx:60-66`. Also on this side: `/licenses` (`SubscriptionTable.tsx:137-139`).

```ts
const [summary, setSummary] = useState<PlatformUserRegistrySummary | null>(null);
setSummary(data?.summary ?? null);        // registry-wide, from the list response
```

The band is **filter-consistent** — it describes every row matching the current `advance` filter and `search`, not just the current page. It is *not* registry-wide: changing a filter changes the band, and for `/user-platform` and `/licenses` that's the intended behavior, not a bug — both bands sit inside the filtered view and answer "how many of what I'm looking at now." `summary.total` equals `paginate.total` whenever the list is showing live rows only, which is the invariant to assert. Say so in a comment; readers assume registry-wide otherwise.

`summary` stays `null` until the backend deploys (see `api/backend-deploy-order.md`). Render a headline the band can compute without it — `paginate.total` usually equals the top-line count.

**Unreviewed:** `/broadcasts` (`BroadcastManagement.tsx:85`) currently reads `data.summary` straight off the list response the same way this section describes, but no comment or spec states whether the band is meant to sit inside the filter (this section) or above it (the next one). Don't cite it as a reference for either side until someone triages it.

## Band sits above the filter and describes the whole set: aggregate client-side

Five pages put the band above the filter bar, where it reads as "how many exist," not "how many match": `/applications`, `/business-units`, `/news`, `/platform-roles`, `/users`. For a band on this side, the list endpoint's `summary` block is the **wrong** source — it is computed from the same `where` the table uses, so it silently tracks `search`/`advance`, and a band that claims to describe the whole set starts moving as the user types. Wiring one of these bands to that block is how the incident above happened.

Until the backend can return a genuinely unfiltered aggregate — phase 2, not yet designed — these five read a deliberately filter-free request and roll it up in the browser:

```ts
userService.getAll({ perpage: -1, advance: ... })
```

Reach for client-side aggregation only after the options below don't fit, in this order:

1. A **dedicated, registry-wide aggregate the backend computes without the table's `where`** — the only fix that reaches DISTINCT/SUM metrics without paying for every row on every load. `FleetCapacity` needs this (see below); phase 2 for the five pages above is a version of this scoped to their metrics.
2. Derive the number from `paginate.total` on a **whole-set** 1-row query — the pattern already used for the archived count, but built on a `where` that ignores `search`/`advance`, not the table's shared filter.
3. A **bounded** pagination loop with a `MAX_PAGES` guard.
4. `perpage: -1` plus a local `summarize<Entity>()` — the interim path all five pages above take today. Say in a comment *which metric* forces it, so the next reader doesn't re-derive it.

### Count queries cannot express every metric

A count query (option 2 above) answers "how many rows match". It cannot answer:

- **DISTINCT counts** — `UserManagement.businessUnits`, `BuSummary.clusters`
- **SUMs** — `FleetCapacity` totals `bu_count`, `max_license_bu`, `users_count`, `total_max_license_users` across all clusters

`FleetCapacity` needs a backend aggregate (option 1) — no client-side rewrite reaches a SUM across the whole registry. `BuSummary.clusters` and `UserManagement.businessUnits` are DISTINCT counts but are reached today via option 4 (`perpage: -1` gives every row, so a `Set` of ids client-side works); `RolesAccessSummary`, `NewsroomSummary`, and `ApplicationRegistrySummary` could in principle use option 2, but each metric would trade one request for four to six over a table holding tens of rows — worse, not better. All five carry a comment naming the specific blocker.

**The real fix is a backend aggregate that isn't the list endpoint's filter-scoped `summary` block** — a dedicated endpoint, or a flag the existing endpoint can honor to skip the table's `where` (phase 2 hasn't decided which; see the spec above). Reading the *existing* `summary` block is not that fix — that's the mistake this file used to recommend.

## Page wiring

Applies to bands on either side of the split above. Three state slots, loaded separately from the table:

```ts
const [summary, setSummary] = useState<T | null>(null);
const [summaryLoading, setSummaryLoading] = useState(true);
const [summaryError, setSummaryError] = useState(false);
```

- `loadSummary` is a `useCallback`; call it after **every** mutation, not just on mount
- Props are `{ summary, loading, error, onRetry }` on six of the seven bands. `FleetCapacity` takes only `{ summary, loading }` — it has no error affordance, and `ClusterManagement` names its state `fleet`/`fleetLoading` rather than `summary*`. Don't "fix" that to match without adding the retry UI it lacks.
- **The band fails independently.** On error set `summary = null` + `summaryError = true`; the table keeps working and the band shows its own inline retry. Never let a failed aggregate blank the page.
- Client-side shaping (the "whole set" section above) exports a pure `summarize<Entity>()` from the same file as the component — unit-test that, not the component
