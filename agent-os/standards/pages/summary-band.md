# Summary Band

Management pages carry a stat band above the table: `<Entity>Summary.tsx` in the page's
subdirectory. Seven of these are the running example set for the two patterns below —
`UserDirectorySummary`, `NewsroomSummary`, `ApplicationRegistrySummary`, `BuSummary`,
`RolesAccessSummary`, `PlatformAccessSummary`, `FleetCapacity`. Two more of the same shape exist
elsewhere in the app — `broadcastManagement/BroadcastSummary.tsx` (`/broadcasts`) and
`licenses/subscriptionManagement/SubscriptionSummary.tsx` (`/licenses`) — both already covered by
the callouts below (the `/broadcasts` one still unreviewed, the `/licenses` one on the
filtered-result-set side).

## Decide first: what does the band claim to describe?

Before picking a data source, answer one question:

> **Does this band sit above the filter and claim to describe the whole set, or does it describe the filtered result set?**

Get this backwards and the band either lies about scope (renders registry-wide numbers under a "matches your search" framing) or moves when it shouldn't (tracks the filter when it sits above one, claiming to describe everything). The second failure is the one this file used to prescribe: five bands sat above their filter bar yet read the list endpoint's filter-scoped `summary`, so typing into `/news`'s search box could turn a page with three published articles into "Nothing published yet — Publish an article to make it visible to readers." Full incident and fix: `docs/superpowers/specs/2026-08-24-summary-band-follows-filter-five-pages-design.md`.

Pick the section below that matches what your band claims — they use different sources on purpose, and swapping one for the other is exactly the bug above.

## Band describes the filtered result set: read the aggregate from the backend

Reference: `UserPlatformManagement.tsx:60-66` (rendered by `PlatformAccessSummary.tsx`). Also on this side: `/licenses` (`SubscriptionTable.tsx:137-139`, rendered by `subscriptionManagement/SubscriptionSummary.tsx`).

```ts
const [summary, setSummary] = useState<PlatformUserRegistrySummary | null>(null);
setSummary(data?.summary ?? null);        // registry-wide, from the list response
```

The band is **filter-consistent** — it describes every row matching the current `advance` filter and `search`, not just the current page. It is *not* registry-wide: changing a filter changes the band, and for `/user-platform` and `/licenses` that's the intended behavior, not a bug — both bands sit inside the filtered view and answer "how many of what I'm looking at now." `summary.total` equals `paginate.total` whenever the list is showing live rows only, which is the invariant to assert. Say so in a comment; readers assume registry-wide otherwise.

`summary` stays `null` until the backend deploys (see `api/backend-deploy-order.md`). Render a headline the band can compute without it — `paginate.total` usually equals the top-line count.

**Unreviewed:** `/broadcasts` (`BroadcastManagement.tsx:85`, rendered by `broadcastManagement/BroadcastSummary.tsx`) currently reads `data.summary` straight off the list response the same way this section describes, but no comment or spec states whether the band is meant to sit inside the filter (this section) or above it (the next one). Don't cite it as a reference for either side until someone triages it.

## Band sits above the filter and describes the whole set: read a dedicated endpoint

Six pages put the band above the filter bar, where it reads as "how many exist," not "how many match": `/applications`, `/business-units`, `/news`, `/platform-roles`, `/users`, and `/clusters` (`FleetCapacity`). For a band on this side, the list endpoint's `summary` block is the **wrong** source — it is computed from the same `where` the table uses, so it silently tracks `search`/`advance`, and a band that claims to describe the whole set starts moving as the user types. Wiring one of these bands to that block is how the incident above happened.

All six now read a dedicated, unfiltered endpoint the backend computes without the table's `where` — no `perpage`, `search`, or `advance` on the request:

| Page | Service call | Endpoint |
|---|---|---|
| `/applications` | `applicationService.getRegistrySummary()` | `GET /api-system/applications/summary` |
| `/business-units` | `businessUnitService.getSummary()` | `GET /api-system/business-units/summary` |
| `/news` | `newsService.getNewsroomSummary()` | `GET /api/news/summary` |
| `/platform-roles` | `roleService.getAccessSummary()` | `GET /api-system/platform/roles/summary` |
| `/users` | `userService.getDirectorySummary()` | `GET /api-system/user/summary` |
| `/clusters` | `clusterService.getFleetSummary()` | `GET /api-system/clusters/summary` |

