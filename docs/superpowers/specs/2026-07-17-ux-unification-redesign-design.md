# UX Unification & Redesign — Master Design

> **Date:** 2026-07-17
> **Type:** Design spec (brainstorm output) — planning artifact, no page code yet
> **Approach:** Pattern-first (define elevated canonical patterns → audit → redesign in waves)
> **Status:** Awaiting review → then per-wave implementation plans via writing-plans

## 1. Goal & non-goals

**Goal.** Bring all ~28 app pages to a single, elevated, consistent UX. Two intertwined
outcomes the user asked for: (a) **same style** — structural/visual consistency across
pages, and (b) **better UX** — higher quality on flow, states, and information hierarchy.

The calm-corporate reskin (PR #38) already unified the *low* layer — tokens, primitives,
and shell (sidebar, breadcrumb). This effort unifies the *page* layer — anatomy, states,
hierarchy, and flow — which the reskin did not touch.

**Key scoping insight (from calibration, §6).** Because the reskin lifted the floor, even
the most "deviant" page scores 10/12. This effort is therefore **alignment + gap-closing +
polish, not a rebuild.** Waves are lighter and lower-risk than a from-scratch redesign.

**Non-goals.**
- No backend/API changes. Frontend-only.
- No new libraries (repo rule 6). Stay on shadcn/ui + Tailwind + existing utils.
- Do **not** modify `src/components/ui/` primitives without explicit reason (repo rule 2).
- Not a visual rebrand — tokens are fixed by the reskin. This is structure/flow/states.
- A7 (console) pages keep their bespoke core; only their shell/states/safety are aligned.

## 2. Approach — Pattern-first (chosen)

1. Define an **elevated canonical pattern** per page *archetype* — the north star (§4).
2. Derive an **audit rubric** from those contracts (§5).
3. **Audit** every page against its archetype contract → a prioritised scorecard (§5.3).
4. **Redesign in waves**, each wave a separate implementation plan (§7).

Rejected: *Audit-first/bottom-up* (risks patterns that average existing code rather than
raise it) and *page-by-page* (no shared north star → drift recurs — the very cause of
today's inconsistency).

## 3. Page archetypes

The codebase has ~8 archetypes, not the 2 that `components.md` documents. Each gets its own
canonical contract. **A3 + A4 = 17/28 pages** → the core of the effort.

| # | Archetype | Pages | Count |
|---|-----------|-------|:---:|
| **A1** | Public entry | Landing, Login | 2 |
| **A2** | Dashboard | Dashboard | 1 |
| **A3** | **List / Management** | Cluster, BusinessUnit, User, UserPlatform, Application, Role, News, ReportTemplate, SuperAdmin | 9 |
| **A4** | **Detail / Edit** | ClusterEdit, BusinessUnitEdit, UserEdit, UserPlatformEdit, ApplicationEdit, RoleEdit, ReportTemplateEdit, PrintTemplateMappingEdit | 8 |
| **A5** | Config (small-dimension) | PrintTemplateMappingManagement | 1 |
| **A6** | Composer / Authoring | NewsEdit, BroadcastCompose | 2 |
| **A7** | Console / Operational (live/stream) | TenantMigration, SqlWorkbench | 2 |
| **A8** | Reference / read-only | Changelog, PermissionCatalog, Profile | 3 |

A5/A6 are variants of A3/A4. A7 stays bespoke at the core; only the shell aligns.

> **Correction (2026-07-18, W5):** Profile is grouped under A8 above by proximity (an
> account/reference page), but it actually follows the **A4 Edit contract** — an
> edit/read-only toggle, not A8's single-mode always-editable rule. This was mis-scoped
> from the W0 archetype skeletons and corrected once W5 re-grounded the page against source
> (see `page-patterns.md` §A8 footnote and `scorecard.md`'s Profile P0). Same root cause as
> the A5 wide-table, A6 doc_version/upload, and A7 cancellable-ops corrections earlier in
> the effort — the archetype map was accurate at a glance but not fully verified per-page
> until each wave actually touched the code.

## 4. Elevated canonical pattern spec (north star)

Each archetype's contract has **6 facets**: Anatomy · Required states · Information
hierarchy · Interaction/flow · Responsive · A11y. This doc specifies **A3 and A4 in full**
(they cover 17 pages); the remaining archetypes get a skeleton here and are completed in
Wave 0. The durable, standalone version lives in `.planning/design/system/page-patterns.md`
(a Wave 0 deliverable, sitting beside `tokens.md` / `components.md`).

### 4.1 A3 — List / Management (reference: `ClusterManagement.tsx`)

- **Anatomy (top→bottom):**
  `PageHeader`(title + subtitle + actions: Export = `variant="outline" size="sm"`, primary
  `Add`) → *optional* summary strip (e.g. FleetCapacity — treated as neutral) →
  `Card` with `CardHeader` toolbar [ `SearchInput` (flex-1 sm:max-w-sm) + Filter `Sheet`
  trigger with active-count badge + active-filter badges row ] → `CardContent` rendering
  skeleton / overlay / empty / table per the loading decision table → `ConfirmDialog` for
  destructive actions → `DevDebugSheet` (dev-only).
- **Required states:** skeleton (`loading && items.length===0`), overlay
  (`loading && items.length>0`), `EmptyState` that **distinguishes** "no data yet" vs
  "no match" — and the no-match branch must consider **search AND active filters** (not
  search alone), error banner with `role="alert"`, edge cases (single row, 100+ rows,
  long names → truncate/line-clamp in identity column).
- **Information hierarchy:** identity columns (code/name/title) are `Link`s styled
  `text-primary hover:underline`; status shown **via `<Badge>` only, never a hand-rolled
  colored span** (secondary Badges e.g. inline "Deleted" are allowed); meta (dates/author)
  as `text-[11px] leading-tight text-muted-foreground`; row actions right-aligned in a
  `DropdownMenu`; numeric columns kept uncluttered (meters/compact figures).
- **Interaction/flow:** search debounced 400ms + persisted (`search_<entity>`); `perpage`
  persisted per-entity (`perpage_<entity>`), plus page/sort/filter persisted; row/identity
  click → edit; `Cmd/Ctrl+K` focuses search (`useGlobalShortcuts`); filter state survives
  refresh; `toast.*` on success/error; permission gates via `<Can>`; CSV export required.
- **Responsive:** mobile-first; `Add` label shortens (`hidden sm:inline`); toolbar wraps;
  table scrolls horizontally within its container.
- **A11y:** interactive hit area ≥44px on mobile (the *tappable area*, not the visual
  control, governs — flag when the hit area itself is <44px); icon-only buttons carry
  `aria-label`; error region `role="alert"`; loading region `role="status"`.

### 4.2 A4 — Detail / Edit (reference: `ClusterEdit.tsx` simple, `ReportTemplateEdit.tsx` tabbed)

- **Anatomy:** header (back button + title + Edit/read toggle) → error display → `Card`
  form sections (`lg:grid-cols-2` on existing records) → related-data cards → optional
  sticky action bar (offset to sidebar `md:left-16 lg:left-60`, page `pb-20`) →
  `DevDebugSheet` with tabs. Large forms decompose into a `pageNameEdit/` subfolder with
  per-section components (reference: `businessUnitEdit/`) once a page passes ~600 lines.
- **Required states:** every field renders **two modes** — edit (Input/Select/checkbox) and
  read-only (`ReadOnlyField`); page states: loading, saving (button spinner + disabled),
  error, not-found, `doc_version` conflict (409 → `notifyVersionConflict()` + refetch).
- **Information hierarchy:** logical field grouping into titled sections; required-field
  markers; validation messages `text-xs text-destructive` with `border-destructive` on the
  field; status via `<Badge variant="success|secondary">`.
- **Interaction/flow:** `isNew = !id`; new ⇒ editing=true, existing ⇒ editing=false until
  Edit pressed; Edit stashes `formData`→`savedFormData`, Cancel restores; `useUnsavedChanges`
  guard; `Cmd/Ctrl+S` save, `Esc` cancel; `validateField` on blur; after create
  `navigate(/x/:id, {replace:true})`; versioned entities thread `doc_version` via
  `utils/docVersion.ts` (never in `formData`).
- **Responsive:** two-column collapses to one on mobile; sticky action bar offsets match the
  sidebar (`md:left-16 lg:left-60`).
- **A11y:** labels bound to inputs; async buttons disabled in-flight; error region
  `role="alert"`; loading region `role="status"`; icon-only buttons carry `aria-label`;
  interactive hit area ≥44px on mobile (the tappable area governs, not the visual control).

### 4.3 Skeleton contracts (completed in Wave 0)

- **A1 Public entry** — unauthenticated shell (no Layout/sidebar); brand-forward but
  token-compliant; complete auth states (idle/submitting/error/locked); a11y form labels.
- **A2 Dashboard** — `PageHeader` + responsive card/stat grid; every widget has
  loading/empty/error; links into A3 pages; no dead widgets.
- **A5 Config** — `PageHeader` + card-grouped layout (keeps `PrintTemplateMapping`'s
  small-dimension pattern); complete states; a lighter toolbar (select + toggle, no
  server-side table) — documented as an *intentional* A3 variant.
- **A6 Composer** — A4 shell + an authoring surface (Markdown/rich body, image upload);
  draft/dirty/save states; preview; long-form responsive.
- **A7 Console** — bespoke core is fine; the **shell must match**: shared `PageHeader`
  (not hand-rolled), standard `space-y-*` rhythm, complete idle/running/empty/error on every
  async surface, `ConfirmDialog` + permission gates on dangerous ops, `<Badge>` for status,
  toasts not `alert`, cancel/abort where a long op blocks.
- **A8 Reference** — `PageHeader` + readable content column; loading/empty/error; consistent
  meta styling; (Profile: a light single-mode form, treated as A8/account).

## 5. Audit rubric (refined via calibration)

### 5.1 Dimensions — score each 0–3

`3` = fully meets contract · `2` = minor gaps · `1` = major gaps · `0` = absent/ad-hoc.

| Code | Dimension | Checks |
|------|-----------|--------|
| **D1** | Structural consistency | Conforms to archetype anatomy; **reuses shared primitives** — if a shared component exists app-wide (e.g. `PageHeader`), not reusing it is a real gap even if the hand-rolled version looks fine. |
| **D2** | State completeness | loading / empty / error / success / edge all handled; empty-vs-**filter/search**-match distinguished; no blank panels or silent failures. |
| **D3** | Information hierarchy | 4px spacing grid, visual order, field grouping, **status via `<Badge>` (never hand-rolled colored spans)**, meta styling, no clutter. |
| **D4** | Flow smoothness | create→edit→save, unsaved guard, keyboard shortcuts, persisted state, `ConfirmDialog` on destructive, toasts, transitions. |

### 5.2 Codified clarifications (from calibration)

1. **Findings-first.** The score is coarse (reskin lifted the floor); the **findings list is
   the deliverable**. Rank pages by (P0 count → P1 count → page usage), not by the 0–12 sum.
2. **Optional summary strips are neutral** — neither reward nor penalty.
3. **44px rule** — the *tappable hit area* governs, not the visual control's pixel size.
4. **Status rule** — the violation is a *hand-rolled colored span* for status; multiple
   `<Badge>`s are fine.
5. **Shell-reuse rule** — non-reuse of an existing, app-wide shared primitive = P1.

### 5.3 Output — per-page scorecard

Each page yields: `D1–D4` scores + `TOTAL/12` + a **findings list** with severity
(P0 broken/blocks a task · P1 inconsistent with contract · P2 polish) and effort (S/M/L),
each citing `file:line`. All pages roll up into `.planning/design/audit/scorecard.md`,
sorted by the findings-first ranking.

### 5.4 How the audit runs

Parallel subagents, one per page (grouped by archetype), each given the archetype contract +
rubric, reading the real file(s) and returning the structured scorecard above. This is the
same harness the calibration used (§6) — proven to produce a usable spread and to surface
rubric ambiguities.

## 6. Calibration results (3-page sample, run 2026-07-17)

Ran the rubric on three representative pages to validate it before committing:

| Page | Archetype | D1 | D2 | D3 | D4 | Total | P1s |
|------|-----------|:-:|:-:|:-:|:-:|:-:|:-:|
| ClusterManagement | A3 canonical | 3 | 3 | 3 | 3 | **12/12** | 0 |
| NewsManagement | A3 mid | 3 | 2 | 3 | 3 | **11/12** | 1 |
| SqlWorkbench | A7 deviant | 2 | 3 | 2 | 3 | **10/12** | 2 |

**Findings that generalise (likely recur across pages):**
- **Empty state ignores active filters** (NewsManagement `:573`) — shows "create your first…"
  when a status/tag filter simply matched nothing. Candidate cross-cutting fix across A3.
- **Hand-rolled header instead of `PageHeader`** (SqlWorkbench `:282`) — shell drift.
- **Status via raw spans instead of `<Badge>`** (SqlWorkbench ConnectionBar/BuSwitcher/
  DbObjectTree) — D3 violation.
- **Summary strip stuck on skeleton if its fetch fails** (NewsManagement `:176`) — an
  error/retry affordance is missing on optional strips.

**Conclusion:** rubric is valid and discriminates via findings (not the tight score spread);
the effort is confirmed as align+polish, not rebuild.

## 7. Roadmap — waves (each = its own implementation plan)

Order chosen: **consistency ROI** (highest-volume, most-used pages first).

| Wave | Scope | Rationale |
|------|-------|-----------|
| **W0 Foundations** | Complete `page-patterns.md` for all archetypes; finalise rubric; run the full audit → `scorecard.md`; extract any shared component/helper the contracts need (e.g. a standard FilterSheet, an `EmptyState` filter-aware helper, a page scaffold). | Need the north star + tools + a data-driven gap list before touching pages. |
| **W1 List (A3)** | 9 Management pages | Highest volume, used daily; clearest contract; biggest consistency win. |
| **W2 Edit (A4)** | 8 Edit pages | Pairs entity-by-entity with W1. |
| **W3 Variants (A5/A6)** | PrintTemplateMapping, NewsEdit, BroadcastCompose | Variants of A3/A4. |
| **W4 Console (A7)** | TenantMigration, SqlWorkbench | Bespoke — align shell/states/safety, keep the special core. |
| **W5 Entry/Ref (A1/A2/A8)** | Landing, Login, Dashboard, Changelog, PermissionCatalog, Profile | Lower frequency (Dashboard/Landing may be pulled earlier as first-impression wins). |

Each wave: writing-plans → per-page tasks (TDD where behaviour changes), each page verified
against its contract + `yarn build` + Vitest before the next.

## 8. Deliverables & locations

| Artifact | Path | Produced |
|----------|------|----------|
| This master design | `docs/superpowers/specs/2026-07-17-ux-unification-redesign-design.md` | Now (brainstorm) |
| Elevated pattern spec (durable) | `.planning/design/system/page-patterns.md` | Wave 0 |
| Audit scorecard | `.planning/design/audit/scorecard.md` | Wave 0 |
| Per-wave implementation plans | `docs/superpowers/plans/…` | Per wave (writing-plans) |

## 9. Risks & open questions

- **Score compression** — the 0–12 scale barely discriminates (reskin lifted the floor).
  Mitigated by findings-first ranking (§5.2.1); the score is a gauge, not the driver.
- **Regression risk** — 17 core pages carry Vitest coverage (Cluster/BU/News/Tenant tests
  exist). Every wave keeps tests green; behaviour changes are TDD'd.
- **Shared-component extraction** (W0) could ripple into many pages — keep extractions
  additive/opt-in so a page adopts the new helper only when its wave lands.
- **Open:** whether to pull Dashboard/Landing earlier (first-impression) — deferred to W5
  by default; revisit after W0 audit shows their actual gap size.
