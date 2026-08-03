# Preview Verdict Filter — Specification

**Date:** 2026-08-03
**Status:** Approved
**Repos:** `carmen-turborepo-backend-v2` (micro-business only), `carmen-platform` (Vite SPA)
**Extends:** `docs/superpowers/specs/2026-08-03-preconfig-import-wizard.md` §6.3, §10.2

---

## 1. Problem

On `/tenant-imports`, after previewing a step the operator sees three verdict badges —
`new` / `duplicate` / `error` — and one flat table of preview rows
(`src/pages/tenantImport/StepPanel.tsx:206-301`). The badges are counters, not controls, and
the table renders every returned row unfiltered.

Two things the operator actually does are awkward:

1. **Fix the spreadsheet.** Find every failing row, copy its `row_number` and message back
   into `Preconfig.xlsx`, re-upload. Today that means scrolling a 200-row table hunting for
   red badges.
2. **Audit before importing.** Confirm what a run will insert versus what already exists,
   so the `duplicate_mode` choice is an informed one. Today the counts answer "how many",
   but there is no way to look at examples of one verdict without reading past the others.

There is a second, less visible problem that any filter would immediately expose. The
backend collects preview rows into three per-verdict buckets, each capped at
`PREVIEW_ROW_CAP` (200), then throws most of that away:

```ts
// preconfig-import.service.ts:551-553
const rows = [...byVerdict.error, ...byVerdict.duplicate, ...byVerdict.new]
  .slice(0, PREVIEW_ROW_CAP)
  .sort((a, b) => a.row_number - b.row_number);
```

Errors are taken first, so failing rows are guaranteed present — but on a large sheet the
200 slots are consumed by errors and duplicates, and `new` is left with whatever is over.
A purely client-side filter would therefore show a badge reading `2,400 new` that, when
clicked, reveals five rows. The counts are whole-sheet; the sample is not.

## 2. Goal

Let the operator narrow the preview table to one or more verdicts, and make the UI state
honestly how much of each verdict it is actually showing.

## 3. Non-goals

- Server-side filtering or pagination of `/preview`. The endpoint is multipart and the
  backend keeps no upload session, so every filter click would re-upload the workbook,
  re-parse it, and re-query the tenant database. Rejected as disproportionate.
- CSV export of preview rows. If reading all 2,590 rows ever becomes a real need, an export
  is the right tool — not paging a table in a browser. Out of scope here.
- Changing the value of `PREVIEW_ROW_CAP`, or anything on the import path.
- Filtering `CompanyProfilePanel` (the platform-target step renders a field diff, not a row
  table, and has exactly one record).

## 4. Approach

Filter on the client, and stop the backend from discarding rows it has already computed.

Each bucket is *already* built to 200 entries before the global `.slice()` collapses them,
so removing that slice costs no additional server memory or query work — only wire payload,
which grows from at most 200 rows to at most 600. In exchange every verdict gets its own
200-row window, which is enough for both use cases above without a new endpoint, a second
round-trip, or re-uploading the workbook.

Rejected alternatives:

- **Client-side filter alone.** Ships in one file, but `new` stays starved on exactly the
  large sheets where filtering matters.
- **Server-side filter/pagination.** Full coverage, at the cost of a workbook re-upload per
  chip click.

## 5. Backend contract

`apps/micro-business/src/preconfig-import/preconfig-types.ts`

Add to `PreviewResult` (currently ending at `rows_truncated: boolean;`, line 183):

```ts
  /**
   * How many rows of each verdict are present in `rows`. `counts` describes the whole sheet;
   * this describes the sample, so the client can say "showing 200 of 2,400 new".
   * จำนวนแถวของแต่ละผลตรวจที่อยู่ใน rows — คู่กับ counts ที่นับทั้งชีต
   */
  sampled: { new: number; duplicate: number; error: number };
```

`sampled` is **required** on the backend type. The frontend declares it optional; see §7.

Update the doc comment on `PREVIEW_ROW_CAP` (line 221) — the cap is per verdict bucket, not
per response.

`apps/micro-business/src/preconfig-import/preconfig-import.service.ts`

Tabular path (`previewStep`), lines 547-553 — drop the global slice and rewrite the comment
above it, which describes the selection rule being removed:

```ts
// Every bucket is already capped at PREVIEW_ROW_CAP on its own (above), so the merged list
// holds at most 3 × PREVIEW_ROW_CAP rows and each verdict keeps a full window regardless of
// how the sheet is distributed. Sorted back into sheet order so the table reads like the
// spreadsheet. `counts` stays whole-sheet; `sampled` describes this list.
const rows = [...byVerdict.error, ...byVerdict.duplicate, ...byVerdict.new]
  .sort((a, b) => a.row_number - b.row_number);
```

