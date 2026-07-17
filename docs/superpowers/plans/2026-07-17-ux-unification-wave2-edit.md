# UX Unification — Wave 2 (Detail / Edit — A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 8 Detail/Edit (A4) pages up to the elevated A4 contract — closing the wave's one **P0 (a real permission hole)** and every A4 P1, anchored on a shared fetch-error/retry affordance so the "failed fetch renders as a forever-loading state" class is fixed once. Also clears the two leftovers Wave 1 explicitly handed forward.

**Architecture:** Task 1 extracts a `<FetchErrorState>` component (the `error` + `onRetry` pattern already hand-rolled twice, in `ActivityStream` and — via Wave 1 — `NewsroomSummary`). Tasks 2–9 are per-page against the A4 contract in `.planning/design/system/page-patterns.md`, ordered **findings-first** (P0 → P1 count → score), so the security P0 lands first. Task 10 clears the Wave 1 leftovers.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest (jsdom) + React Testing Library, shadcn/ui + Tailwind, react-router-dom. Package manager: Bun.

**Branch:** off `main` @ `76270d8` (contains merged W0 #42 + W1 #43).

## Global Constraints

- Frontend-only. No backend/API changes. **No new libraries.** Do **not** modify `src/components/ui/` primitives.
- **Copy the closest existing example** (repo rule 1). A4 references: `ClusterEdit.tsx` (simple), `ReportTemplateEdit.tsx` (tabbed) — **but see "Lessons carried from Wave 1" below before trusting either.**
- **Status via `<Badge>`** — never a hand-rolled colored span (repo rule 5). Never `alert()`/`window.confirm()` — use `toast.*` / `<ConfirmDialog>` (rule 3).
- **A4 two-mode fields:** every field renders edit (Input/Select/checkbox) and read-only (`ReadOnlyField`). Validation on blur via `validateField` → `text-xs text-destructive` + `border-destructive` **on the field**.
- `useUnsavedChanges(hasChanges)`; `Cmd/Ctrl+S` save, `Esc` cancel; after create `navigate('/x/:id', { replace: true })`.
- **Versioned entities thread `doc_version`** via `src/utils/docVersion.ts` — dedicated state, never in `formData`; send only when present; 409 → `notifyVersionConflict()` + refetch (rule 17).
- Catch blocks use `parseApiError` + `toast.error` (rule 12). Error regions `role="alert"`, loading regions `role="status"`.
- **Per-task gate:** `bun run test` green + `CI=true bun run build` clean, before every commit.
- Source of truth: A4 contract in `.planning/design/system/page-patterns.md`; findings in `.planning/design/audit/scorecard.md`.

## Lessons carried from Wave 1 — these are requirements, not advice

1. **An audit score is evidence, not proof.** W0's audit scored `ClusterManagement` **12/12 / 0 P1** while it carried the flagship P1 *and* a skeleton bug. W1's plan then deferred it on that false premise. **Therefore: every task must re-check its page against the A4 contract directly, and report any finding the scorecard missed** — do not treat the scorecard's list as complete.
2. **The reference pages get audited hardest, not softest.** `ClusterEdit` (Task 6) and `ReportTemplateEdit` (Task 8) *define* the A4 pattern others copy. Any gap left there re-seeds itself across the codebase.
3. **Never hardcode a derived count.** W1's plan prescribed `TableSkeleton columns={4}`, which was wrong (`DataTable` auto-prepends `#`) and shipped a new bug. Derive from the source of truth (`columns.length + 1`) and add a comment.
4. **Don't silently drop a known gap.** If something is out of scope, it goes in "Scope & Deferrals" with file:line — not into the void.

## Scope & Deferrals (no silent cap)

**Wave 2 fixes:** the **P0** (BusinessUnitEdit permission hole), every A4 **P1**, the mechanical consistency **P2s** (`role="alert"`/`role="status"`, `aria-label`s, `ReadOnlyField` reuse, `PageHeader` reuse, `Badge` status, tabbed `DevDebugSheet`, required-field markers, on-blur validation), plus the two Wave 1 leftovers (Task 10).

**Deferred (documented):**
- **Systemic <44px touch targets from the shared `Button`/`Input` `h-9` defaults** — app-wide design decision, still open. **In scope here only where the page authored the undersize itself** — notably `BusinessUnitEdit`'s `InlineField` (~32px across ~50 rows, Task 2) and `ApplicationEdit`'s api-name accordion (24–32px on its primary interaction surface, Task 7).
- **`formatDateTime` util extraction** (duplicated inline `fmt` helpers) — still tracked, still not done.
- **`TenantMigrationManagement.tsx:461`** hardcoded `TableSkeleton columns={5}` → Wave 4 (A7).
- **`SuperAdminManagement` `handleExport` maps `rows`, not `filteredRows`** (search narrows the table, not the export) — a product decision, not a defect; needs a call.
- **CLAUDE.md "Form Field Pattern" is stale** (shows `ReadOnlyText`; the real shared primitive is `ReadOnlyField`, used by 7/8 A4 pages) — a docs fix outside this wave.

---

### Task 1: `<FetchErrorState>` shared component (TDD)

The "a sub-fetch failed, so this panel loads forever" fix. The `error` + `onRetry` affordance is already hand-rolled twice — `src/pages/dashboard/ActivityStream.tsx:65-71` and (from Wave 1) `src/pages/newsManagement/NewsroomSummary.tsx`. Extract it once; Tasks 9 and 10 adopt it.

**Files:**
- Create: `src/components/FetchErrorState.tsx`
- Test: `src/components/FetchErrorState.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface FetchErrorStateProps {
    message?: string;    // default: "Couldn't load this."
    onRetry: () => void;
    retryLabel?: string; // default: "Try again"
    className?: string;  // lets callers size it into a card/panel
  }
  ```
  Tasks 9–10 render `<FetchErrorState message="Couldn't load the permission catalog." onRetry={loadCatalog} />`.

- [ ] **Step 1: Read the two existing hand-rolled instances first**

Read `src/pages/dashboard/ActivityStream.tsx:60-75` and `src/pages/newsManagement/NewsroomSummary.tsx` (its error branch). The extracted component must be able to replace BOTH without visual regression. If their markup/styling differs in a way one component can't serve, STOP and report NEEDS_CONTEXT rather than inventing a third style.

- [ ] **Step 2: Write the failing test**

Create `src/components/FetchErrorState.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FetchErrorState } from './FetchErrorState';

describe('FetchErrorState', () => {
  it('renders the given message inside an alert region', () => {
    render(<FetchErrorState message="Couldn't load the catalog." onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the catalog.");
  });

  it('falls back to a default message', () => {
    render(<FetchErrorState onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this.");
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<FetchErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses a custom retry label', () => {
    render(<FetchErrorState onRetry={() => {}} retryLabel="Reload" />);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test src/components/FetchErrorState.test.tsx`
Expected: FAIL — `Failed to resolve import './FetchErrorState'`.

- [ ] **Step 4: Implement**

Create `src/components/FetchErrorState.tsx` — a compact inline `role="alert"` block: muted message text + an underlined text button calling `onRetry`. Match the visual language of the two existing instances (read in Step 1); use semantic tokens only (`text-muted-foreground`, `text-destructive` as appropriate) and accept `className` for caller-side sizing. Keep it presentational — no fetching inside.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test src/components/FetchErrorState.test.tsx` → 4/4 PASS.

- [ ] **Step 6: Gate + commit**

```bash
bun run test && CI=true bun run build
git add src/components/FetchErrorState.tsx src/components/FetchErrorState.test.tsx
git commit -m "feat(ux): FetchErrorState — shared fetch-failure + retry affordance (Wave 2)"
```

---

### Task 2: BusinessUnitEdit — **P0 permission hole** + A4 shell (6/12) 🔴

**The wave's only P0, and it is a real authorization bug — do this first and get it right.**

**Files:** Modify `src/pages/BusinessUnitEdit.tsx` + `src/pages/businessUnitEdit/**` (decomposed: `BusinessUnitDocument.tsx`, `InlineField.tsx`, `shared.tsx`, `sections/*`, `BusinessUnitBrandingCard`, `BusinessUnitUsersCard`).

**Findings:**
- 🔴 **[P0][M] `canEdit` never reaches five sub-surfaces.** It is threaded into `InlineField` groups and the is_active/is_hq toggles, but `CalculationSettingsSection`, `NumberFormatsSection`, `ConfigurationSection`, `DatabaseConnectionSection` all receive a hardcoded `editing: true` with no `disabled`/`canEdit` prop; `BusinessUnitBrandingCard` gets `editing` as a literal `true`; `BusinessUnitUsersCard` has no `canEdit` prop at all. **A user without `cluster.update`/`cluster.create` can type into DB-connection host/port/user/password, change calculation method/currency, add/remove config rows, upload a logo, and add/edit/remove BU users — and the Save button (`BusinessUnitEdit.tsx:589-601`) has no `!canEdit` check, so it all persists.** (`businessUnitEdit/BusinessUnitDocument.tsx:129`, `BusinessUnitEdit.tsx:528, :561, :592`)
- [P1][S] Never uses the shared `PageHeader` that every other A4 page uses → no semantic `<h1>` (the "title" is a `<button>` inside the hero Card) and no Edit/read toggle in the header region. (`BusinessUnitEdit.tsx:485-491`, `businessUnitEdit/BusinessUnitDocument.tsx:45-86`)
- [P1][S] Status (Active/Inactive, HQ) rendered as hand-rolled pill `<button>`s with a manually-coloured dot (`bg-success`/`bg-muted-foreground`) instead of `<Badge variant="success"|"secondary">`. (`businessUnitEdit/BusinessUnitDocument.tsx:180-199`)
- [P1][S] `InlineField` — the control used for ~50 rows on this page — renders its read/click-to-edit button at ~32px tall (`px-2.5 py-1.5` on `text-sm`), under the 44px minimum. One shared component, so it degrades nearly the whole page on mobile. **Page-authored → in scope.** (`businessUnitEdit/InlineField.tsx:139-153`)
- [P2][S] Required fields (`cluster_id`, `code`, `name` — the only three `validateRequired()` enforces) show no required marker, while unrelated config fields do use `*`. (`BusinessUnitDocument.tsx:206-209` vs `sections/ConfigurationSection.tsx:24,33`)
- [P2][S] `InlineField` shows the red error message but never adds `border-destructive` to the input (stays `border-primary`) — the contract's message+border pairing is half-implemented. (`InlineField.tsx:26-27,126-136`)
- [P2][S] `CollapsibleSection` renders a clickable header + rotating chevron implying collapse, but all four call sites pass `forceOpen`, so clicking does nothing — a misleading affordance repeated 4×. (`businessUnitEdit/shared.tsx:18-35`, `sections/CalculationSettingsSection.tsx:82`)

- [ ] **Step 1: Close the P0.** Thread the existing `canEdit` (do not invent a second source of truth) into all six surfaces: the four `sections/*`, `BusinessUnitBrandingCard`, and `BusinessUnitUsersCard`. Each must disable its inputs/actions when `canEdit` is false. **Also guard the Save button** (`:589-601`) with `!canEdit`. **Write a failing test first** asserting that with `canEdit` false the DB-connection inputs are disabled and Save is not actionable — this is a security regression test, it must exist.
- [ ] **Step 2: Verify the P0 is fully closed.** Enumerate EVERY interactive control on the page and confirm each is gated. Report the enumeration. (The audit found six surfaces; per Lesson 1, confirm there is no seventh.)
- [ ] **Step 3:** Adopt the shared `PageHeader` (title + subtitle + Edit/read toggle in the header region, giving a real `<h1>`), keeping the hero card's other content. Mirror `ClusterEdit.tsx`'s existing-record header once Task 6 has fixed it — **if Task 6 hasn't run yet, mirror `UserEdit.tsx` instead and say so.**
- [ ] **Step 4:** Replace the hand-rolled status pills with `<Badge variant="success"|"secondary">`.
- [ ] **Step 5:** Raise `InlineField`'s read/edit control to a ≥44px tappable area on mobile without visually bloating a ~50-row form (padding/hit-slop, not a taller visual box). Add `border-destructive` on error. Add required markers to `cluster_id`/`code`/`name`.
- [ ] **Step 6:** Fix `CollapsibleSection`'s misleading affordance — either honour collapse or, if these sections must stay open, remove the chevron/click affordance so it doesn't imply an action that does nothing. Pick one and justify it in the report.
- [ ] **Step 7:** Gate (`bun run test` + `CI=true bun run build`) — note `BusinessUnitEdit.test.tsx` exists; keep it green. Commit.

---

### Task 3: UserPlatformEdit (5/12)

**Files:** Modify `src/pages/UserPlatformEdit.tsx`

**Findings:**
- [P1][M] `loading` is set (`:27,46,71`) but **never rendered** — no Skeleton/spinner/`role="status"` anywhere; the page shows "No roles assigned." both while loading and when truly empty. Imports neither `Skeleton` nor `TableSkeleton`. (`:1-19`)
- [P1][S] No `Cmd/Ctrl+S` / `Esc` shortcuts and **no `useUnsavedChanges` guard** — the add-role mini-form (`:181-224`) holds unsaved `selectedRoleId`/`scopeType`/`scopeClusterId` that is silently discarded on navigation. (contrast `ClusterEdit.tsx:2,24,94-97,103`)
- [P2][S] Load-error banner missing `role="alert"` (`:124-128`).
- [P2][S] No required markers / on-blur validation on the add-role mini-form; only a `toast.error` after clicking Add (`:77-98`, labels at `:184,191,203`).
- [P2][S] Remove-role icon `Button` has no `aria-label` (`:165-172`).
- [P2][S] Header has no Edit/read toggle (`PageHeader` at `:118-122` passes no `actions`); page has no primary form Card, only the Roles & Scope card — **defensible** (the entity has no own editable attributes) but currently undocumented.

- [ ] **Step 1:** Render the loading state — a `Skeleton` block matching the loaded shape, with `role="status"`, so loading ≠ empty.
- [ ] **Step 2:** Wire `useGlobalShortcuts({ onSave, onCancel })` + `useUnsavedChanges(hasChanges)` over the add-role mini-form's dirty state.
- [ ] **Step 3:** Add `role="alert"` to the load-error banner; `aria-label` to the remove-role button; required markers + on-blur `validateField` inline errors on the mini-form.
- [ ] **Step 4:** Document the "no own form Card / no Edit toggle" deviation in the A4 section of `page-patterns.md` (one sentence, mirroring the existing documented deviations) — it is intentional, so record it rather than leaving the next audit to re-raise it.
- [ ] **Step 5:** Gate + commit.

---

### Task 4: PrintTemplateMappingEdit (7/12)

**Files:** Modify `src/pages/PrintTemplateMappingEdit.tsx`

**Findings:**
- [P1][S] **No loading skeleton** — `loading` (`:56`) only disables the template `<select>` (`:315`) and gates the Edit button (`:258`); the form renders immediately with empty values while `fetchOne` is in flight. (Contrast `ClusterEdit.tsx:399-456`, `UserEdit.tsx:324+`, `ApplicationEdit.tsx:228+`.)
- [P1][S] **No field-level validation** — no `validateField`, no `fieldErrors`, no `onBlur` anywhere; required-field feedback is only a `toast.error` at submit (`:150-157`), with no `border-destructive` / inline message.
- [P1][S] Error banner missing `role="alert"` (`:268-270`) — every sibling A4 page sets it.
- [P2][S] Header hand-rolled instead of `PageHeader` (`:248-266`).
- [P2][S] `is_default` Badge uses `default|secondary` while `is_active` one field below uses `success|secondary` — inconsistent within the same form. (`:431-434` vs `:455-457`)

**Note:** this page is a documented single-mode config form (no edit/read toggle) — that deviation is intentional; do not "fix" it.

- [ ] **Step 1:** Add a loading `Skeleton` block matching the loaded form shape, with `role="status"`.
- [ ] **Step 2:** Wire the standard validation flow: `fieldErrors` state, `onBlur` → `validateField`, inline `text-xs text-destructive` + `border-destructive` on the field, and pre-submit re-validation.
- [ ] **Step 3:** Add `role="alert"` to the error banner; adopt the shared `PageHeader`; align the `is_default` Badge to the `success|secondary` pair.
- [ ] **Step 4:** Gate + commit.

---

### Task 5: UserEdit (8/12)

**Files:** Modify `src/pages/UserEdit.tsx` (+ `src/pages/userEdit/**`)

**Findings:**
- [P1][S] **"Change password" has no `<Can>` gate at all**, while the adjacent Edit button is gated on `user.update` — any viewer can open the reset dialog and call `userService.resetPassword`. (`:453-464`)
- [P1][S] Alias Name input doesn't wire `onBlur` → `validateField`/`fieldErrors`, unlike Username and Email on the same form — even though `validateField` has a dedicated `alias_name` rule (1–3 alphanumeric). (`:538-545`; rule at `src/utils/validation.ts:38-39`)
- [P2][S] Remove-business-unit icon button ~28px (`size-7` override) — page-authored, in scope. (`userEdit/UserAccessTree.tsx:100-108`)
- [P2][S] `DevDebugSheet` passed a single untabbed `data={rawResponse}`; the Add-BU dialog's own `businessUnitService.getAll()` fetch has no raw-response inspection. (`:793`; contrast `ClusterEdit.tsx:958-965`)
- [P2][S] No distinct not-found state on load failure (`:196-198`) — **shared with the ClusterEdit reference**, see Task 6.

- [ ] **Step 1:** Gate "Change password" — determine the correct permission (mirror what the Edit button uses, or a dedicated one if it exists; **verify the string exists** in `src/utils/permissions.ts` / route guards, don't invent it) and wrap it in `<Can>`. Write a failing test first — this is a permission regression test.
- [ ] **Step 2:** Wire Alias Name's `onBlur` → `validateField` + `fieldErrors` + `border-destructive`, matching Username/Email on the same form.
- [ ] **Step 3:** Raise the remove-BU icon button's hit area to ≥44px on mobile (padding/hit-slop, not visual bloat); add an `aria-label` if missing.
- [ ] **Step 4:** Convert `DevDebugSheet` to the tabbed pattern and add the Add-BU dialog's fetch as a second tab.
- [ ] **Step 5:** Gate + commit. (Not-found state is handled in Task 6's shared decision.)

---

### Task 6: ClusterEdit — the A4 "simple" **reference** (9/12)

⚠️ **Lesson 2 applies hardest here.** `page-patterns.md` names this file as the A4 reference; CLAUDE.md cites it as the Form Field Pattern reference. Gaps here re-seed across the codebase. **Re-verify the whole page against the A4 contract — the scorecard's four P1s may not be the full list** (in Wave 1 the audit missed a P1 *and* a skeleton bug on the equivalent reference page).

**Files:** Modify `src/pages/ClusterEdit.tsx` (+ `src/pages/clusterManagement/ClusterHero.tsx`)

**Findings:**
- [P1][M] The existing-record view **never renders `PageHeader`** — only the `isNew` branch does (`:471`). The existing-record header is a hand-rolled `<Link>` back-nav (`:505-511`) with the title inside the bespoke `ClusterHero` card (`ClusterHero.tsx:71`) — the same file uses two different header patterns for its two states.
- [P1][M] **The A4 two-mode field contract isn't implemented**, despite CLAUDE.md citing this exact file as the reference. `ReadOnlyField` is used by ApplicationEdit, UserEdit, RoleEdit, NewsEdit, ReportTemplateEdit, Profile and PrintTemplateMappingEdit — but never by ClusterEdit: when `editing` is false the whole form `Card` unmounts (`:539`) and only name/code/alias/active resurface inside `ClusterHero`; `max_license_bu` has no read-only field at all.
- [P1][S] Loading skeleton (`:412`) renders `grid-cols-1 lg:grid-cols-2` but the loaded content (`:466-943`) is single-column throughout → a visible layout snap when data lands.
- [P1][S] **No distinct not-found state:** `fetchCluster`'s catch sets a generic "Failed to load cluster: …" (`:149-150`) and `loading` still flips false, so the full edit shell (Hero, BU table, Users table, Add User) renders underneath the banner with blank data.
- [P2][S] `ClusterHero` audit meta uses `text-[11.5px] leading-relaxed` instead of the standard `text-[11px] leading-tight text-muted-foreground`. (`ClusterHero.tsx:77`)
- [P2][S] Row-action icon buttons in the BU/Users tables are `h-7`/`h-8` (28–32px) — page-authored, in scope. (`:587, :640, :669, :725`)

- [ ] **Step 1: Re-audit this page against the A4 contract first** (Lesson 1/2). List every contract facet and whether the page meets it. Report any finding the scorecard missed **before** fixing. If you find a new P0/P1, report it — do not silently fold it in.
- [ ] **Step 2:** Make the existing-record view use `PageHeader` (back + title + Edit toggle), so both states share one header pattern.
- [ ] **Step 3:** Implement the two-mode field contract with `ReadOnlyField` (including `max_license_bu`) instead of unmounting the form Card — this is the pattern the whole codebase copies.
- [ ] **Step 4:** Make the loading skeleton match the loaded layout (single-column) so there is no snap.
- [ ] **Step 5:** Add a distinct not-found state (a bad/deleted id must not render the full edit shell over blank data). **This is the shared not-found decision for the wave** — the same gap exists on `UserEdit` (`UserEdit.tsx:196-198`) and `RoleEdit` (`RoleEdit.tsx:96-101`).
  - Decide the pattern here and apply it to **both `ClusterEdit` AND `UserEdit`** in this task. (Task 5 deliberately left `UserEdit`'s not-found for this step so one decision covers both — do not skip it, or the gap ships silently.)
  - State the chosen pattern explicitly in your report so Task 9 can mirror it for `RoleEdit`.
- [ ] **Step 6:** Fix the meta styling; raise the row-action icon buttons' hit areas to ≥44px on mobile.
- [ ] **Step 7:** Gate (`ClusterEdit.test.tsx` exists — keep it green) + commit.

---

### Task 7: ApplicationEdit (9/12)

**Files:** Modify `src/pages/ApplicationEdit.tsx` (+ `src/pages/applicationEdit/**`)

**Findings:**
- [P1][M] **API-name accordion tap targets** — the page's *primary* interaction surface for granting access: module header row `py-1.5` on `text-sm` (~32px), per-module All/None `h-6` (24px), each api_name chip `h-7` (28px). Page-authored → in scope. (`:414-437, :443-455`)
- [P2][S] Loading skeleton renders one Card with 4 field rows; the loaded page renders two Cards side-by-side (`lg:grid-cols-[1fr_minmax(300px,340px)]`) → layout shift. (`:239-252` vs `:293-583`)
- [P2][S] `created_at`/`created_by_name`/`updated_at`/`updated_by_name` exist on the type and are returned by the backend, but `fetchApplication` never reads them and nothing displays them. (`:104-114`; contrast `ClusterEdit.tsx:141-146` + `ClusterHero.tsx:79-80`)
- [P2][S] The `isNew` path reuses the full `ApplicationIdentityHero` instead of the lighter `PageHeader` the isNew paths of ClusterEdit/UserEdit use. (`:269-286`)
- [P2][S] `catalogGroups.length === 0` is the sole "Loading catalog…" signal, conflating "not yet fetched" with "fetched and genuinely empty" — a zero-group backend response sticks on a loading message forever. (`:361-364`)

- [ ] **Step 1:** Raise the accordion's three tap targets to ≥44px on mobile without wrecking a dense 120-module list (padding/hit-slop; the module rows can afford real height).
- [ ] **Step 2:** Make the loading skeleton match the loaded two-Card layout.
- [ ] **Step 3:** Fix the loading-vs-empty conflation: track catalog fetch state explicitly (loading / loaded-empty / error) instead of inferring from `length === 0`. Use `<FetchErrorState>` (Task 1) for the error case.
- [ ] **Step 4:** Surface the audit fields (created/updated by/at) — mirror how ClusterEdit surfaces them. Use `PageHeader` on the isNew path.
- [ ] **Step 5:** Gate + commit.

---

### Task 8: ReportTemplateEdit — the A4 "tabbed" **reference** (10/12)

⚠️ **Lesson 2 applies here too** — this file is the A4 tabbed reference. Re-verify against the contract; the scorecard's list may be incomplete.

**Files:** Modify `src/pages/ReportTemplateEdit.tsx`

**Findings:**
- [P1][S] Icon-only "remove source param" button has no `aria-label`. (`:754-767`)
- [P2][S] Read-only Description renders a hand-rolled div (`border border-input bg-muted/50 …`) duplicating `ReadOnlyField`'s styling, though `ReadOnlyField` is already imported and used for Name/Source Name/Builder Key **in this same file**. (`:413-417` vs import at `:25`)
- [P2][S] `DevDebugSheet` called with a single `data={rawResponse}` instead of the `tabs` array; the page's second fetched domain (`listDbObjects` probe) never surfaces. (`:933`)
- [P2][S] Probe-BU "Load" button + BU-code `Input` are `h-7` (~28px) — page-authored, in scope. (`:603-624`)
- [P2][S] Metadata card renders dates/authors at `text-xs` instead of the standard muted meta styling. (`:522-536`)
- [P2][S] `handleBlur` reimplements a bespoke required-check for `name`/`report_group` instead of routing through the shared `validateField`. (`:222-229`; contrast `ClusterEdit.tsx:349-353`)

- [ ] **Step 1: Re-audit against the A4 contract** (Lesson 1/2); report anything the scorecard missed before fixing.
- [ ] **Step 2:** Add the missing `aria-label`; replace the hand-rolled read-only Description with the already-imported `ReadOnlyField`.
- [ ] **Step 3:** Convert `DevDebugSheet` to the tabbed pattern, adding the probe result as a second tab.
- [ ] **Step 4:** Route `handleBlur` through the shared `validateField`; fix the meta styling; raise the probe controls' hit areas.
- [ ] **Step 5:** Gate + commit.

---

### Task 9: RoleEdit (11/12)

**Files:** Modify `src/pages/RoleEdit.tsx`

**Findings:**
- [P1][M] **Permission-catalog fetch failure leaves the editor permanently stuck** on "Loading permission catalog…" with a spinner — only a one-shot `toast.error` fires (`:106-111`) and the render branch is just `catalog.length > 0 ? <PermissionPicker/> : <spinner>` (`:300-312`), with no error/retry state. A user hitting this in edit mode cannot add/remove permissions and gets no persistent explanation. **This is the exact class `<FetchErrorState>` (Task 1) exists for.**
- [P2][S] Back-to-list link has no vertical padding — tappable area well under 44px. (`:257-263`)
- [P2][S] "Active" checkbox row (native `input h-4 w-4` in an unpadded `<label>`) — hit area far below 44px. (`:387-397`)
- [P2][S] No dedicated not-found state (`:96-101`) — **mirror the pattern Task 6 establishes.**

- [ ] **Step 1:** Replace the stuck-spinner branch with explicit catalog fetch states (loading / loaded / error), rendering `<FetchErrorState message="Couldn't load the permission catalog." onRetry={…} />` on failure so the user can recover. **Write a failing test first** asserting a failed catalog fetch renders the retry affordance (not an endless spinner) and that retry refetches.
- [ ] **Step 2:** Raise the back-link and Active-checkbox hit areas to ≥44px on mobile.
- [ ] **Step 3:** Add the not-found state using the pattern Task 6 established (reference it explicitly).
- [ ] **Step 4:** Gate + commit.

---

### Task 10: Wave 1 leftovers — adopt `<FetchErrorState>` + fix ClusterEdit's skeleton counts

Wave 1 explicitly deferred these; clearing them here keeps the deferral honest.

**Files:** Modify `src/pages/ApplicationManagement.tsx`, `src/pages/BusinessUnitManagement.tsx`, `src/pages/RoleManagement.tsx`, `src/pages/UserPlatformManagement.tsx`, `src/pages/UserManagement.tsx`, `src/pages/newsManagement/NewsroomSummary.tsx`, `src/pages/dashboard/ActivityStream.tsx`, `src/pages/ClusterEdit.tsx`

- [ ] **Step 1: Summary forever-skeleton (5 pages).** Each has `catch { setSummary(null) }` feeding a `{loading || !summary ? <Skeleton/> …}` gate, so a failed summary fetch renders as a permanent loading state: `ApplicationManagement.tsx:134`, `BusinessUnitManagement.tsx:130`, `RoleManagement.tsx:140`, `UserPlatformManagement.tsx:175`, `UserManagement.tsx:189`. Give each an explicit error state rendering `<FetchErrorState>` (Task 1) with a working retry — `NewsroomSummary`'s Wave 1 implementation is the template. **Verify each page's real state shape before editing** (Lesson 1 — don't trust the line numbers blindly).
- [ ] **Step 2: DRY the two hand-rolled instances.** Refactor `NewsroomSummary` and `dashboard/ActivityStream.tsx:65-71` to use `<FetchErrorState>` too, so there is exactly one implementation. Keep their existing tests green.
- [ ] **Step 3: ClusterEdit skeleton counts.** `ClusterEdit.tsx:437,448` hardcode `TableSkeleton columns={4}`. **Verify the real rendered column count** for each table (including `DataTable`'s auto-prepended `#` column if those tables use `DataTable`) and derive it (`columns.length + 1`) with a brief comment — Lesson 3.
- [ ] **Step 4:** Gate + commit.

---

## Wave 2 exit check

- [ ] `bun run test` — full suite green. `CI=true bun run build` — clean.
- [ ] **The P0 is closed and covered by a regression test** — a user without `cluster.update`/`cluster.create` cannot edit or save ANY BusinessUnitEdit surface.
- [ ] `<FetchErrorState>` is the single implementation: `grep -rn "Try again" src/` shows no hand-rolled duplicates left.
- [ ] No hardcoded `TableSkeleton columns={N}` remains outside `TenantMigrationManagement` (deferred to W4): `grep -rn "TableSkeleton columns={[0-9]" src/`.
- [ ] Both A4 reference pages (`ClusterEdit`, `ReportTemplateEdit`) were re-audited against the contract, and any scorecard-missed findings are reported and either fixed or recorded.
- [ ] `scorecard.md` updated with the W2 deltas; any audit errors found are **corrected in place with a note** (as W1 did for ClusterManagement).
- [ ] Deferrals still recorded, none silently dropped.
