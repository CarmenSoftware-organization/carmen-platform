# UX Unification — Wave 0 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the durable north-star pattern spec, a full-app UX audit scorecard, and the one proven shared helper — so Waves 1–5 become mechanical, data-driven page work.

**Architecture:** Wave 0 is foundations-only. Two documentation/analysis deliverables (the elevated pattern spec completing all 8 archetype contracts; a parallel-subagent audit of all 28 page components rolled into a ranked scorecard) plus one small pure-function extraction (a filter-aware list empty-state resolver) built with TDD. **No existing page is modified in Wave 0** — extractions are additive/opt-in and get adopted when each page's wave lands.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest (jsdom) for unit tests, shadcn/ui + Tailwind. Package manager: Bun (`bun run …`).

## Global Constraints

_Every task's requirements implicitly include this section (copied from the master design + repo CLAUDE.md)._

- Frontend-only. No backend/API changes. No new libraries (repo rule 6).
- Do **not** modify `src/components/ui/` primitives (repo rule 2).
- Tokens are fixed by the calm-corporate reskin — this effort is structure/flow/states, not a rebrand. Colors via semantic classes only; status via `<Badge>`, never a hand-rolled colored span.
- Tests: Vitest, co-located `*.test.ts(x)` beside source, explicit imports (`import { describe, it, expect } from 'vitest'` — no globals), assert behavior not snapshots.
- Run `bun run test <path>` for a single test file; `bun run test` for the full suite.
- Wave 0 modifies **no** page component. The empty-state resolver is a new standalone util with its own test.
- Source of truth for the pattern content: `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` (the master design — §4 has A3/A4 in full and §4.3 the skeletons; §5 has the rubric).

---

### Task 1: Elevated pattern spec — `page-patterns.md`

Author the durable north-star doc that completes canonical contracts for all 8 archetypes. A3 and A4 already exist in full in the master design §4; the remaining archetypes are expanded from the §4.3 skeletons into the same 6-facet shape.

**Files:**
- Create: `.planning/design/system/page-patterns.md`
- Read (source): `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` (§4 contracts, §5 rubric)
- Read (cross-link targets): `.planning/design/system/tokens.md`, `.planning/design/system/components.md`

**Interfaces:**
- Produces: the archetype contracts and rubric that **Task 2** audits against, and that Waves 1–5 implement against. Section anchors other docs will link to: `## A1 … ## A8`, `## Audit rubric`.

- [ ] **Step 1: Create the file skeleton**

Create `.planning/design/system/page-patterns.md` with this exact top matter and one `##` section per archetype:

```markdown
# Carmen Platform — Page Patterns (canonical, elevated)

> The north-star UX contract per page **archetype**. Sits beside
> [`tokens.md`](./tokens.md) (visual layer) and [`components.md`](./components.md)
> (component inventory). Every page must meet its archetype's contract.
> Source: `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md`.

## Archetypes at a glance
| # | Archetype | Pages |
|---|-----------|-------|
| A1 | Public entry | Landing, Login |
| A2 | Dashboard | Dashboard |
| A3 | List / Management | Cluster, BusinessUnit, User, UserPlatform, Application, Role, News, ReportTemplate, SuperAdmin |
| A4 | Detail / Edit | ClusterEdit, BusinessUnitEdit, UserEdit, UserPlatformEdit, ApplicationEdit, RoleEdit, ReportTemplateEdit, PrintTemplateMappingEdit |
| A5 | Config (small-dimension) | PrintTemplateMappingManagement |
| A6 | Composer / Authoring | NewsEdit, BroadcastCompose |
| A7 | Console / Operational | TenantMigration, SqlWorkbench |
| A8 | Reference / read-only | Changelog, PermissionCatalog, Profile |

## Contract facets
Every archetype below specifies six facets: **Anatomy · Required states ·
Information hierarchy · Interaction/flow · Responsive · A11y.**
```

- [ ] **Step 2: Port A3 and A4 verbatim**

