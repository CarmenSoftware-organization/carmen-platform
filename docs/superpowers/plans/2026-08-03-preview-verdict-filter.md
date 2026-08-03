# Preview Verdict Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator on `/tenant-imports` filter the step preview table by verdict (`new` / `duplicate` / `error`), with the UI stating honestly how much of each verdict it is actually showing.

**Architecture:** The backend already builds three per-verdict row buckets, each capped at 200, then discards most of them with a global `.slice(0, 200)`. Drop that slice so every verdict keeps a full window (≤600 rows total, no extra server memory or queries), and add a `sampled` field so the client can distinguish "200 of 2,400 new" from "all 34 error". Filtering itself is entirely client-side in `StepPanel` — no new endpoint, no second round-trip, no re-uploading the workbook.

**Tech Stack:** NestJS microservice (`micro-business`, Bun, jest) · React 19 + TypeScript + Vite + shadcn/ui (`carmen-platform`, Vitest)

**Spec:** `docs/superpowers/specs/2026-08-03-preview-verdict-filter.md`

## Global Constraints

- **Two repos.** Backend work is in `../carmen-turborepo-backend-v2` (`apps/micro-business` **only** — the gateway is a passthrough with no response DTO and must not be touched). Frontend work is in this repo, `carmen-platform`, branch `feature/preview-verdict-filter`.
- **No new automated tests.** Standing user preference: implement, type-check, commit. Do not create `*.spec.ts` / `*.test.tsx` files. Existing suites must stay green — that is a regression gate, not coverage of this change.
- **Static checks are not tests — always run them.** `check-types` / `tsc --noEmit` / the Vite build (which runs eslint) are required at every task that changes code.
- **Backend comments are bilingual.** English line(s) first, then a Thai line, matching every other comment in `preconfig-import.service.ts`. Frontend comments are English only.
- **Never modify `src/components/ui/`** primitives (repo rule 2). The `Badge` primitive is used as-is; the toggle behaviour goes on a wrapping `<button>`.
- **Add new API fields as optional (`?`) on the frontend** (repo rule 11). `sampled` is required on the backend type and optional on the frontend type — this is deliberate, it is what makes either deploy order safe.
- **`PREVIEW_ROW_CAP` keeps its value of 200.** Only its meaning changes: per verdict bucket rather than per response.
- **Selected state must not be signalled by colour alone.** The badges are already colour-coded by verdict; selection uses a focus ring plus dimming of the unselected chips.

---

## Task 1: Backend — keep every verdict's sample and report its size

**Repo:** `../carmen-turborepo-backend-v2`

**Files:**
- Modify: `apps/micro-business/src/preconfig-import/preconfig-types.ts:183` (add `sampled` to `PreviewResult`) and `:221` (doc comment on `PREVIEW_ROW_CAP`)
- Modify: `apps/micro-business/src/preconfig-import/preconfig-import.service.ts:547-553` (drop the global slice), `:573-575` (emit `sampled` in the tabular path), `:629-631` (emit `sampled` in the vertical path)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PreviewResult.sampled: { new: number; duplicate: number; error: number }` — the wire field Task 4 reads. `counts` (whole sheet) and `rows_truncated` keep their existing meanings and are not renamed.

- [ ] **Step 1: Branch the backend repo**

The backend has no branch for this work yet. From the backend repo root:

```bash
cd ../carmen-turborepo-backend-v2
git checkout main && git pull
git checkout -b feature/preview-verdict-sampling
```

- [ ] **Step 2: Add `sampled` to the `PreviewResult` type**

In `apps/micro-business/src/preconfig-import/preconfig-types.ts`, the interface currently ends:

```ts
  lookups_to_create: LookupCreation[];
  rows: PreviewRow[];
  rows_truncated: boolean;
}
```

Replace those closing lines with:

```ts
  lookups_to_create: LookupCreation[];
  rows: PreviewRow[];
  rows_truncated: boolean;
  /**
   * How many rows of each verdict are present in `rows`. `counts` describes the whole sheet;
   * this describes the sample, so the client can say "showing 200 of 2,400 new" instead of
   * implying the table holds every row the badge counts.
   * จำนวนแถวของแต่ละผลตรวจที่อยู่ใน rows — คู่กับ counts ที่นับทั้งชีต
   */
  sampled: { new: number; duplicate: number; error: number };
}
```

- [ ] **Step 3: Correct the `PREVIEW_ROW_CAP` doc comment**

Same file, line 221. The cap is applied per bucket, not per response — after this task that distinction is the whole point.

Replace:

```ts
/** Preview rows returned to the client are capped to keep payloads small. */
export const PREVIEW_ROW_CAP = 200;
```

with:

```ts
/**
 * Preview rows are capped per verdict bucket, so a response holds at most 3 × this many rows.
 * Capping the merged list instead would starve whichever verdict sorts last, and the client
 * filters that list by verdict.
 * จำกัดจำนวนแถวต่อหนึ่งผลตรวจ ไม่ใช่ต่อหนึ่งคำตอบ
 */
