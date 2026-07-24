# Report Form Groups — grouped config page for form templates

**Date:** 2026-07-24
**Scope:** Frontend feature — 1 new page + 1 new card component + 1 shared constant
module + service helper; small edits to `App.tsx`, `Layout.tsx`,
`reportTemplateService.ts`, and `ReportTemplateEdit.tsx`.
**Page:** new route `/report-form-groups`, nav label **"Form Groups"** (group
`Content`).

## Problem

Report templates of `template_type === 'form'` are constrained by a business rule
the flat `/report-templates` list surfaces poorly: **each `report_group` may have at
most one live default form template** (`is_default`), enforced by a DB partial unique
index — *not* the application (see `ReportTemplateEdit.tsx` submit payload and
`reportTemplateService.ts` `ReportTemplate.is_default` comment).

Today, changing which template is the default for a group means visiting the Edit
page of the old default, unsetting it, saving, then visiting the new one and setting
it — a clumsy two-page dance, and there is no single place to see "which template is
default for each report group."

**Goal:** a configuration page that groups form templates by `report_group`, shows
the default per group at a glance, and lets an admin switch the default for a group
in one confirmed action — plus convenience actions (open in the Edit page, add a form
template pre-scoped to the group, toggle a template active/inactive).

This is an **overview + set-default-per-group** page, *not* full inline CRUD and *not*
a rule-13 Management page. It follows the small-dimension **configuration-page
pattern** documented in `CLAUDE.md` (the removed Print Template Mapping page): card
groups, no server-side DataTable, no CSV export, no filter Sheet.

## Chosen behavior

### Route, nav, permissions

- Route `/report-form-groups`, guarded by `report_template.read`.
- Nav item under the `Content` group: `{ path: '/report-form-groups', label: 'Form
  Groups', icon: LayoutGrid, permission: 'report_template.read', group: 'Content' }`
  in `Layout.tsx` `allNavItems`.
- Lazy-loaded in `App.tsx` like the other pages.

### Group roster (which groups render)

- The 12 fixed codes render **always, in this order**, even when empty:
  `PR, PO, GRN, SR, CN, SI, SO, IA, PC, SC, RFP, EOP`.
- Any **legacy** `report_group` value present in the data but *not* in the fixed 12
  is appended after the fixed groups, sorted A→Z.
- Groups are labelled by **code only** (no human-readable label map — the whole app
  shows the bare code; confirmed with user).

### Data

- One fetch on mount:
  `reportTemplateService.getAll({ perpage: -1, advance: JSON.stringify({ where: {
  template_type: 'form' } }) })`.
  - `perpage: -1` = "all rows" (precedent: the removed Print Template Mapping page).
    **Verify in the plan that the backend honours `-1`**; if not, fall back to a large
    fixed `perpage` (e.g. `1000`) — form-template counts are small.
  - Unwrap `response.data.data ?? response.data` per the service convention.
- Group **client-side** with a `useMemo`: fixed 12 (in constant order) + legacy
  (A→Z). Within a group, sort **default first, then by `name`** (case-insensitive).
- Re-fetch after every successful write (set-default, toggle-active) to resync
  `is_default` / `is_active` / `doc_version`.

### Page layout & states

- **Header** (`PageHeader`): title "Form Groups", subtitle, actions slot =
  `+ New Form Template` button → navigates to `/report-templates/new` with form
  pre-fill state (see *Add*). Gated by `report_template.create` (`<Can>`).
- **Toolbar** (single Card row above the groups):
  - Search `<Input>` — **client-side** filter; matches a group **code** *or* a
    template **name** (case-insensitive). Matching narrows the templates shown inside
    each group; a group whose code matches shows all its templates. Purely local — no
    debounce, no server round-trip.
  - `Active only` checkbox — when on, hide inactive templates (a group may then render
    empty → its empty state).
- **Group cards** (one `<GroupCard>` per group):
  - Header: `<Badge variant="outline">{CODE}</Badge>` + count badge
    (`{n} templates`) + `+ Add` button (gated `report_template.create`).
  - Rows (one per template): leading **radio** (default selector) · template `name`
    · `<Badge success|secondary>` Active/Inactive · `<Badge default|outline>`
    Standard/Custom · `Edit ›` button (link) · `⋯` menu (Activate/Deactivate).
- **States** (per the Loading States Decision Table, adapted for cards):
  - Initial load → skeleton cards.
  - Group with **no templates** (after filters) → in-card `EmptyState`
    ("No form templates") + `+ Add`.
  - Group with templates but **no default** → inline warning row
    ("⚠ No default set — pick one"); all radios unselected.
  - Fetch error → `FetchErrorState` with retry.
- **Dev debug sheet** (`process.env.NODE_ENV === 'development'`) exposing
  `rawResponse`, per convention.

### Set default (core interaction)

Radio-select + confirm (confirmed with user). For group `G` whose current default is
`D` (may be none) and a newly chosen active template `N`:

1. Selecting a different radio opens a `ConfirmDialog`:
   title `Set default form template`, description
   `Set "{N.name}" as the default for {CODE}?` + (when `D` exists)
   ` Replaces "{D.name}".`
2. On confirm, orchestrate **unset-then-set** (order is load-bearing — never let two
   defaults exist at once, which would trip the DB unique index):
   1. If `D` exists and `D.id !== N.id`:
      `update(D.id, { is_default: false, doc_version: D.doc_version })`.
   2. `update(N.id, { is_default: true, doc_version: N.doc_version })`.
   3. On full success → `toast.success` + re-fetch.