Copy the master design **§4.1 (A3 — List)** and **§4.2 (A4 — Edit)** into `## A3 …` and `## A4 …` sections, keeping all six facets. These are already concrete — do not paraphrase; port the bullet content exactly (reference file names included).

- [ ] **Step 3: Expand A1, A2, A5, A6, A7, A8 to full 6-facet contracts**

For each, start from the master design §4.3 skeleton line and expand into all six facets, following the A3/A4 shape and the rubric's rules (shared-primitive reuse, `<Badge>` status, complete states, 4px grid, filter-aware empty states). Each section MUST contain all six facet headings:

```markdown
## A7 — Console / Operational (reference: `SqlWorkbench`, `TenantMigration`)
- **Anatomy:** shared `PageHeader` (never hand-rolled); `Layout` wrapper; standard `space-y-4 sm:space-y-6` rhythm; bespoke core (editor / results / streaming console) below.
- **Required states:** every async surface has idle / running / empty-result / error; long ops show progress and are cancellable where they block.
- **Information hierarchy:** clear regions (input vs output vs actions); status via `<Badge>`; semantic tokens only.
- **Interaction/flow:** dangerous ops (DDL/DML, drops) via `ConfirmDialog` + `<Can>` permission gate; `toast.*` feedback (never `alert`); keyboard shortcuts where relevant.
- **Responsive:** works mobile→desktop; panels reflow, no fixed-width overflow.
- **A11y:** icon buttons have `aria-label`; error `role="alert"`; loading `role="status"`.
```

Write A1, A2, A5, A6, A8 in the same format (six facets each). Anchor content from §4.3.

- [ ] **Step 4: Append the audit rubric section**

Copy the master design **§5** (dimensions D1–D4 table + the five codified clarifications) into a `## Audit rubric` section so the spec is self-contained.

- [ ] **Step 5: Verify completeness**

Run:
```bash
grep -c '^## A[1-8]' .planning/design/system/page-patterns.md
grep -o '\*\*Anatomy' .planning/design/system/page-patterns.md | wc -l
grep -c '## Audit rubric' .planning/design/system/page-patterns.md
```
Expected: `8` archetype sections, `8` Anatomy facets (one per archetype), `1` rubric section. If any count is off, add the missing section/facet.

- [ ] **Step 6: Commit**

```bash
git add .planning/design/system/page-patterns.md
git commit -m "docs(design): elevated page-patterns spec — all 8 archetype contracts + rubric"
```

---

### Task 2: Full-app UX audit → `scorecard.md`

Audit every page component against its archetype contract (Task 1) using the §5 rubric, via parallel subagents — the same harness the calibration used. Roll findings into one ranked scorecard.

**Files:**
- Create: `.planning/design/audit/scorecard.md`
- Read (contracts): `.planning/design/system/page-patterns.md`
- Read (rubric + calibration results): `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` (§5, §6)

**Interfaces:**
- Consumes: archetype contracts + rubric from Task 1.
- Produces: `scorecard.md` — the prioritised gap list that Waves 1–5 plans consume to pick per-page tasks.

**Page → archetype map (28 components).** Reuse the 3 calibration results (marked ✓ — already scored in master design §6); audit the other 25.

| Archetype | Pages (file under `src/pages/`) |
|-----------|--------------------------------|
| A1 | `Landing.tsx`, `Login.tsx` |
| A2 | `Dashboard.tsx` |
| A3 | `ClusterManagement.tsx`✓, `BusinessUnitManagement.tsx`, `UserManagement.tsx`, `UserPlatformManagement.tsx`, `ApplicationManagement.tsx`, `RoleManagement.tsx`, `NewsManagement.tsx`✓, `ReportTemplateManagement.tsx`, `SuperAdminManagement.tsx` |
| A4 | `ClusterEdit.tsx`, `BusinessUnitEdit.tsx`, `UserEdit.tsx`, `UserPlatformEdit.tsx`, `ApplicationEdit.tsx`, `RoleEdit.tsx`, `ReportTemplateEdit.tsx`, `PrintTemplateMappingEdit.tsx` |
| A5 | `PrintTemplateMappingManagement.tsx` |
| A6 | `NewsEdit.tsx`, `BroadcastCompose.tsx` |
| A7 | `TenantMigrationManagement.tsx`, `sqlWorkbench/`✓ |
| A8 | `Changelog.tsx`, `PermissionCatalog.tsx`, `Profile.tsx` |