export const PREVIEW_ROW_CAP = 200;
```

- [ ] **Step 4: Drop the global slice in the tabular preview path**

In `apps/micro-business/src/preconfig-import/preconfig-import.service.ts`, lines 547-553 currently read:

```ts
      // Errors first, then duplicates, then new — then re-sorted into sheet order, so the table
      // reads top-to-bottom like the spreadsheet while still guaranteeing that every failing row
      // that fits is present. `counts` stays whole-sheet regardless of what is sampled here.
      // เลือกแถวผิดพลาดก่อน แล้วจึงเรียงกลับตามลำดับในชีต เพื่อให้อ่านง่ายแต่ยังเห็นแถวที่ผิดพลาดครบ
      const rows = [...byVerdict.error, ...byVerdict.duplicate, ...byVerdict.new]
        .slice(0, PREVIEW_ROW_CAP)
        .sort((a, b) => a.row_number - b.row_number);
```

Replace the whole block (comment included — it describes the rule being removed) with:

```ts
      // Every bucket is already capped at PREVIEW_ROW_CAP on its own (above), so the merged list
      // holds at most 3 × PREVIEW_ROW_CAP rows and every verdict keeps a full window no matter
      // how the sheet is distributed. Capping the merged list again would starve whichever
      // verdict sorts last — and the client filters this list by verdict, so that verdict would
      // look empty while its badge showed thousands. Re-sorted into sheet order so the table
      // reads top-to-bottom like the spreadsheet. `counts` stays whole-sheet; `sampled` below
      // describes this list.
      // ทุกถังถูกจำกัดจำนวนแยกกันอยู่แล้ว จึงไม่ตัดซ้ำอีก เพื่อให้ทุกผลตรวจมีแถวให้กรองดูครบ
      const rows = [...byVerdict.error, ...byVerdict.duplicate, ...byVerdict.new]
        .sort((a, b) => a.row_number - b.row_number);
```

`PREVIEW_ROW_CAP` is still used at line 542 for the per-bucket cap, so its import stays live — do not remove it.

- [ ] **Step 5: Emit `sampled` from the tabular path**

Same file, the `return Result.ok({ ... })` at lines 566-575. Replace its last two entries:

```ts
        rows,
        rows_truncated: rows.length < sheet.rows.length,
      });
```

with:

```ts
        rows,
        rows_truncated: rows.length < sheet.rows.length,
        sampled: {
          new: byVerdict.new.length,
          duplicate: byVerdict.duplicate.length,
          error: byVerdict.error.length,
        },
      });
```

`rows_truncated` is unchanged and still correct — it reports "this list is not the whole sheet", which is what it always meant.

- [ ] **Step 6: Emit `sampled` from the vertical path**

Same file, `previewVerticalStep`'s return block at lines 619-631. It yields exactly one row, so the sample is the whole thing. Replace:

```ts
      rows: [{ row_number: 1, verdict: failed ? 'error' : 'new', values, errors }],
      rows_truncated: false,
    });
```

with:

```ts
      rows: [{ row_number: 1, verdict: failed ? 'error' : 'new', values, errors }],
      rows_truncated: false,
      // One record, so the sample is everything — this mirrors `counts` above exactly.
      // มีเรกคอร์ดเดียว ตัวอย่างจึงเท่ากับทั้งหมด
      sampled: { new: failed ? 0 : 1, duplicate: 0, error: failed ? 1 : 0 },
    });