3. Encapsulate steps in a service helper
   `reportTemplateService.setGroupDefault({ current, target })` (current may be
   `null`) so the sequence is unit-testable in isolation.
4. Error handling:
   - `isVersionConflict(err)` → `notifyVersionConflict()` + re-fetch.
   - otherwise → `toast.error(parseApiError(err).message)` + re-fetch (resync to
     truth, since step 1 may have landed while step 2 failed → group momentarily has
     no default, which the refetch + "No default set" warning makes visible and
     retryable).
- `doc_version` is threaded per `CLAUDE.md` rule 17 (send only when the loaded record
  carried one). No page-level `formData`; the token lives on each fetched template
  row.

### Actions & permissions

| Action | Mechanism | Gate |
|---|---|---|
| View page | route | `report_template.read` |
| Set default | radio → confirm → `setGroupDefault` (unset→set) | `report_template.update` (no perm ⇒ radios disabled) |
| Toggle active/inactive | `update(id, { is_active, doc_version })` + re-fetch | `report_template.update` |
| Edit › | `navigate('/report-templates/{id}/edit')` | — (Edit page enforces its own perm) |
| + Add (card header & page header) | `navigate('/report-templates/new', { state })` pre-filling `template_type: 'form'` + `report_group: CODE` (page-header Add omits the group) | `report_template.create` |

### Edge cases (explicit rules)

- **Inactive template cannot be the default:** its radio is `disabled` with a tooltip
  ("Activate first"). Keeps the invariant "default is active" and sidesteps the
  `is_active`-scoped partial index.
- **Cannot deactivate the current default:** the `⋯` Deactivate item is disabled for
  the default row, tooltip "Set another default first."
- **No-default group:** only the set step runs (no unset), so a single `update` sets
  the first default.
- **Partial failure of the swap** (unset ok, set fails): handled by the re-fetch +
  "No default set" warning + retry (see Set default §4). Unset-first guarantees the DB
  never sees two simultaneous defaults.

### Add pre-fill wiring (`ReportTemplateEdit.tsx`)

- The Add buttons pass `navigate('/report-templates/new', { state: { template_type:
  'form', report_group: CODE } })`.
- `ReportTemplateEdit` reads `useLocation().state` on the **new** path only
  (`isNew`) and seeds `initialFormData` with those values (falling back to the
  existing defaults when state is absent — direct visits to `/report-templates/new`
  are unchanged). This is the only behavioural change to the Edit page; its normal
  flows are untouched.

## Files

- 🆕 `src/pages/ReportFormGroupManagement.tsx` — orchestrator: fetch, group `useMemo`,
  toolbar state, confirm-dialog state, write handlers, debug sheet.
- 🆕 `src/pages/reportFormGroups/GroupCard.tsx` — presentational card for one group:
  radios, rows, badges, Edit/Add/⋯ actions. Receives the group's templates + callbacks
  + a `canWrite`/`canCreate` bundle.
- 🆕 `src/constants/reportGroups.ts` — **move** `FORM_REPORT_GROUPS` out of
  `ReportTemplateEdit.tsx` into a shared module; both pages import it (single source
  of truth for the 12 codes).
- ✏️ `src/services/reportTemplateService.ts` — add `setGroupDefault({ current, target
  })` helper (orchestrates unset→set, forwards `doc_version`).
- ✏️ `src/pages/ReportTemplateEdit.tsx` — import `FORM_REPORT_GROUPS` from the new
  module; read `location.state` to pre-fill on the new path.
- ✏️ `src/App.tsx` — lazy import + route `/report-form-groups`
  (`requiredPermission="report_template.read"`).
- ✏️ `src/components/Layout.tsx` — nav item "Form Groups" in the `Content` group.

## Testing (intended coverage — written only if/when requested)

- **Unit** (`reportGroups.ts`, `setGroupDefault`, group-assembly helper): the roster
  = fixed-12 + legacy ordering; `setGroupDefault` issues unset-then-set in order,
  skips the unset when `current` is null, and no-ops when `current.id === target.id`.
- **Component/page** (`ReportFormGroupManagement.test.tsx`): mock `Layout`/`Can` +
  `reportTemplateService`, real `MemoryRouter`; assert grouping, empty/no-default
  states, radio-confirm flow calls the write pair, inactive radios disabled, default
  row's Deactivate disabled, permission gating.

Per the repo's plan-execution rule, tests are **not** written during build unless the
user asks in that turn; static checks (`bun run build` / type-check) still run.

## Out of scope

- No backend changes; no dedicated "group default" endpoint (verified none exists).
- No inline XML/source editing (that stays in `ReportTemplateEdit`).
- No CSV export, server-side DataTable, or filter Sheet (config-page pattern).
- No "clear default" action — a group is meant to always have a default once set;
  switching is the only mutation (confirmed with user).
- No human-readable group labels (codes only).

## Open questions / to verify in the plan

1. Backend honours `perpage: -1` for `/api-system/report-templates`? Confirm against
   swagger; else use a large fixed `perpage`.
2. Confirm the DB partial unique index is scoped to `(report_group)` among *live*
   (`is_active` AND `is_default`) rows, so unset-then-set is sufficient and inactive
   templates never collide — informs whether the "inactive can't be default" guard is
   strictly required or just UX polish.