- [ ] **Step 1: Dispatch the audit subagents (parallel, grouped by archetype)**

For each un-audited page, dispatch a `general-purpose` agent with this prompt template (fill `{FILE}` and `{ARCHETYPE}`; paste that archetype's contract from `page-patterns.md` into `{CONTRACT}`):

```
You are a UX audit agent for carmen-platform (React + TS admin dashboard). Audit ONE page
against the fixed rubric + archetype contract below. Read the ACTUAL file(s) — do not guess.

FILE: {FILE}
ARCHETYPE: {ARCHETYPE}
CONTRACT (the north star for this archetype):
{CONTRACT}

RUBRIC — score each 0–3 (3=fully meets, 2=minor gaps, 1=major gaps, 0=absent/ad-hoc):
- D1 Structural consistency: conforms to anatomy; reuses shared primitives (not reusing an
  existing app-wide primitive like PageHeader = a gap even if the hand-rolled one looks fine).
- D2 State completeness: loading/empty/error/success/edge; empty state distinguishes
  "no data yet" vs "no match" and no-match considers search AND active filters.
- D3 Information hierarchy: 4px spacing, visual order, status via <Badge> (never hand-rolled
  colored spans), meta styling, no clutter.
- D4 Flow smoothness: create→edit→save, unsaved guard, keyboard shortcuts, persisted state,
  ConfirmDialog on destructive, toasts.
Neutral: optional summary strips are neither reward nor penalty. 44px rule: the tappable hit
area governs, not the visual control size.

OUTPUT EXACTLY:
PAGE: <name>  ARCHETYPE: {ARCHETYPE}
D1: <n>/3 — <one line>
D2: <n>/3 — <one line>
D3: <n>/3 — <one line>
D4: <n>/3 — <one line>
TOTAL: <sum>/12
FINDINGS: (most severe first; [] if none)
- [P0|P1|P2][S|M|L] <specific gap> (file:<line>)
```
Severity: P0=broken/blocks a task, P1=inconsistent with contract, P2=polish. Effort S/M/L.

Dispatch in archetype batches (e.g. all A3 pages together) so contracts are reused. Collect every scorecard.

- [ ] **Step 2: Roll up into `scorecard.md`**

Create `.planning/design/audit/scorecard.md`. Include (a) a summary table of all 28 pages with D1–D4 + total + P0/P1/P2 counts, sorted **findings-first** (P0 count desc → P1 count desc → then group by wave), and (b) the full per-page findings lists below. Use this header + table shape:

```markdown
# Carmen Platform — UX Audit Scorecard (2026-07-17)

> Rubric + contracts: [`page-patterns.md`](../system/page-patterns.md).
> Ranked findings-first (score is a gauge, not the driver — see master design §5.2).

## Ranked summary
| Page | Arch | D1 | D2 | D3 | D4 | Total | P0 | P1 | P2 | Wave |
|------|------|:--:|:--:|:--:|:--:|:-----:|:--:|:--:|:--:|:----:|
| SqlWorkbench | A7 | 2 | 3 | 2 | 3 | 10 | 0 | 2 | 4 | W4 |
| … | … | | | | | | | | | |

## Findings by page
### <Page> (<Arch>, <Total>/12)
- [P1][S] <gap> (file:line)
```

Seed the three ✓ rows from master design §6 (Cluster 12, News 11, SqlWorkbench 10) and their findings; fill the rest from Step 1.

- [ ] **Step 3: Verify coverage**

Run:
```bash
grep -oE '^\| [A-Za-z]' .planning/design/audit/scorecard.md | wc -l   # summary rows
grep -c '^### ' .planning/design/audit/scorecard.md                    # per-page finding blocks
```
Expected: 28 pages represented in both the summary table and the findings section. If a page is missing, dispatch its audit and add it.

- [ ] **Step 4: Commit**

```bash
git add .planning/design/audit/scorecard.md
git commit -m "docs(design): full-app UX audit scorecard (28 pages, findings-first)"
```

---

### Task 3: Filter-aware list empty-state resolver (TDD)

Extract the one cross-cutting rule the calibration proved (NewsManagement `:573`: empty state must branch on active filters, not search alone) into a pure, tested helper. Adopted opt-in by A3 pages in Wave 1 — **no page is modified now.**

**Files:**
- Create: `src/utils/listEmptyState.ts`
- Test: `src/utils/listEmptyState.test.ts`

**Interfaces:**
- Produces: `resolveListEmptyState(params: ListEmptyStateParams): ListEmptyStateResult` where
  `ListEmptyStateParams = { searchTerm: string; activeFilterCount: number }` and
  `ListEmptyStateResult = { kind: 'empty' | 'no-match'; showAddAction: boolean }`.
  Wave 1 consumes this to pick the correct `EmptyState` copy + whether to render the Add action.

- [ ] **Step 1: Write the failing test**

Create `src/utils/listEmptyState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveListEmptyState } from './listEmptyState';

describe('resolveListEmptyState', () => {
  it('returns empty + Add action when nothing is searched or filtered', () => {
    expect(resolveListEmptyState({ searchTerm: '', activeFilterCount: 0 }))
      .toEqual({ kind: 'empty', showAddAction: true });
  });

  it('returns no-match (no Add) when a search term is present', () => {
    expect(resolveListEmptyState({ searchTerm: 'acme', activeFilterCount: 0 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('returns no-match (no Add) when only filters are active', () => {
    expect(resolveListEmptyState({ searchTerm: '', activeFilterCount: 2 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('returns no-match when both search and filters are present', () => {
    expect(resolveListEmptyState({ searchTerm: 'acme', activeFilterCount: 1 }))
      .toEqual({ kind: 'no-match', showAddAction: false });
  });

  it('treats a whitespace-only search term as no search', () => {
    expect(resolveListEmptyState({ searchTerm: '   ', activeFilterCount: 0 }))
      .toEqual({ kind: 'empty', showAddAction: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/utils/listEmptyState.test.ts`
Expected: FAIL — `Failed to resolve import './listEmptyState'` / `resolveListEmptyState is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/utils/listEmptyState.ts`:

```ts
export interface ListEmptyStateParams {
  /** Current search box value (may contain leading/trailing whitespace). */
  searchTerm: string;
  /** Count of active filters (status, tags, etc.). 0 = none applied. */
  activeFilterCount: number;
}

export interface ListEmptyStateResult {
  /** `empty` = genuinely no data yet; `no-match` = data exists but is filtered/searched out. */
  kind: 'empty' | 'no-match';
  /** Whether to show the primary "Add" call-to-action (only meaningful when kind === 'empty'). */
  showAddAction: boolean;
}

/**
 * Decide which empty-state a list page should show. A list is "filtered" when a
 * non-blank search term OR any active filter is present — in that case the empty
 * result is a no-match, not an invitation to create the first record.
 */
export function resolveListEmptyState(
  { searchTerm, activeFilterCount }: ListEmptyStateParams,
): ListEmptyStateResult {
  const filtering = searchTerm.trim().length > 0 || activeFilterCount > 0;
  return filtering
    ? { kind: 'no-match', showAddAction: false }
    : { kind: 'empty', showAddAction: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/utils/listEmptyState.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listEmptyState.ts src/utils/listEmptyState.test.ts
git commit -m "feat(ux): filter-aware list empty-state resolver (Wave 0 helper)"
```

---

## Wave 0 exit check

- [ ] `bun run test` — full suite green (no regressions; Wave 0 added tests only).
- [ ] `page-patterns.md`, `scorecard.md`, `listEmptyState.ts` (+ test) all committed on `redesign/ux-unification`.
- [ ] Scorecard reviewed to confirm the W1 List findings are concrete enough to seed the Wave 1 plan.