```

Skipping this fails the build, because `sampled` is required on `PreviewResult`.

- [ ] **Step 7: Type-check**

```bash
cd ../carmen-turborepo-backend-v2/apps/micro-business && bun run check-types
```

Expected: clean exit, no output. A `Property 'sampled' is missing` error means Step 5 or Step 6 was skipped.

- [ ] **Step 8: Regression-run the micro-business suite**

```bash
cd ../carmen-turborepo-backend-v2/apps/micro-business && bun run test
```

Expected: all suites pass. There are **no** preconfig-import specs in micro-business (the only preconfig specs in the repo are in `backend-gateway` and are untouched), so this is a regression gate — nothing here asserts the new behaviour. Run it in the foreground; if it hangs at the end, that is the known jest teardown issue, not a failure.

- [ ] **Step 9: Commit**

```bash
cd ../carmen-turborepo-backend-v2
git add apps/micro-business/src/preconfig-import/preconfig-types.ts apps/micro-business/src/preconfig-import/preconfig-import.service.ts
git commit -m "$(cat <<'EOF'
feat(preconfig-import): keep a full row sample per verdict

The three per-verdict buckets are each built to PREVIEW_ROW_CAP and then
collapsed to 200 rows total, so on a large sheet `new` is left with whatever
errors and duplicates do not consume. The wizard is about to let operators
filter the preview table by verdict, where that shows up as a badge reading
"2,400 new" over a table holding five of them.

Drop the merged-list slice (each bucket is already capped, so this costs no
server memory or query work — only payload, at most 3x) and add `sampled`,
the per-verdict row count of the returned sample, so the client can tell
"showing 200 of 2,400" apart from "showing all 34".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend — remount `StepPanel` when the step changes

**Repo:** `carmen-platform` (branch `feature/preview-verdict-filter`, already checked out)

**Files:**
- Modify: `src/pages/TenantImportWizard.tsx:350`

**Interfaces:**
- Consumes: nothing.
- Produces: the guarantee Task 3 depends on — `StepPanel`'s local state is discarded when `activeId` changes.

This lands before the filter because it is a standalone fix for a bug that exists today, and because the filter is quietly wrong without it.

- [ ] **Step 1: Add the `key`**

In `src/pages/TenantImportWizard.tsx`, the render at line 350 currently begins:

```tsx
                    <StepPanel
                      step={activeStep}
                      state={states[activeId] ?? { status: 'pending', options: {} }}
```

Replace those lines with:

```tsx
                    <StepPanel
                      // Remount per step. Without a key React reuses one instance across step
                      // switches and its local state survives — today that leaves the clear-
                      // existing dialog open (still holding the typed BU code) pointing at a
                      // different table, and it would carry a verdict filter across steps too.
                      key={activeId}
                      step={activeStep}
                      state={states[activeId] ?? { status: 'pending', options: {} }}
```

Nothing else changes — `states`, `bumpStep`, and `patch` are all keyed by `activeId` already and are unaffected by the remount.

- [ ] **Step 2: Type-check and build**

```bash
bunx tsc --noEmit && bun run build:dev
```

Expected: `tsc` silent, build succeeds. The build is what runs eslint in this repo — a lint error fails it.

- [ ] **Step 3: Verify the fix by hand**

Start the dev server (`bun run dev:dev`), open `/tenant-imports`, pick a BU, upload `Preconfig.xlsx`, and reach the steps screen. Then:

1. On a step whose `supports_clear` is true, run Preview, tick **Soft-delete existing rows first** to open the confirmation dialog, and type a few characters into the BU code box.
2. Without closing the dialog, click a different step in the left rail.

Expected: the dialog is gone and the new step renders clean. Before this change it stayed open with the typed text intact, now describing the other step's table.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TenantImportWizard.tsx
git commit -m "$(cat <<'EOF'
fix(tenant-import): remount StepPanel when the active step changes

StepPanel rendered without a key, so React reused one instance across step
switches and its local state survived. Opening the clear-existing dialog on
one step and switching to another left it open, still holding the typed BU
code, now describing a different table.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Frontend — filter the preview table by verdict

**Repo:** `carmen-platform` (branch `feature/preview-verdict-filter`)

**Files:**
- Modify: `src/types/index.ts` (add `sampled?` to `PreconfigPreview`, after `rows_truncated`)
- Modify: `src/pages/tenantImport/StepPanel.tsx` — imports, module constants, filter state and derived values, the badge row at lines 205-219, the table block at lines 269-301, the empty-state block at lines 303-309

