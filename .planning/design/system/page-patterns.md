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

## A1 — Public entry (reference: `Landing`, `Login`)
- **Anatomy:** no `Layout`/sidebar — standalone unauthenticated shell; brand-forward
  hero/panel (logo, product name) + primary content (marketing content for Landing; auth
  form `Card` for Login); minimal footer; no `PageHeader` (there's no persistent app chrome
  to header here).
- **Required states:** Login form states — idle, submitting (button spinner + disabled per
  the Loading Button Pattern), error (`role="alert"`, `parseApiError` message), locked/
  rate-limited (explicit message, resubmission disabled); Landing has no async data states
  beyond initial paint but must avoid layout shift while brand assets load.
- **Information hierarchy:** single primary CTA per screen (`Sign in` / `Get started`) as
  the primary `Button`; secondary links (forgot password, sign up) de-emphasized
  (`text-sm text-muted-foreground` or link/ghost variant); brand color used sparingly — the
  single trustworthy blue accent, never a purple/gradient hero (anti-AI-generic rule);
  labels bound to inputs.
- **Interaction/flow:** Enter key submits the form; validation on blur (`validateField`)
  mirrors A4; failed auth surfaces via `toast.error` and/or an inline banner, never
  `alert()`; successful login `navigate()`s into the app shell.
- **Responsive:** mobile-first single column; an `lg:` two-pane layout (brand panel + form)
  is allowed but must collapse to one column below `lg:`; touch targets ≥44px.
- **A11y:** every input has a bound `<label>`; error banner `role="alert"`; focus moves to
  the first invalid field on failed submit; visible focus ring on all interactive elements;
  color is never the sole signal for an invalid field (border + icon + text together).

## A2 — Dashboard (reference: `Dashboard`)
- **Anatomy:** shared `PageHeader` (title + optional subtitle, no destructive primary
  action) → responsive grid of stat/summary `Card`s → one or more widget sections (recent
  activity, quick links) → dev-only raw-data inspection only if the page fetches data worth
  debugging.
- **Required states:** every widget independently renders loading (its own skeleton, not a
  page-wide spinner), empty (`EmptyState` or a lighter inline message), and error (inline
  retry affordance, never a silently blank card) — no dead/placeholder widgets that never
  resolve to real content.
- **Information hierarchy:** stat cards lead with the number (large, bold) and a short
  label (`text-sm text-muted-foreground`); status/trend indicators via `<Badge>` or a small
  delta indicator, never a hand-rolled colored span; grid spacing follows the 4px scale
  (`gap-4`/`gap-6`).
- **Interaction/flow:** every widget that summarizes an A3 entity links into that entity's
  Management page (`Link` styled `text-primary hover:underline`, or the whole card is
  clickable with a clear affordance) — no orphaned/dead widgets with no destination;
  refresh/retry actions use `toast.*` for feedback.
- **Responsive:** stat grid reflows `grid-cols-1` → `sm:grid-cols-2` → `lg:grid-cols-3/4`;
  widgets stack on mobile in priority order.
- **A11y:** widget loading regions `role="status"`; error regions `role="alert"`; clickable
  stat cards are real `<button>`/`<a>` elements (not `div onClick`) so they stay
  keyboard-reachable.

## A3 — List / Management (reference: `ClusterManagement.tsx`)

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
- **Documented deviations (`SuperAdminManagement`):** no `<Can>` gating — the route is
  `superAdminOnly` and super admins by definition bypass all permission checks, so a `<Can>`
  wrapper would always pass and add nothing (documented deviation from A3, not a finding); no
  filter `Sheet` — the only filterable field (`is_active`) is effectively always true for a
  super-admin grant, so `SearchInput` alone covers the toolbar and `activeFilterCount` stays
  `0` (documented deviation from A3, not a finding).
- **Documented deviations (`UserPlatformManagement`):** no primary `Add` action and no
  row-actions `DropdownMenu` — rows are derived one-for-one from `User` accounts, the page has
  no create route, and role assignment/removal lives on the row's detail page rather than
  inline (documented deviation from A3, not a finding).