and add to the returned object (alongside `rows` / `rows_truncated`, lines 573-574):

```ts
sampled: {
  new: byVerdict.new.length,
  duplicate: byVerdict.duplicate.length,
  error: byVerdict.error.length,
},
```

`rows_truncated: rows.length < sheet.rows.length` is unchanged and still correct — it now
reports "this list is not the whole sheet", which is exactly what it meant before.

Vertical path (`previewVerticalStep`), return block at lines 619-631 — this step yields one
row, so `sampled` equals `counts` there:

```ts
sampled: { new: failed ? 0 : 1, duplicate: 0, error: failed ? 1 : 0 },
```

Omitting it breaks the build, since `PreviewResult` requires the field.

**Gateway: no change.** `apps/backend-gateway/src/platform/preconfig-imports/preconfig-imports.service.ts:80`
returns `Promise<unknown>` and passes the microservice payload straight through — there is
no response DTO to keep in sync.

## 6. Frontend

### 6.1 Type

`src/types/index.ts`, in `PreconfigPreview` (after `rows_truncated`):

```ts
  /** Per-verdict row counts within `rows`; `counts` is the whole sheet. Optional: absent when
   *  the frontend is deployed ahead of the backend change. */
  sampled?: { new: number; duplicate: number; error: number };
```

Optional per repo rule 11, and deliberately so — see §7.

### 6.2 `StepPanel.tsx`

**State.** One addition:

```ts
const [verdictFilter, setVerdictFilter] = useState<Set<PreconfigPreviewRow['verdict']>>(
  () => new Set(),
);
```

An empty set means "show everything" — there is no separate "all" sentinel to keep in sync.

**Reset.** `useEffect(() => setVerdictFilter(new Set()), [preview])`. A fresh preview replaces
the object, so re-previewing the same step clears the filter. Switching steps is covered by
the remount in §6.3.

**Sample counts with fallback.** Derived once per preview:

```ts
const sampled = useMemo(() => {
  if (!preview) return { new: 0, duplicate: 0, error: 0 };
  if (preview.sampled) return preview.sampled;
  const acc = { new: 0, duplicate: 0, error: 0 };
  for (const r of preview.rows) acc[r.verdict] += 1;
  return acc;
}, [preview]);
```

**Visible rows.**

```ts
const visibleRows = useMemo(() => {
  if (!preview) return [];
  if (verdictFilter.size === 0) return preview.rows;
  return preview.rows.filter((r) => verdictFilter.has(r.verdict));
}, [preview, verdictFilter]);
```

**Badges become toggles.** The three badges at lines 205-219 each get wrapped in a
`<button type="button">` carrying `aria-pressed` and an `aria-label` of the form
`<count> <verdict> — filter to <verdict> rows` — the count must lead because on a `<button>` an `aria-label` overrides the badge's own text and screen-reader users would otherwise never hear the count; the badge's own text is a bare count plus the verdict word, which does not read as a control on its own. Multi-select: clicking toggles that verdict in the set,
so `error` + `duplicate` together — "rows this run will not insert" — is one click away. The
badge `variant` mapping is unchanged.

Selection must not be signalled by colour alone (the badges are already colour-coded by
verdict):

- selected → `ring-2 ring-ring ring-offset-1` on the button
- unselected, any state → no dimming; a ring is not colour, so the constraint above is
  already satisfied by the selected ring alone. Dimming was dropped because these buttons stay
  interactive (never `disabled`), so WCAG 1.4.3 contrast applies to them, and the dimmed state
  also muted the whole-sheet `error` count precisely when a filter was active — undercutting the
  §10 mitigation for "the filter could hide errors from the operator"
- hover, any state → a restrained `hover:ring-1` affordance, so the chips read as interactive
  next to the plain badges they replaced
- no filter active → all three render exactly as today (plus the new hover affordance)

**Columns.** `columns` keeps deriving from `preview.rows`, not `visibleRows`, so the column
set does not shift as the operator toggles chips.

**Caption line.** Replaces the current
`{total_rows} rows in sheet · showing a sample of {n}, problem rows first`. That copy
describes the old selection rule and stops being true once the slice is gone.

| Condition | Text |
|---|---|
| No filter, `!rows_truncated` | `{total_rows} rows in sheet` |
| No filter, `rows_truncated`, `sampled` present | `{total_rows} rows in sheet · showing {rows.length}, up to 200 per verdict` |
| No filter, `rows_truncated`, `sampled` absent | `{total_rows} rows in sheet · showing a sample of {rows.length}` |
| Filter active | one clause per selected verdict, joined by ` · ` |