`FleetCapacity` got its dedicated endpoint first; the other five followed in phase 2, specified in `docs/superpowers/specs/2026-08-24-summary-endpoints-phase-2-design.md` (the incident that prompted it is in the phase-1 spec linked above). Before those endpoints existed, the five read a deliberately filter-free `perpage: -1` list request and rolled it up client-side in a `summarize<Entity>()` per page — that code is deleted; do not reintroduce it.

If a future band needs to sit on this side of the split and its metric doesn't already have a dedicated endpoint, build one server-side. In descending order of how well each option holds up:

1. **A dedicated, registry-wide aggregate the backend computes without the table's `where`** — what all six bands above do. The only option that reaches DISTINCT/SUM metrics without paying for every row on every load.
2. Derive the number from `paginate.total` on a **whole-set** 1-row count query — fine for a plain count, but see below for what it cannot express.
3. A **bounded** pagination loop with a `MAX_PAGES` guard — a last resort, not a default choice.

A client-side `perpage: -1` rollup is not on this list. It was the phase-1 workaround for these same six bands, and shipping the dedicated endpoint is exactly what replaced it — don't bring it back for a new band.

### Count queries cannot express every metric

A count query (option 2 above) answers "how many rows match". It cannot answer:

- **DISTINCT counts** — `UserManagement.businessUnits`, `BuSummary.clusters`
- **SUMs** — `FleetCapacity` totals `bu_count`, `max_license_bu`, `users_count`, `total_max_license_users` across all clusters

All six bands get these from a backend aggregate purpose-built for the metric (option 1), not a count query. `BuSummary.clusters` and `UserManagement.businessUnits` are DISTINCT counts computed inside their `GET .../summary` handler the same way `FleetCapacity`'s SUMs are, and `RolesAccessSummary`, `NewsroomSummary`, and `ApplicationRegistrySummary` get their own dedicated handlers even though each of their metrics could in principle be expressed as a count — one request beats four to six over a table holding tens of rows.

**The fix for a band on this side is a backend aggregate that isn't the list endpoint's filter-scoped `summary` block** — a dedicated endpoint, same shape as the six above. Reading the *existing* filter-scoped `summary` block is not that fix — that's the mistake this file used to recommend.

## Page wiring

Applies to bands on either side of the split above. Three state slots, loaded separately from the table:

```ts
const [summary, setSummary] = useState<T | null>(null);
const [summaryLoading, setSummaryLoading] = useState(true);
const [summaryError, setSummaryError] = useState(false);
```

- `loadSummary` is a `useCallback`; call it after **every** mutation, not just on mount
- Props are `{ summary, loading, error, onRetry }` on six of the seven bands. `FleetCapacity` takes `{ summary, loading, error }` — no `onRetry`. It has the same error affordance as the other six (a `role="alert"` cue, and — once numbers have already loaded — dimming the stale-but-plausible numbers on a later failure instead of blanking them), it just has no retry button: a first-ever failure renders plain "Capacity unavailable" text rather than `FetchErrorState`'s "Try again". `ClusterManagement` also names its state `fleet`/`fleetLoading` rather than `summary*`.
- **The band fails independently.** On error set `summaryError = true` — never let a failed aggregate blank the page or block the table. Two cases, not one: a **first-ever failure** (no `summary` has ever loaded) shows the plain unavailable state; a **failure after numbers were already loaded** keeps the last known `summary` on screen, dims it (`error && 'opacity-70'`), and adds a `role="alert"` cue reading "Couldn't refresh — showing the last known numbers." Do NOT clear `summary` to `null` in the catch block — that's what collapses the second case into the first. Reference implementation: `FleetCapacity`. **Six of the seven follow this**; the exception is `PlatformAccessSummary` (`src/pages/userPlatformManagement/PlatformAccessSummary.tsx:49`), which still uses a flat `error ? <FetchErrorState/> : …` and so discards numbers already on screen when a refresh fails. It was outside the scope of the branch that fixed the other five and has not been triaged — bring it across before citing this section as universally applied.