**Interfaces:**
- Consumes: `PreconfigPreview.sampled?: { new: number; duplicate: number; error: number }` from Task 1, and the per-step remount from Task 2.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add `sampled` to the frontend preview type**

In `src/types/index.ts`, `PreconfigPreview` currently ends:

```ts
  rows: PreconfigPreviewRow[];
  rows_truncated: boolean;
}
```

Replace with:

```ts
  rows: PreconfigPreviewRow[];
  rows_truncated: boolean;
  /**
   * How many rows of each verdict are in `rows` — `counts` is the whole sheet. Optional so this
   * app still type-checks when deployed ahead of the backend that added it; StepPanel counts the
   * rows itself when it is absent.
   */
  sampled?: { new: number; duplicate: number; error: number };
}
```

- [ ] **Step 2: Extend the imports in `StepPanel.tsx`**

Line 1 currently reads:

```ts
import { useMemo, useRef, useState } from 'react';
```

Replace with:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
```

Then in the type import block at lines 14-20, add `PreconfigPreviewRow` so the whole block reads:

```ts
import type {
  PreconfigDuplicateMode,
  PreconfigImportOptions,
  PreconfigImportSummary,
  PreconfigPreview,
  PreconfigPreviewRow,
  PreconfigStepMeta,
} from '../../types';
```

- [ ] **Step 3: Add the module-level constants**

Line 49 currently reads:

```ts
const VERDICT_VARIANT = { new: 'success', duplicate: 'secondary', error: 'destructive' } as const;
```

Replace with:

```ts
const VERDICT_VARIANT = { new: 'success', duplicate: 'secondary', error: 'destructive' } as const;

type Verdict = PreconfigPreviewRow['verdict'];

/** Badge/filter order — matches the order the counts were rendered in before filtering existed. */
const VERDICTS: Verdict[] = ['new', 'duplicate', 'error'];

// Mirrors PREVIEW_ROW_CAP in the backend's preconfig-types.ts: the per-verdict cap on how many
// rows a preview returns. Used only to make the caption sentence concrete — no behaviour here
// depends on it being in sync, and `sampled` carries the real numbers.
const PREVIEW_ROWS_PER_VERDICT = 200;
```

- [ ] **Step 4: Add the filter state and derived values**

Inside the component, immediately after the `columns` `useMemo` (which ends at line 129 with `}, [preview]);`), insert:

```ts
  // Empty set means "show everything" — there is no separate "all" sentinel to keep in sync
  // with the three chips.
  const [verdictFilter, setVerdictFilter] = useState<Set<Verdict>>(() => new Set());

  // A fresh preview replaces the object, so re-previewing this step drops the filter with it —
  // otherwise a filter chosen against the old rows silently applies to new ones. Switching to a
  // different step is covered by the `key` on <StepPanel> in TenantImportWizard.
  useEffect(() => {
    setVerdictFilter(new Set());
  }, [preview]);

  const toggleVerdict = (v: Verdict) =>
    setVerdictFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  // `counts` is whole-sheet; this is how much of each verdict the returned sample actually holds.
  // A backend that predates the `sampled` field gets it counted from the rows themselves, so this
  // app can deploy ahead of the backend without the caption claiming more than it shows.
  const sampled = useMemo(() => {
    if (!preview) return { new: 0, duplicate: 0, error: 0 };
    if (preview.sampled) return preview.sampled;
    const acc = { new: 0, duplicate: 0, error: 0 };
    for (const r of preview.rows) acc[r.verdict] += 1;
    return acc;
  }, [preview]);

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    if (verdictFilter.size === 0) return preview.rows;
    return preview.rows.filter((r) => verdictFilter.has(r.verdict));
  }, [preview, verdictFilter]);

  const selectedVerdicts = useMemo(() => VERDICTS.filter((v) => verdictFilter.has(v)), [verdictFilter]);

  // The only place that states how much of each verdict the table actually holds. Without it the
  // badge numbers read as a promise the table cannot keep: they count the whole sheet, the table
  // holds a capped sample.
  const captionText = useMemo(() => {
    if (!preview) return '';
    if (selectedVerdicts.length > 0) {
      return selectedVerdicts
        .map((v) =>
          sampled[v] === preview.counts[v]
            ? `Showing all ${preview.counts[v]} ${v}`
            : `Showing ${sampled[v]} of ${preview.counts[v]} ${v}`,
        )
        .join(' · ');
    }
    const total = `${preview.total_rows} rows in sheet`;
    return preview.rows_truncated
      ? `${total} · showing ${preview.rows.length}, up to ${PREVIEW_ROWS_PER_VERDICT} per verdict`
      : total;
  }, [preview, sampled, selectedVerdicts]);
