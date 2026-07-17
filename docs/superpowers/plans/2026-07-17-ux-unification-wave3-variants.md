# UX Unification — Wave 3 (Variants — A5 Config + A6 Composer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 3 variant pages (A5 Config ×1, A6 Composer ×2) up to their contracts, and **close the permission-test masking that Wave 2 proved is why five gating holes survived undetected** — starting with `NewsEdit`, which is both a W3 page and one of the files still masking `<Can>`.

**Architecture:** Task 1 fixes the test-mocking root cause (it is the wave's highest-value task, not a chore). Tasks 2–4 are per-page against their contracts in `.planning/design/system/page-patterns.md`, ordered findings-first.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest (jsdom) + React Testing Library, shadcn/ui + Tailwind, react-router-dom. Package manager: Bun.

**Branch:** off `main` @ `e2a0306` (contains merged W0 #42 + W1 #43 + W2 #44).

## Global Constraints

- Frontend-only. No backend/API changes. **No new libraries.** Do **not** modify `src/components/ui/` primitives.
- **Copy the closest existing example** (repo rule 1). Never `alert()`/`window.confirm()` — `toast.*` / `<ConfirmDialog>`.
- **Status via `<Badge>`** — never a hand-rolled colored span.
- Error regions `role="alert"`, loading regions `role="status"`. Catch blocks use `parseApiError` + `toast.error`.
- **Versioned entities thread `doc_version`** via `src/utils/docVersion.ts` (`newsService.buildNewsFormData` appends it as a **string** in multipart — the backend coerces).
- Shared pieces built in earlier waves — **reuse, don't rebuild**: `src/components/FetchErrorState.tsx` (`{ message?, onRetry, retryLabel?, className? }`), `src/components/ListEmptyState.tsx` (`{ searchTerm, activeFilterCount, icon, emptyTitle, emptyDescription, addAction? }`), `src/lib/hitSlop.ts` (`HIT_SLOP_44`, `HIT_SLOP_44_ROW`), `src/utils/permissions.ts` (`UNRESOLVED_CLUSTER_ID`), `isNotFoundError` (`src/utils/errorParser.ts`).
- **Per-task gate:** `bun run test` green + `CI=true bun run build` clean, before every commit. (Known pre-existing flake: `NewsManagement.test.tsx` passes on rerun.)
- Source of truth: contracts in `.planning/design/system/page-patterns.md`; findings in `.planning/design/audit/scorecard.md` (**which counts OPEN findings** — fixed ones stay listed, annotated).

## Lessons carried from Waves 0–2 — requirements, not advice

Each was learned by getting it wrong first:

1. **An audit score is evidence, not proof.** W0's audit scored the List reference 12/12 while it carried the flagship P1 *and* a skeleton bug. In W2 it named 6 unguarded surfaces where there were 7, scored the A4 reference **0 P1** while *every* cluster-user write was ungated, and missed entirely-absent not-found states on three pages. **Every task re-checks its page against the contract and reports what the scorecard missed.**
2. **Reference pages get audited hardest, not softest.** A gap there re-seeds itself everywhere.
3. 🔒 **Assume permission gates are missing until you've checked.** Five gaps in W2 alone. Enumerate every mutating control; verify each gate's permission string exists (`src/utils/permissions.ts`, `src/App.tsx`) — don't invent one. Watch for **a data condition wearing a permission's name** (`canAddBU={userClusters.length > 0}` was worse than no gate — it read like one). Scope with `clusterId` where the sibling pages do, and **fail closed** when the scope id is absent (`UNRESOLVED_CLUSTER_ID`).
4. **Never hardcode a derived count.** W1's plan prescribed `TableSkeleton columns={4}`; `DataTable` auto-prepends `#`, so it shipped a bug. Derive it — but **check whether the table even uses `DataTable`** (ClusterEdit's are plain `<table>`s, so no `+1`).
5. **Never silently drop a gap.** Out of scope ⇒ "Scope & Deferrals" with file:line. W2 let a found security hole go into the void and had to be told.
6. **`validateField` cannot express required-ness** (`src/utils/validation.ts:23` opens `if (!value) return ''`, and switches on field-name heuristics so most fields match no case). Pair it with an explicit required-check; don't assume it covers you. Say what you did.
7. **Hit-slop overlays can overlap on dense layouts.** A 44px overlay on a 28px control bleeds 8px/side; if the gap is 8px, adjacent hit zones overlap — on a permission-granting surface that can action the *wrong* item. Prove the geometry, or use **box-growth** (`min-h-11`) where the element is first/last in its container.

## Scope & Deferrals (no silent cap)

**Wave 3 fixes:** every A5/A6 **P1**, the mechanical consistency **P2s**, and the permission-test masking on the two named test files + the two pages with no test file at all (Task 1).

**Deferred (documented, carried forward):**
- 🔒 **`DbConnectionView`'s "Reveal password" is gated on `cluster.read`, not `cluster.update`** — anyone with read can reveal the DB password in plaintext. **Pre-existing; closing it is a read-authorization product decision the user has not yet made.** Not a UI bug — do not fold it into a page task.
- **A full permission-gating audit** (enumerate every mutating control app-wide vs its gate). Task 1 closes the *test* masking on the named files; it does **not** prove the remaining pages are gated. Recommended as its own effort.
- **Systemic <44px touch targets from the shared `Button`/`Input` `h-9` defaults** — app-wide design decision, still open. Includes `ApplicationEdit`'s api-name chip grid, where a 44px overlay had to be reverted (8px bleed vs 8px gap ⇒ overlapping hit zones on a permission-granting surface).
- **`useUnsavedChanges` only hooks `beforeunload`** — it does not intercept in-app React Router navigation, so the contract's unsaved-guard promise is half-true on every Edit/Composer page. Util-level fix (`useBlocker`?), not a page pass.
- **`validateField` cannot express required-ness** (see Lesson 6) — contract/util mismatch; needs a util-level fix or a contract rewrite.
- **`UserManagement.tsx:789`** hardcoded `TableSkeleton columns={isSuperAdmin ? 10 : 9}`.
- **The five primary-record error banners** (`ClusterEdit`, `UserEdit`, `ApplicationEdit`, `RoleEdit`, `ReportTemplateEdit`) are plain `<div role="alert">{error}</div>` with **no retry**, despite comments calling them "retryable" — a 5xx on the primary fetch leaves a blank form recoverable only by browser reload.
- **`formatDateTime` util extraction**; **CLAUDE.md's stale "Form Field Pattern"** (shows `ReadOnlyText`; the real shared primitive is `ReadOnlyField`).
- **`TenantMigrationManagement.tsx:461`** hardcoded skeleton count → Wave 4 (A7).

---

### Task 1: Close the permission-test masking 🔒

**This is the wave's highest-value task.** Wave 2 found five permission holes; the reason none was ever caught is that **the page tests mock `<Can>` to always render children**, so no test in the repo could fail on a missing gate. W2 fixed this on the A4 pages and proved the fix by removing a `clusterId` prop and watching tests fail. The masking is still live on the files below — one of which (`NewsEdit`) is this wave's own page.

**Files:**
- Modify: `src/pages/ClusterManagement.test.tsx` (masks `<Can>` at ~`:31-33`, **with no auth mock at all**, over 4 gates — two of them `clusterId`-scoped at `ClusterManagement.tsx:374,380`)
- Modify: `src/pages/NewsEdit.test.tsx` (masks `<Can>` at ~`:9`, over the lone `news.update` gate)
- Create: `src/pages/UserPlatformEdit.test.tsx` (3 gates, **no test file exists**)
- Create: `src/pages/PrintTemplateMappingEdit.test.tsx` (1 gate, **no test file exists**)

**The correct harness already exists — copy it.** Read `src/pages/ClusterEdit.test.tsx` (esp. its scope-aware mock and the comment explaining why) and `src/pages/UserEdit.test.tsx`. The pattern: mock `AuthContext` with a **mutable** `hasPermission`, leave `<Can>` **real**, reset in `beforeEach`, and include a **discriminating positive control** so a negative assertion can't pass just because a selector is wrong.

- [ ] **Step 1: `ClusterManagement.test.tsx`** — delete the `<Can>` mock, add a mutable `AuthContext` mock. Add gate tests for all 4 gates. For the two `clusterId`-scoped ones, the mock must be **scope-aware** (`(perm, ctx) => perm === '…' && ctx?.clusterId === '<id>'`) — a wholesale `() => true`/`() => false` cannot catch a dropped `clusterId`.
- [ ] **Step 2: Prove Step 1 discriminates.** Temporarily remove the `clusterId` prop from one scoped `<Can>` in `ClusterManagement.tsx`; run the tests; confirm they now **FAIL**. Restore; confirm GREEN. **Report both outputs** — this demonstration is the deliverable, not the test count.
- [ ] **Step 3: `NewsEdit.test.tsx`** — same treatment for the `news.update` gate (verify the string in `src/utils/permissions.ts`). Same discrimination proof.
- [ ] **Step 4: New test files for `UserPlatformEdit` and `PrintTemplateMappingEdit`** — cover their gates (3 and 1) with the correct harness + discriminating controls. **First enumerate each page's gates yourself** — the counts above are from a review, and reviews have been wrong.
- [ ] **Step 5:** `grep -rn "vi.mock.*[Cc]an" src/` — report every remaining `<Can>` mock in the repo and whether it masks a real gate. Anything you don't fix goes in Scope & Deferrals with file:line (Lesson 5).
- [ ] **Step 6:** Gate + commit.

---

### Task 2: PrintTemplateMappingManagement — A5 Config (5/12)

The lowest-scoring page in the app. **A5 is an intentional A3 variant** — card-grouped layout, no server-side `DataTable`, no CSV export, a lighter toolbar. **Do not "fix" those deviations**; judge against the `## A5` contract, not A3.

**Files:** Modify `src/pages/PrintTemplateMappingManagement.tsx`

**Findings:**
- [P1][S] No shared `PageHeader` — title/subtitle/Add hand-rolled inside `CardHeader`/`CardTitle` (`:93-110`).
- [P1][M] **No `DevDebugSheet` anywhere** — the A5 anatomy requires the dev-only raw-response inspector every A3/A5 sibling has (e.g. `ClusterManagement.tsx:575`). Absent from the file.
- [P1][S] Empty state doesn't distinguish "no rows for this filter" vs "nothing configured yet" — same generic "No mappings yet…" regardless of `filterDocType`/`activeOnly` (`:150-153`).
- [P2][S] Document types with zero matching rows are silently dropped instead of rendering their header + an explicit "no templates mapped" line — `grouped` derives only from `rows` (`:77-85`).
- [P2][S] Row identity (template name) is plain text, not a `Link` styled `text-primary hover:underline`; only the pencil icon navigates (`:180-186`).
- [P2][S] Row action buttons `h-7` (28px) (`:208-231`).
- [P2][S] Group headers use `<span className="text-sm font-medium">` instead of a real heading (`<h2>`/`<h3>`) (`:160`).
- [P2][S] Loading is plain centered text, and neither loading nor error carries `role="status"`/`role="alert"` (`:140-149`).
- [P2][S] Document Type filter is a raw native `<select>` instead of the shared `Select` primitive (`:116-127`).
- [P2][S] Row click doesn't navigate to Edit — only the pencil does (`:178-234`).

- [ ] **Step 1: Re-audit against `## A5` first** (Lesson 1) — report anything the scorecard missed **before** fixing. **Explicitly enumerate this page's mutating controls and their gates** (Lesson 3): the sibling `PrintTemplateMappingEdit` has exactly 1 gate; if this page has ungated writes, that's a finding.
- [ ] **Step 2:** Adopt the shared `PageHeader` (title + subtitle + Add action). Add a dev-only `DevDebugSheet` with the raw response (wrap per repo rule 7 / follow how the component gates itself).
- [ ] **Step 3:** Make the empty state filter-aware. **`ListEmptyState` expects `searchTerm` + `activeFilterCount`; this page has a `document_type` select + an "Active only" checkbox and no search.** Decide honestly: either adapt (pass `searchTerm=""` and a real `activeFilterCount` derived from both controls) or, if that reads as a lie, write a small local branch and **say why** in your report. Don't force-fit.
- [ ] **Step 4:** Render document types with zero matching rows as an explicit "no templates mapped" line under their header. Make the row identity a `Link`, and the row click navigate to Edit. Swap the native `<select>` for the shared `Select`. Give group headers a real heading element. Add `role="status"`/`role="alert"` and a skeleton sized to the small dataset. Raise the row actions to ≥44px (Lesson 7 — prove geometry or use box-growth).
- [ ] **Step 5:** Gate + commit.

---

### Task 3: BroadcastCompose — A6 Composer (8/12)

**Files:** Modify `src/pages/BroadcastCompose.tsx` (+ `src/pages/broadcastCompose/**`)

**Findings:**
- [P1][M] **No inline error banner for send failures** — `handleConfirmedSend`'s catch only fires `toast.error(parsed.message)` and closes the dialog. A toast that auto-dismisses is the *only* record of a failed send. (`:237-244`; contrast `NewsEdit.tsx:275-277`.)
- [P1][M] **Missing "dirty vs clean" indicator** — A6 requires it. `isDirty`/`useUnsavedChanges` are wired (`:253-263`) but **never rendered**, unlike sibling `NewsEdit.tsx:474-481` (a pulsing-dot "Unsaved changes" badge next to Save).
- [P1][M] **No sticky bottom action bar** — Send/Reset live inside `BroadcastPreview`'s `actions` slot (a normal, non-fixed element) instead of a `fixed bottom-0 … md:left-16 lg:left-60` bar, and the page has no `pb-20`/`pb-24`. On mobile the grid collapses to one column, so the user must scroll past the entire Audience/Message/Delivery form to reach Send. (`:467-497`, `:282`; `NewsEdit.tsx:470-501` implements it.)
- [P1][S] Severity/type shown via a hand-rolled colored `<span>` (`sev.badge` = `bg-warning/10 text-warning` etc.) instead of `<Badge>` — which already ships `warning`/`destructive`/`info`/`secondary`/`default` variants mapping 1:1 onto INFO/WARNING/CRITICAL/MAINTENANCE/OTHER (`src/components/ui/badge.tsx:15-17`). (`broadcastCompose/BroadcastPreview.tsx:89-91`)
- [P2][M] **No `onBlur` validation anywhere** — Title, Message, custom-type, BU select and scheduled-time all lack it; every check lives in `validate()`, run only on Send click. (No `onBlur` present in the file.)
- [P2][S] BU load error is a plain `<p>` with no `role="alert"` (`:356-363`).

- [ ] **Step 1: Re-audit against `## A6` first** (Lesson 1); report scorecard misses before fixing. **Enumerate the mutating controls and their gates** (Lesson 3) — this page *sends broadcasts*; if Send is ungated, that is a finding, and the permission string (`broadcast.send`) is known real.
- [ ] **Step 2:** Add a persistent inline error banner (`role="alert"`) for send failures, alongside the toast — mirror `NewsEdit.tsx:275-277`.
- [ ] **Step 3:** Render the dirty indicator that's already computed — mirror `NewsEdit.tsx:474-481`.
- [ ] **Step 4:** Move Send/Reset into a sticky bottom action bar (`fixed bottom-0 … md:left-16 lg:left-60`) with `pb-20`/`pb-24` on the page wrapper, mirroring `NewsEdit.tsx:470-501`, so Send is reachable on mobile without scrolling the whole form.
- [ ] **Step 5:** Replace the hand-rolled severity `<span>` with `<Badge variant="…">`, mapping INFO/WARNING/CRITICAL/MAINTENANCE/OTHER onto the existing variants. Add `onBlur` validation (Lesson 6: `validateField` can't express required-ness — pair it with an explicit required-check and say what you did). Add `role="alert"` to the BU load error.
- [ ] **Step 6:** Gate + commit.

---

### Task 4: NewsEdit — A6 Composer (10/12)

**Files:** Modify `src/pages/NewsEdit.tsx` (+ `src/pages/newsEdit/**`, `src/components/ImageUpload.tsx`)

**Findings:**
- [P1][S] **"Cover image" label is orphaned** — `ImageUpload` never accepts or forwards an `id`, so `<Label htmlFor="image">` (`NewsEdit.tsx:290`) binds to nothing even while editing, unlike Body/Source URL/Tags which bind correctly. (`ImageUpload.tsx:9-23`; `NewsEdit.tsx:288-293`)
- [P2][S] No distinct upload-in-progress state for the cover image — the file only goes in the whole-form multipart submit, so a slow upload shows nothing beyond the generic "Saving…" spinner, short of A6's separate upload-progress requirement.
- [P2][S] A saved cover image can only be **replaced, never removed** — `ImageUpload`'s "Remove" renders only when `localPreview` (a newly picked file) is set, not for an existing saved `value` (`ImageUpload.tsx:130-151`).
- [P2][S] `selectedImageFile` is not cleared when a `doc_version` conflict triggers `fetchNews()`, leaving a stale locally-picked file selected against freshly reloaded server state (`NewsEdit.tsx:220-224`).

- [ ] **Step 1: Re-audit against `## A6` first** (Lesson 1); report scorecard misses. Enumerate mutating controls + gates (Lesson 3). **Note:** Task 1 de-masks `NewsEdit.test.tsx`, so its `news.update` gate is now genuinely covered — if Task 1 surfaced a gap here, fix it in this task and say so.
- [ ] **Step 2:** Give `ImageUpload` an `id` prop and forward it to its file input so `<Label htmlFor>` binds. **`ImageUpload` is shared** (`src/components/`, not `ui/`) — check its other call sites before changing the signature; make `id` optional so they don't break.
- [ ] **Step 3:** Add a distinct upload-in-progress state for the cover image, and let a **saved** image be removed (not just replaced) — decide how removal is represented in the multipart payload and confirm `newsService.buildNewsFormData` carries it; if the backend can't express removal, **say so and stop** rather than shipping a button that lies.
- [ ] **Step 4:** Clear `selectedImageFile` when a `doc_version` conflict refetches, so the picked file can't be saved against reloaded state.
- [ ] **Step 5:** Gate + commit.

---

## Wave 3 exit check

- [ ] `bun run test` green · `CI=true bun run build` clean.
- [ ] **`grep -rn "vi.mock.*[Cc]an" src/`** — every remaining `<Can>` mock is either gone or recorded in Scope & Deferrals with file:line and a reason.
- [ ] **Every gate test discriminates** — for at least the scoped ones, the discrimination was *demonstrated* (prop removed ⇒ test fails), not asserted.
- [ ] Each task reported what the scorecard missed for its page; `scorecard.md` updated with the W3 deltas using the **open-findings** convention, its table still summing and sorting.
- [ ] Deferrals carried forward intact — nothing dropped silently.