## A4 — Detail / Edit (reference: `ClusterEdit.tsx` simple, `ReportTemplateEdit.tsx` tabbed)

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

## A5 — Config (small-dimension) (reference: `PrintTemplateMappingManagement`)
- **Anatomy:** shared `PageHeader` (title + subtitle + primary `Add`) → lighter toolbar: a
  `document_type`-style `Select` filter + an "Active only" checkbox (no `SearchInput`, no
  filter `Sheet`) → content grouped into cards by dimension (e.g. by document type), each
  group a `Card` listing its rows → `ConfirmDialog` for destructive actions → dev-only
  `DevDebugSheet`. Documented as an *intentional* A3 variant, not a gap.
- **Required states:** loading (skeleton, sized to the small dataset), `EmptyState` that
  distinguishes "no rows for this filter" vs "nothing configured yet", error banner
  `role="alert"`; edge case: a group (document type) with zero mapped rows still renders its
  header with an explicit "no templates mapped" line, never an empty/blank card.
- **Information hierarchy:** group headers (document type) are prominent
  (`text-sm font-semibold` or similar) with a row count; status (active/inactive) via
  `<Badge variant="success|secondary">`; row identity is a `Link` styled
  `text-primary hover:underline`; no numeric/meter clutter given the small dataset.
- **Interaction/flow:** filter changes (`document_type`, active-only) call the filter-based
  backend directly — **not** debounced/paginated like A3; row click → Edit (single-mode
  form, no read-only toggle, per the A4 variant used by `PrintTemplateMappingEdit`);
  `toast.*` on save/delete; permission gates via `<Can>`; **no CSV export** — the dataset is
  too small to warrant it (documented deviation from A3, not a finding).
- **Responsive:** groups stack single-column on mobile; toolbar (select + checkbox) wraps
  below `sm:`; card-grouped layout avoids horizontal scroll entirely (no wide table).
- **A11y:** the active-only control has a bound `<label>`; group headings use real heading
  elements (`<h2>`/`<h3>`) for screen-reader navigation; loading `role="status"`; error
  `role="alert"`.

## A6 — Composer / Authoring (reference: `NewsEdit`, `BroadcastCompose`)
- **Anatomy:** the A4 shell (header with back + title + Edit/read toggle where applicable,
  error display, `Card` metadata sections) plus a dedicated authoring surface — rich/
  Markdown body editor + image/attachment upload control; a Preview toggle or split-pane
  preview; sticky action bar for Save/Publish (offset matches sidebar, page `pb-20`) →
  `DevDebugSheet`.
- **Required states:** draft (unsaved edits guarded by `useUnsavedChanges`), dirty vs clean
  indicator, saving (button spinner + disabled), image/attachment upload in-progress and
  upload-error, publish vs save-as-draft as distinct actions where applicable, `doc_version`
  conflict handling identical to A4 (409 → `notifyVersionConflict()` + refetch).
- **Information hierarchy:** metadata fields (title, tags, dates) grouped above/beside the
  body in a titled section; status (draft/published) via
  `<Badge variant="success|secondary">`; the body content is the visual focus — the metadata
  card stays secondary and doesn't compete for width.
- **Interaction/flow:** `Cmd/Ctrl+S` saves the draft; `Esc` triggers the same
  unsaved-changes guard as other A4 pages; image upload shows inline progress and
  `toast.error` on failure; Preview renders through the same Markdown/rich renderer used at
  read-time (no drift between edit-preview and the live page); metadata fields validate on
  blur.
- **Responsive:** body editor and preview stack vertically on mobile, side-by-side (or
  tabbed) from `lg:` up; long-form content scrolls independently of the sticky action bar.
- **A11y:** editor toolbar buttons carry `aria-label`; upload progress `role="status"`;
  upload/save errors `role="alert"`; the preview pane sits in a sane keyboard tab order
  after the editor, never orphaned.