```

- [ ] **Step 5: Turn the count badges into filter toggles**

The block at lines 205-219 currently reads:

```tsx
      {preview && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">{preview.counts.new} new</Badge>
          <Badge variant="secondary">{preview.counts.duplicate} duplicate</Badge>
          <Badge variant={preview.counts.error > 0 ? 'destructive' : 'secondary'}>
            {preview.counts.error} error
          </Badge>
          <span className="text-xs text-muted-foreground">
            {preview.total_rows} rows in sheet
            {preview.rows_truncated &&
              preview.rows.length > 0 &&
              ` · showing a sample of ${preview.rows.length}, problem rows first`}
          </span>
        </div>
      )}
```

Replace the whole block with:

```tsx
      {preview && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {VERDICTS.map((v) => {
            const selected = verdictFilter.has(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={selected}
                aria-label={`Filter to ${v} rows`}
                onClick={() => toggleVerdict(v)}
                className={`rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected ? 'ring-2 ring-ring ring-offset-1' : ''
                }`}
              >
                {/*
                  Selection is a ring plus dimming of the others, never colour: the badge colour
                  is already spoken for by the verdict itself.
                */}
                <Badge
                  variant={v === 'error' && preview.counts.error === 0 ? 'secondary' : VERDICT_VARIANT[v]}
                  className={verdictFilter.size > 0 && !selected ? 'opacity-50' : ''}
                >
                  {preview.counts[v]} {v}
                </Badge>
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground">{captionText}</span>
        </div>
      )}
```

The `error` badge keeps its existing rule of going `secondary` when the count is zero; `new` and `duplicate` come straight from `VERDICT_VARIANT`.

- [ ] **Step 6: Render the filtered rows**

The table block at line 269 currently opens:

```tsx
      {preview && preview.rows.length > 0 && (
```

Replace that line with:

```tsx
      {visibleRows.length > 0 && (
```

(`visibleRows` is `[]` whenever `preview` is undefined, so the guard still holds.)

Then at line 282, replace:

```tsx
              {preview.rows.map((r) => (
```

with:

```tsx
              {visibleRows.map((r) => (
```

Leave `columns` deriving from `preview.rows` — the column set must not shift as chips are toggled.

- [ ] **Step 7: Add the filtered-empty state**

The block at lines 303-309 currently reads:

```tsx
      {preview && preview.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {preview.total_rows > 0
            ? `No preview rows were returned for the ${preview.total_rows} row${preview.total_rows === 1 ? '' : 's'} in this sheet.`
            : 'This sheet has no data rows.'}
        </p>
      )}
```

Replace it with both states — mutually exclusive by construction, so exactly one can render:

```tsx
      {preview && preview.rows.length > 0 && visibleRows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No {selectedVerdicts.join(' or ')} rows in this preview.
        </p>
      )}

      {preview && preview.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {preview.total_rows > 0
            ? `No preview rows were returned for the ${preview.total_rows} row${preview.total_rows === 1 ? '' : 's'} in this sheet.`
            : 'This sheet has no data rows.'}
        </p>
      )}
```

- [ ] **Step 8: Type-check and build**

```bash
bunx tsc --noEmit && bun run build:dev
```

Expected: `tsc` silent, build succeeds. Watch for eslint's `react-hooks/exhaustive-deps` — every `useMemo` above lists its full dependency set, so a warning here means a dep was dropped while editing.

- [ ] **Step 9: Run the existing test suite**

```bash
bun run test
```

Expected: all pass. No test covers `StepPanel`; this is a regression gate for the rest of the app.

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/pages/tenantImport/StepPanel.tsx
git commit -m "$(cat <<'EOF'
feat(tenant-import): filter the step preview by verdict

The new/duplicate/error badges become multi-select toggles over the preview
table, so an operator can pull up just the failing rows to fix the workbook,
or just the duplicates before choosing a duplicate mode.

The badge counts describe the whole sheet while the table holds a capped
per-verdict sample, so the caption now states which it is showing — "showing
200 of 2,400 new" versus "showing all 34 error" — using the backend's new
`sampled` field, falling back to counting the returned rows when the backend
has not shipped it yet.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: End-to-end verification

**Repo:** both

**Files:** none — this task changes no code.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: the evidence needed before opening PRs.

Do not open PRs before this passes. If a step fails, fix it in the owning task's files and re-run that task's static checks before repeating this one.

- [ ] **Step 1: Deploy the backend branch to DEV**

The frontend talks to a deployed backend (`bun run dev:dev` points at DEV via `.env.dev`), so Task 1 must be running there before the filter can be checked against real `sampled` values. Ask the user to deploy `feature/preview-verdict-sampling` to DEV — do not merge or push branches on their behalf.

Confirm it is live by previewing any step and checking the response carries `sampled`:

Open DevTools → Network → the `preview` request → Response, and confirm a `"sampled": { "new": …, "duplicate": …, "error": … }` object sits alongside `counts`.

- [ ] **Step 2: Walk the filter on a mixed-verdict step**

`bun run dev:dev`, open `/tenant-imports`, pick a BU, upload a `Preconfig.xlsx` whose product sheet carries real error rows, and preview a step that produces all three verdicts.

1. Click **error** → only rows badged `error` remain; caption reads `Showing all N error` (or `Showing N of M error` on a big sheet).
2. Click **duplicate** as well → both verdicts show; caption has two clauses joined by `·`.
3. Click both again to clear → full table returns; caption reads `{total} rows in sheet`, plus the `up to 200 per verdict` clause when the sample is truncated.
4. Click a verdict whose count is 0 → the "No … rows in this preview." line renders instead of an empty table.

- [ ] **Step 3: Check the sample really is per-verdict now**

On the largest sheet available (the product step), preview and compare the `new` badge count against the caption after clicking **new**. Before Task 1 the visible `new` rows were whatever survived a 200-row global cap; now the caption should report up to 200 `new` regardless of how many errors and duplicates the sheet has.

- [ ] **Step 4: Check state isolation**

1. Filter to `error` on one step, then click a different step in the rail → the new step's chips are all unselected.
2. Return to the first step and re-run **Preview** → the filter is cleared.

- [ ] **Step 5: Check keyboard and screen-reader affordances**

Tab to the chips: each must take focus with a visible ring and toggle on Enter/Space (they are real `<button>`s, so this is native). Confirm in DevTools that the pressed chip carries `aria-pressed="true"`.

- [ ] **Step 6: Report and hand off**

Report to the user what passed, with the observed caption strings quoted verbatim rather than paraphrased. Then hand off — opening PRs and merging is the user's call, per their branch policy.

---

## Self-Review Notes

Checked against `docs/superpowers/specs/2026-08-03-preview-verdict-filter.md`:

- §5 backend contract → Task 1 (all four edit sites: type, `PREVIEW_ROW_CAP` comment, tabular slice + `sampled`, vertical `sampled`). Gateway explicitly untouched, per §5's closing note.
- §6.1 frontend type → Task 3 Step 1.
- §6.2 `StepPanel` (state, reset, `sampled` fallback, `visibleRows`, toggles, columns, caption table, empty states) → Task 3 Steps 2-7. The caption table's three cases map to the three branches of `captionText`.
- §6.3 remount fix → Task 2.
- §7 compatibility → the `sampled?` fallback in Task 3 Step 4 covers "new frontend, old backend"; "old frontend, new backend" needs no code.
- §9 verification → Task 4, plus the per-task static checks.
- §10 risks → the `PREVIEW_ROWS_PER_VERDICT` comment in Task 3 Step 3 records the accepted copy-drift risk at the site where it would drift.

Type consistency: `sampled` is the same shape in all four declarations (backend type, backend tabular emit, backend vertical emit, frontend type). `Verdict`, `VERDICTS`, `toggleVerdict`, `visibleRows`, `selectedVerdicts`, and `captionText` are each defined once in Task 3 Step 3/4 and used under those exact names in Steps 5-7.