The two `rows_truncated` phrasings are selected by whether `preview.sampled` came back at all —
not by anything about the deploy state directly. `sampled` absent means this frontend is talking
to a backend that predates the per-verdict sampling change, where `rows` is still globally capped
at 200 total; asserting "up to 200 per verdict" in that state would overstate what the table
holds, so the fallback phrasing claims only what is true of a globally-capped sample.

Per-verdict clause: `Showing all {n} {verdict}` when `sampled[v] === counts[v]`, otherwise
`Showing {sampled[v]} of {counts[v]} {verdict}`.

**Table and empty states.** The table block's condition changes from
`preview.rows.length > 0` to `visibleRows.length > 0`, and it maps `visibleRows`. Two empty
cases, kept distinct:

- filter active and `visibleRows.length === 0` → `No {verdicts} rows in this preview.`
- no filter and `preview.rows.length === 0` → the existing message at lines 303-309,
  unchanged.

### 6.3 `TenantImportWizard.tsx` — remount fix

`<StepPanel>` at line 350 renders without a `key`, so React reuses one instance across step
switches and its local state survives. Add `key={activeId}`.

This is required by the filter (otherwise a filter set on one step silently applies to the
next), and it also closes a latent bug that exists today: opening the clear-existing
confirmation dialog on step A and switching to step B leaves the dialog open, still holding
the typed BU code, now pointing at B's table.

## 7. Compatibility and rollout

`sampled` is additive and both deploy orders are safe, so the two repos can ship
independently:

| Frontend | Backend | Behaviour |
|---|---|---|
| new | old | `sampled` absent → §6.2 fallback counts it from `rows`. Filtering works; `rows` is still globally capped at 200, so the `new` window stays small on large sheets. This is the one deploy state guaranteed to occur before the backend ships — the unfiltered caption's "up to N per verdict" wording is conditioned on `sampled` for exactly this reason, falling back to "showing a sample of N" so it never overstates what the table holds. No error. |
| old | new | The extra field is ignored; `rows` may hold up to 600 entries and the table simply shows more. No error. |
| new | new | Full behaviour. |

Payload grows from at most 200 rows to at most 600 per preview, on an authenticated
platform-admin endpoint invoked by hand a few times per onboarding. Server memory is
unchanged — the buckets were already built at this size.

## 8. Files touched

| Repo | File | Change |
|---|---|---|
| backend-v2 | `apps/micro-business/src/preconfig-import/preconfig-types.ts` | `sampled` on `PreviewResult`; `PREVIEW_ROW_CAP` doc comment |
| backend-v2 | `apps/micro-business/src/preconfig-import/preconfig-import.service.ts` | drop global slice; emit `sampled` in both preview paths |
| carmen-platform | `src/types/index.ts` | `sampled?` on `PreconfigPreview` |
| carmen-platform | `src/pages/tenantImport/StepPanel.tsx` | filter state, toggle badges, `visibleRows`, caption, empty state |
| carmen-platform | `src/pages/TenantImportWizard.tsx` | `key={activeId}` on `<StepPanel>` |

## 9. Verification

No new automated tests (standing preference: implement, type-check, commit). Existing suites
must stay green.

- backend-v2: `bun run check-types` in `apps/micro-business`, then `bun run test` there.
  Note there are **no** preconfig-import specs in micro-business — the only preconfig specs in
  the repo live in `backend-gateway` (`preconfig-imports.module.spec.ts`,
  `ndjson-stream-lifecycle.spec.ts`), and the gateway is untouched here. The micro-business run
  is a regression gate, not coverage of this change.
- carmen-platform: `bunx tsc --noEmit`, `bun run build:dev` (eslint runs inside the build),
  `bun run test` (Vitest). There is no test for `StepPanel` today either.
- Manual on DEV, with a `Preconfig.xlsx` whose product sheet carries real error rows:
  1. Preview a step with a mix of all three verdicts
  2. Click `error` → only failing rows, caption reports the error count
  3. Add `duplicate` → both verdicts shown
  4. Clear the filter → full table returns
  5. Switch to another step → filter is empty, no leaked state
  6. Re-preview the same step → filter resets

## 10. Risks

- **Copy drift.** The caption is the only place stating what the sample covers. If
  `PREVIEW_ROW_CAP` ever changes, the literal `200` in the "up to 200 per verdict" string
  goes stale. Accepted: the constant has not moved since the feature shipped, and threading
  it through the API for one caption is not worth it.
- **Filter hides errors.** Filtering to `new` and pressing Import could let an operator run a
  step without having looked at its failures. Mitigated by the badges themselves — the
  whole-sheet `error` count stays visible above the table at all times, filter or no filter.
