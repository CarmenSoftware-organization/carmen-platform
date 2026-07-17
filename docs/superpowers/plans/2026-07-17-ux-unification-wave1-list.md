# UX Unification — Wave 1 (List / A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 9 List/Management (A3) pages up to the elevated A3 contract — fixing every A3 P1 finding and the mechanical consistency P2s — anchored on one shared filter-aware empty-state component so the dominant recurring gap is fixed once, not nine times.

**Architecture:** Task 1 builds a `<ListEmptyState>` component (wraps the existing `EmptyState` + the W0 `resolveListEmptyState` util) — the single fix for the "empty state ignores active filters" P1 that recurs in 7 of 9 A3 pages. Tasks 2–9 are per-page: each adopts `<ListEmptyState>` where flagged and fixes that page's remaining findings against the A3 contract in `.planning/design/system/page-patterns.md`. Pages are ordered worst-score-first. `ClusterManagement` (12/12 reference, P2-only) is intentionally **deferred** — it already meets the contract.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest (jsdom) + React Testing Library, shadcn/ui + Tailwind, TanStack Table (`DataTable`), react-router-dom. Package manager: Bun.

**Branch dependency:** Task 1 imports `src/utils/listEmptyState.ts`, delivered in Wave 0 (PR #42). Execute this wave on a branch off `redesign/ux-unification` (or off `main` once #42 merges) — NOT off a `main` that predates #42.

## Global Constraints

_Every task's requirements implicitly include this section (from the master design, page-patterns.md A3 contract, and repo CLAUDE.md)._

- Frontend-only. No backend/API changes. **No new libraries.** Do **not** modify `src/components/ui/` primitives.
- **Copy the closest existing example** (repo rule 1). `ClusterManagement.tsx` is the canonical A3 reference — match its structure, do not invent layouts.
- **Status via `<Badge>`** (variants success/secondary/warning/info/destructive) — never a hand-rolled colored span (repo rule 5).
- **Filter-aware empty state:** all A3 empty states use `<ListEmptyState>` (Task 1) — the no-match branch must consider search **AND** active filters, never `searchTerm` alone.
- `DataTable` auto-prepends the `#` index column — never add your own (repo rule 4). Wrap column defs in `useMemo` (rule 8). Persist `perpage` per-entity in `localStorage` (`perpage_<type>`, rule 9).
- Catch blocks use `parseApiError`/`getErrorDetail` + `toast.error` (rule 12). Wrap dev-only code in `process.env.NODE_ENV === 'development'` (rule 7).
- Shared types in `src/types/index.ts`; page-local `FormData` interfaces stay in the page file (rule 10).
- **Per-task gate:** `bun run test` green + `CI=true bun run build` clean, before every commit.
- Source of truth: A3 contract in `.planning/design/system/page-patterns.md`; per-page findings in `.planning/design/audit/scorecard.md`.

## Scope & Deferrals (no silent cap)

**Wave 1 fixes:** every A3 **P1** finding (7× empty-state-ignores-filters, plus SuperAdmin's structural gaps, RoleManagement `<Can>` gating, UserPlatform silent role-count failure) and the **mechanical consistency P2s** (identity `<Link>` not `<button>`, icon-button `aria-label`, identity `truncate`/`line-clamp`, `TableSkeleton` column count, `text-[11px]` meta styling, shadcn `Select` over native, `DropdownMenu` row actions, `Badge` status).

**Deferred (documented, not silently dropped):**
- **Systemic <44px touch targets tied to the shared `Button`/`Input` defaults** (`h-9` = 36px) — fixing the base primitive height is an app-wide design decision, out of A3 scope. Only page-authored undersized overrides (explicit `h-6`/`h-7` the page itself set, e.g. ApplicationManagement's App-ID copy button) are fixed here. Tracked for a global control-sizing pass.
- **`ClusterManagement` (12/12)** — reference page, P2 polish only (Cmd/K hint, duplicated inline date-fmt, raw filter checkbox, unbounded fleet fetch). Deferred to a polish backlog; it already meets the contract.
- **Shared `formatDateTime` util extraction** (the duplicated inline `fmt` helper across pages) — a worthwhile DRY cleanup but P2 and broad; tracked separately.

---

### Task 1: `<ListEmptyState>` shared component (TDD)

The filter-aware empty state, used by 7 A3 pages in later tasks. Wraps `EmptyState` + the W0 `resolveListEmptyState` util so the no-match branch (search OR filters) and the create-CTA gating are decided in one place.

**Files:**
- Create: `src/components/ListEmptyState.tsx`
- Test: `src/components/ListEmptyState.test.tsx`

**Interfaces:**
- Consumes: `resolveListEmptyState` from `src/utils/listEmptyState.ts` (W0); `EmptyState` from `src/components/EmptyState.tsx`.
- Produces:
  ```ts
  interface ListEmptyStateProps {
    searchTerm: string;
    activeFilterCount: number;
    icon: LucideIcon;
    emptyTitle: string;          // "no data yet" heading, e.g. "No clusters yet"
    emptyDescription: string;    // page's existing empty copy
    addAction?: React.ReactNode; // rendered ONLY when nothing is searched/filtered
    noMatchTitle?: string;       // default "No matches found"
    noMatchDescription?: string; // default "No results match your search or filters. Try adjusting or clearing them."
  }
  ```
  Tasks 3–9 render `<ListEmptyState searchTerm={…} activeFilterCount={…} icon={…} emptyTitle="…" emptyDescription="…" addAction={<Button…/>} />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ListEmptyState.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Network } from 'lucide-react';
import { ListEmptyState } from './ListEmptyState';

describe('ListEmptyState', () => {
  const base = {
    icon: Network,
    emptyTitle: 'No clusters yet',
    emptyDescription: 'Create your first cluster.',
    addAction: <button>Add Cluster</button>,
  };

  it('shows the "empty" title + add action when nothing is searched or filtered', () => {
    render(<ListEmptyState {...base} searchTerm="" activeFilterCount={0} />);
    expect(screen.getByText('No clusters yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Cluster' })).toBeInTheDocument();
  });

  it('shows the no-match state (no add action) when a search term is present', () => {
    render(<ListEmptyState {...base} searchTerm="acme" activeFilterCount={0} />);
    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Cluster' })).not.toBeInTheDocument();
  });

  it('shows the no-match state when only filters are active (no search term)', () => {
    render(<ListEmptyState {...base} searchTerm="" activeFilterCount={2} />);
    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Cluster' })).not.toBeInTheDocument();
  });

  it('uses custom no-match copy when provided', () => {
    render(
      <ListEmptyState
        {...base}
        searchTerm="acme"
        activeFilterCount={0}
        noMatchTitle="No clusters match"
      />,
    );
    expect(screen.getByText('No clusters match')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/components/ListEmptyState.test.tsx`
Expected: FAIL — `Failed to resolve import './ListEmptyState'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/components/ListEmptyState.tsx`:

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { resolveListEmptyState } from '../utils/listEmptyState';

interface ListEmptyStateProps {
  searchTerm: string;
  activeFilterCount: number;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  addAction?: React.ReactNode;
  noMatchTitle?: string;
  noMatchDescription?: string;
}

/**
 * A3 list empty state. Distinguishes "no data yet" (offer the create CTA) from
 * "no match" (a search term OR any active filter is in effect) via the shared
 * resolveListEmptyState rule, so every List page treats filters consistently.
 */
export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
  searchTerm,
  activeFilterCount,
  icon,
  emptyTitle,
  emptyDescription,
  addAction,
  noMatchTitle = 'No matches found',
  noMatchDescription = 'No results match your search or filters. Try adjusting or clearing them.',
}) => {
  const { kind, showAddAction } = resolveListEmptyState({ searchTerm, activeFilterCount });

  if (kind === 'no-match') {
    return <EmptyState icon={icon} title={noMatchTitle} description={noMatchDescription} />;
  }

  return (
    <EmptyState
      icon={icon}
      title={emptyTitle}
      description={emptyDescription}
      action={showAddAction ? addAction : undefined}
    />
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/components/ListEmptyState.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Gate + commit**

```bash
bun run test && CI=true bun run build
git add src/components/ListEmptyState.tsx src/components/ListEmptyState.test.tsx
git commit -m "feat(ux): ListEmptyState — filter-aware A3 empty state (Wave 1)"
```

---

### Task 2: SuperAdminManagement → A3 contract (6/12 — structural)

The only A3 page missing the toolbar + table facet. **Read `ClusterManagement.tsx` (the A3 reference) and the current `SuperAdminManagement.tsx` before editing** (repo rule 1).

**Files:**
- Modify: `src/pages/SuperAdminManagement.tsx`

**Facts established while drafting — do NOT re-derive, and do not "fix" what already exists:**
- `PageHeader` is **already used** (`:134-137`) but passes **no `actions`** — add actions; do not re-adopt the component.
- `DevDebugSheet` is **already present** (`:267`) — leave it as-is.
- `ConfirmDialog` on remove is **already correct** (`:255-265`) — leave it.
- `superAdminService.list()` takes **no params → the endpoint is not paginated**. Use a **client-side** `DataTable` (no `serverSide`/`totalRows`/`onPaginateChange`).
- Row shape: `SuperAdminRow { id, user_id, created_at?, is_active? }`; `resolveUser(user_id)` (`:99`) maps to a display name; `fmt()` (`:24-29`) formats dates; `availableUsers` (`:94-97`) is the picker's option set.
- Icon already imported and correct for this page: `ShieldAlert`.

**Adjudicated findings:**
- [P1][M] No `PageHeader` **actions**, no `SearchInput`, no CSV export — toolbar facet missing; "Add" lives in a persistent inline Card (`:145-193`) instead of a header action.
- [P1][M] Hand-rolled `divide-y` list instead of the shared `DataTable` (`:220-249`).
- [P1][S] Loading is plain text with no `role="status"`/`TableSkeleton`, and `fetchData` sets `loading=true` on every add/remove refresh, so the whole list blanks instead of the required overlay-on-refetch (`:44,53,209-212`).
- [P2][S] Native `<select>` user picker instead of the shared shadcn `Select` (`:155-173`).
- [P2][S] Remove is a bare icon `Button`, not right-aligned in a `DropdownMenu` (`:237-245`).
- [P2][S] Meta uses `text-xs` instead of `text-[11px] leading-tight text-muted-foreground` (`:229-231`).
- ~~[P2][S] No `<Can>` gating on Add/Remove~~ — **ADJUDICATED NOT APPLICABLE. Do not implement.** This route is `superAdminOnly`, and super admins by definition *"bypass all permission checks"* (the page's own subtitle, `:136`). A `<Can permission=…>` wrapper would always pass and add zero security. The audit applied the A3 rule mechanically. Record it as an intentional deviation (Step 5) instead.
- **Filter `Sheet`: intentionally omitted.** The only filterable field is `is_active`, which is effectively always true for a super-admin grant — a Sheet for it would be noise. Ship `SearchInput` only; `activeFilterCount` is therefore always `0`. Document this deviation (Step 5).

- [ ] **Step 1: Header actions + search toolbar** — pass `actions` to the existing `PageHeader`: `Export` (`variant="outline" size="sm"`, via `generateCSV`/`downloadCSV` over rows: user, user_id, status, added) + a primary `Add Super Admin` button that opens a `Dialog`. Delete the persistent "Add Super Admin" `Card` (`:145-193`), moving its picker + Add button into that Dialog (keep `handleAdd`, `selectedUserId`, `adding` as-is). Add a `Card` + `CardHeader` toolbar containing `SearchInput` (new `searchTerm` state; filter `rows` client-side on resolved user name + `user_id`), and wire `useGlobalShortcuts({ onSearch })` + a `searchInputRef` for ⌘K — mirror `ClusterManagement.tsx:89-91, 420-426`.
- [ ] **Step 2: Move the list to `DataTable`** — replace the `divide-y` block (`:220-249`) with `<DataTable columns={columns} data={filteredRows} />` (client-side). Define `columns` in `useMemo`: **user** (resolved name `text-sm font-medium`, with the `user_id` beneath at `font-mono text-[11px] text-muted-foreground`); **status** → `<Badge variant={row.original.is_active !== false ? 'success' : 'secondary'}>`; **created_at** → header "Added", rendered via the existing `fmt()` at `text-[11px] leading-tight text-muted-foreground` (fixes the meta-styling P2); **actions** → right-aligned `DropdownMenu` (trigger `MoreHorizontal` with `aria-label`) containing a destructive `Remove` item calling `setRemoveId(row.original.id)`. **Do not add a `#` column** (DataTable adds it).
- [ ] **Step 3: Fix loading + empty states** — `TableSkeleton columns={4}` when `loading && rows.length === 0`; an absolute overlay with `role="status"` when `loading && rows.length > 0`, so add/remove refresh keeps the table visible (copy the pattern at `ClusterManagement.tsx:536-559`). Replace the bare `<EmptyState>` (`:213-218`) with:
  ```tsx
  <ListEmptyState
    searchTerm={searchTerm}
    activeFilterCount={0}
    icon={ShieldAlert}
    emptyTitle="No super admins"
    emptyDescription="No platform users have super-admin privileges yet."
    addAction={<Button size="sm" onClick={openAddDialog}><Plus className="mr-2 h-4 w-4" />Add Super Admin</Button>}
  />
  ```
- [ ] **Step 4: Swap the native `<select>` → shadcn `Select`** — inside the new Dialog, replace the raw `<select>` (`:155-173`) with `components/ui/select.tsx`, preserving the `availableUsers` options, the "Select a user..." placeholder, the disabled-while-`adding` behaviour, and the existing `aria-label`.
- [ ] **Step 5: Document the two intentional deviations** — add one sentence each to the A3 section of `.planning/design/system/page-patterns.md`: SuperAdminManagement ships no `<Can>` gating (route is `superAdminOnly`; super admins bypass all permission checks) and no filter `Sheet` (no meaningful filter dimension). Mirror how A5's deviations are documented so the next audit doesn't re-raise them.
- [ ] **Step 6: Verify** — `bun run test` green, `CI=true bun run build` clean. Confirm manually: search narrows the table; add/remove keeps the table visible under the overlay (no blank-out); empty vs no-match copy differs; Export downloads a CSV.
- [ ] **Step 7: Commit** — `git commit -m "feat(ux): SuperAdminManagement to A3 contract (toolbar, DataTable, states)"`

---

### Task 3: RoleManagement (8/12)

**Files:** Modify `src/pages/RoleManagement.tsx`

**Findings:**
- [P1][S] Add Role / Edit / Delete not wrapped in `<Can permission="role.create|role.update|role.delete">` (`:364-368, :318-324, :325-331`).
- [P1][S] Empty state ignores `statusFilter` — ternary only checks `searchTerm` (`:484-501`).
- [P2][S] Identity column uses `<button onClick={navigate}>` instead of `<Link to=…>` (`:231-239`).
- [P2][S] Filter-badge remove `<X>` buttons have no `aria-label` (`:459-464`).

- [ ] **Step 1:** Wrap the header "Add Role" action in `<Can permission="role.create">`; wrap the row `Edit` menu item in `<Can permission="role.update">` and `Delete` in `<Can permission="role.delete">` — mirror `ClusterManagement.tsx:374-385`.
- [ ] **Step 2:** Replace the searchTerm-only empty-state block (`:484-501`) with `<ListEmptyState searchTerm={searchTerm} activeFilterCount={activeFilterCount} icon={…} emptyTitle="No roles yet" emptyDescription="…existing copy…" addAction={<Can permission="role.create"><Button size="sm" onClick={…}>Add Role</Button></Can>} />`. Ensure an `activeFilterCount` is computed (count `statusFilter` in effect) if not already present.
- [ ] **Step 3:** Change the identity cell from `<button onClick={() => navigate(...)}>` to `<Link to={`/platform/roles/${row.original.id}/edit`} className="text-primary hover:underline">` (match ClusterManagement identity columns).
- [ ] **Step 4:** Add `aria-label` to each filter-chip remove button, e.g. `aria-label={`Remove ${label} filter`}`.
- [ ] **Step 5:** Verify (`bun run test` + `CI=true bun run build`); confirm a status filter with zero matches shows the no-match copy (not the create CTA), and Edit/Delete hidden without permission.
- [ ] **Step 6:** Commit — `git commit -m "feat(ux): RoleManagement A3 fixes (Can gating, filter-aware empty, Link identity, aria-labels)"`

---

### Task 4: UserPlatformManagement (9/12)

**Files:** Modify `src/pages/UserPlatformManagement.tsx`

**Findings:**
- [P1][M] "Roles" column + `PlatformAccessSummary` coerce `userRoleService.list()` failures to a role-count of `0` — indistinguishable from a genuinely unprivileged user; a transient failure silently under-reports privilege (`:132-137, :160-166`).
- [P1][S] Empty state doesn't branch on the active status filter (`:422-427`).
- [P2][S] No row-level actions `DropdownMenu` (may be intentional — no delete concept).
- [P2][S] `PageHeader` actions only Export, no Add (likely intentional — records derive from Users, no `/new`).
- [P2][S] Identity `username` renders a raw `<button>` styled as a link instead of `<Link>` (`:244-251`).

- [ ] **Step 1:** Make role-fetch failure visible, not `0`. When `userRoleService.list()` rejects for a user, mark that row's role-count as unknown (render a muted "—" with a `title`/`aria-label` "Couldn't load roles" and a subtle warning affordance, not `0`), and surface a page-level `toast.error`/inline note that some role data failed to load. Do the same for `PlatformAccessSummary` (do not fold failed fetches into the privileged/unprivileged tally). Keep the fix minimal and typed.
- [ ] **Step 2:** Replace the empty-state block (`:422-427`) with `<ListEmptyState>` (compute `activeFilterCount` from the status filter); no Add action (pass `addAction={undefined}` — this page has no create route).
- [ ] **Step 3:** Change the `username` identity cell from `<button>` to `<Link to={…}>` (match ClusterManagement).
- [ ] **Step 4 (documentation, not code):** In `.planning/design/system/page-patterns.md` A3 section, add one line noting UserPlatformManagement's **intentional** deviations (no `Add` action, no row-actions dropdown — records are derived from Users) so future audits treat them as documented, like A5's deviations. Keep it to a sentence.
- [ ] **Step 5:** Verify; confirm a filtered-empty result shows no-match copy, and that a simulated role-fetch failure no longer reads as "0 roles".
- [ ] **Step 6:** Commit — `git commit -m "feat(ux): UserPlatformManagement A3 fixes (surface role-fetch failures, filter-aware empty, Link identity)"`

---

### Task 5: UserManagement (10/12)

**Files:** Modify `src/pages/UserManagement.tsx`

**Findings:**
- [P1][S] EmptyState only checks `searchTerm`, ignoring `statusFilter`/`showDeleted` (`:744-750`).
- [P2][S] Filter-chip remove `<button>`s render only `<X>` with no `aria-label` (`:719, :727`).
- [P2][S] Row-actions `DropdownMenuTrigger` sized `h-8 w-8` (32px) — **deferred** (systemic default; note only).

- [ ] **Step 1:** Replace the empty-state block (`:744-750`) with `<ListEmptyState>` (compute `activeFilterCount` from `statusFilter` + `showDeleted`; `emptyDescription` = existing "Get started by creating your first user"; `addAction` = the existing gated Add User button).
- [ ] **Step 2:** Add `aria-label` to the status-chip and "Show Deleted"-chip remove buttons (`:719, :727`).
- [ ] **Step 3:** Verify; confirm Inactive-only-with-no-matches shows no-match copy.
- [ ] **Step 4:** Commit — `git commit -m "feat(ux): UserManagement filter-aware empty + filter-chip aria-labels"`

_(Do not resize the row-actions trigger here — that is the deferred systemic touch-target item.)_

---

### Task 6: ApplicationManagement (10/12)

**Files:** Modify `src/pages/ApplicationManagement.tsx`

**Findings:**
- [P1][S] Empty state ignores Status/Device filters — only `searchTerm` gates messaging/CTA (`:489-500`).
- [P2][S] App-ID copy icon-button hit area is `h-6 w-6` (24px) — **page-authored override**, fix it.

- [ ] **Step 1:** Replace the empty-state block (`:489-500`) with `<ListEmptyState>` (compute `activeFilterCount` from status + device filters).
- [ ] **Step 2:** Enlarge the App-ID copy button's tappable area to ≥44px on mobile without visually bloating the dense cell — e.g. keep the 24px icon but add hit-area padding (`h-8 w-8` minimum, or a `-m-2 p-2` hit-slop) and ensure it has an `aria-label` (e.g. `"Copy App ID"`).
- [ ] **Step 3:** Verify; confirm a Device-filter-only zero-result shows no-match copy.
- [ ] **Step 4:** Commit — `git commit -m "feat(ux): ApplicationManagement filter-aware empty + copy-button hit area"`

---

### Task 7: BusinessUnitManagement (11/12)

**Files:** Modify `src/pages/BusinessUnitManagement.tsx`

**Findings:**
- [P1][M] EmptyState ignores active filters (`statusFilter`/`showDeleted`) (`:483-494`).
- [P2][S] `TableSkeleton columns={7}` undercounts the real set (8; 9 with `showDeleted`) (`:498`).
- [P2][S] Name identity cell has no `truncate`/`line-clamp` (`:242-256`).

- [ ] **Step 1:** Replace the empty-state block (`:483-494`) with `<ListEmptyState>` (compute `activeFilterCount` from `statusFilter` + `showDeleted`).
- [ ] **Step 2:** Fix `TableSkeleton` `columns` to match the real column count, including the conditional `+1` when `showDeleted` adds the Deleted column (mirror how the `columns` memo counts them).
- [ ] **Step 3:** Add `truncate` (with a `max-w-[…]` or `title={name}`) to the name identity cell so long names don't blow out the row (match the A3 long-name edge case).
- [ ] **Step 4:** Verify; confirm skeleton column count matches the loaded table (no width snap) and filtered-empty shows no-match copy.
- [ ] **Step 5:** Commit — `git commit -m "feat(ux): BusinessUnitManagement filter-aware empty + skeleton col count + name truncate"`

---

### Task 8: NewsManagement (11/12)

**Files:** Modify `src/pages/NewsManagement.tsx` (+ `src/pages/newsManagement/NewsroomSummary.tsx`)

**Findings:**
- [P1][S] EmptyState distinguishes search-match but NOT filter-match (status/tag filters) (`:573-584`).
- [P2][S] Summary masthead renders its skeleton **permanently** on summary-fetch failure — no error/retry (`:176-177`, `NewsroomSummary.tsx:128`).
- [P2][S] Table title `Link` has no `truncate`/`line-clamp` (`:332-334`).

- [ ] **Step 1:** Replace the empty-state block (`:573-584`) with `<ListEmptyState>` (compute `activeFilterCount` from status + tag filters). **Note:** if `NewsManagement.test.tsx` asserts the exact empty-state copy, keep `emptyDescription` equal to the current "Get started by creating your first news article" string so the test stays green (or update that assertion in the same task).
- [ ] **Step 2:** In `NewsroomSummary`, distinguish summary-fetch failure from loading — when the summary fetch fails, render a compact inline error/retry affordance instead of the perpetual skeleton (gate on a `summaryError` state, not just `loading || !summary`).
- [ ] **Step 3:** Add `truncate`/`line-clamp-1` (+ `title`) to the table title `Link`.
- [ ] **Step 4:** Verify (`bun run test` — NewsManagement has a known intermittent flake; re-run once if it flakes); confirm a tag/status filter with zero matches shows no-match copy and the summary shows an error affordance on fetch failure.
- [ ] **Step 5:** Commit — `git commit -m "feat(ux): NewsManagement filter-aware empty + summary error state + title truncate"`

---

### Task 9: ReportTemplateManagement (11/12)

**Files:** Modify `src/pages/ReportTemplateManagement.tsx`

**Findings:**
- [P1][S] Empty state ignores active filters — `!searchTerm` is the only gate; `activeFilterCount` computed at `:153` but unused here (`:449-460`).
- [P2][S] Filter-chip remove buttons are raw `<button>` with no `aria-label` and a tiny hit area (`:427-429, :435-437`).
- [P2][S] Identity `name` column has no `truncate`/`max-w`, unlike the adjacent `description` column (`:192-198`).

- [ ] **Step 1:** Replace the empty-state block (`:449-460`) with `<ListEmptyState>` using the already-computed `activeFilterCount` (`:153`).
- [ ] **Step 2:** Add `aria-label` to the status/source-type filter-chip remove buttons.
- [ ] **Step 3:** Add `truncate max-w-[…]` (+ `title`) to the `name` identity cell, matching the neighboring `description` column's `truncate max-w-[200px]`.
- [ ] **Step 4:** Verify; confirm an Inactive+Source filter with zero matches shows no-match copy.
- [ ] **Step 5:** Commit — `git commit -m "feat(ux): ReportTemplateManagement filter-aware empty + chip aria-labels + name truncate"`

---

## Wave 1 exit check

- [ ] `bun run test` — full suite green.
- [ ] `CI=true bun run build` — clean.
- [ ] All 8 A3 pages that had P1s now use `<ListEmptyState>` (grep: `rg "ListEmptyState" src/pages` returns the 7 adopters + any in SuperAdmin).
- [ ] Re-audit spot check: re-run the audit rubric on SuperAdminManagement, RoleManagement, and one mid page (e.g. UserManagement) and confirm each P1 is cleared and the score moved up. Append the deltas to `.planning/design/audit/scorecard.md` (or a `scorecard-w1.md`).
- [ ] Deferred items (systemic <44px, ClusterManagement polish, formatDateTime extraction) recorded in the roadmap/backlog — not silently dropped.

## Self-review (fill after drafting)

Coverage: every A3 page with a P1 has a task (SuperAdmin, Role, UserPlatform, User, Application, BusinessUnit, News, ReportTemplate = 8); ClusterManagement deferred with reason. The recurring empty-state P1 is fixed once via Task 1 and adopted in Tasks 3–9. Deferrals are documented, not dropped.