## A7 — Console / Operational (reference: `SqlWorkbench`, `TenantMigration`)
- **Anatomy:** shared `PageHeader` (never hand-rolled); `Layout` wrapper; standard `space-y-4 sm:space-y-6` rhythm; bespoke core (editor / results / streaming console) below.
- **Required states:** every async surface has idle / running / empty-result / error; long ops show progress and are cancellable where they block.
- **Information hierarchy:** clear regions (input vs output vs actions); status via `<Badge>`; semantic tokens only.
- **Interaction/flow:** dangerous ops (DDL/DML, drops) via `ConfirmDialog` + `<Can>` permission gate; `toast.*` feedback (never `alert`); keyboard shortcuts where relevant.
- **Responsive:** works mobile→desktop; panels reflow, no fixed-width overflow.
- **A11y:** icon buttons have `aria-label`; error `role="alert"`; loading `role="status"`.

## A8 — Reference / read-only (reference: `Changelog`, `PermissionCatalog`, `Profile`)
- **Anatomy:** shared `PageHeader` (title + subtitle, no primary destructive action) →
  single readable content column (no two-column form grid) — a list/timeline (Changelog), a
  searchable reference table or grouped list (PermissionCatalog), or a light single-mode
  account form (Profile, treated as A8/account); no `DevDebugSheet` requirement unless the
  page fetches raw API data worth inspecting.
- **Required states:** loading (skeleton matching the content shape — list-skeleton for
  Changelog/PermissionCatalog, form-skeleton for Profile), empty (`EmptyState`, e.g. "No
  entries yet"), error banner `role="alert"`; Profile additionally has a saving state
  (button spinner + disabled) since it's a light form.
- **Information hierarchy:** entries/rows use consistent meta styling
  (`text-[11px] leading-tight text-muted-foreground` for dates/authors, matching A3);
  status/category via `<Badge>` where applicable (e.g. permission scope, changelog entry
  type); the content column keeps a generous line-length (not full-bleed) for readability.
- **Interaction/flow:** Profile is a single-mode form — always editable, no read-only
  toggle, `Cmd/Ctrl+S` saves, `toast.*` feedback; Changelog/PermissionCatalog support
  in-page search/filter (client-side, given small/static datasets) without the full A3
  server-side toolbar; external links (e.g. docs) open in a new tab with
  `rel="noopener noreferrer"`.
- **Responsive:** single column at all breakpoints; the content column caps max-width for
  readability on large screens (no full-bleed text).
- **A11y:** timeline/list entries use semantic list markup where appropriate; loading
  `role="status"`; error `role="alert"`; Profile form inputs have bound labels like any A4
  form.

## Audit rubric

### Dimensions — score each 0–3

`3` = fully meets contract · `2` = minor gaps · `1` = major gaps · `0` = absent/ad-hoc.

| Code | Dimension | Checks |
|------|-----------|--------|
| **D1** | Structural consistency | Conforms to archetype anatomy; **reuses shared primitives** — if a shared component exists app-wide (e.g. `PageHeader`), not reusing it is a real gap even if the hand-rolled version looks fine. |
| **D2** | State completeness | loading / empty / error / success / edge all handled; empty-vs-**filter/search**-match distinguished; no blank panels or silent failures. |
| **D3** | Information hierarchy | 4px spacing grid, visual order, field grouping, **status via `<Badge>` (never hand-rolled colored spans)**, meta styling, no clutter. |
| **D4** | Flow smoothness | create→edit→save, unsaved guard, keyboard shortcuts, persisted state, `ConfirmDialog` on destructive, toasts, transitions. |

### Codified clarifications

1. **Findings-first.** The score is coarse (reskin lifted the floor); the **findings list is
   the deliverable**. Rank pages by (P0 count → P1 count → page usage), not by the 0–12 sum.
2. **Optional summary strips are neutral** — neither reward nor penalty.
3. **44px rule** — the *tappable hit area* governs, not the visual control's pixel size.
4. **Status rule** — the violation is a *hand-rolled colored span* for status; multiple
   `<Badge>`s are fine.
5. **Shell-reuse rule** — non-reuse of an existing, app-wide shared primitive = P1.
