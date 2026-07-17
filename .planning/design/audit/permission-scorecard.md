# Permission-Gating Audit Scorecard

> Plan: `docs/superpowers/plans/2026-07-17-permission-gating-audit.md`
> Branch: `security/permission-gating-audit`

## What this is

A running ledger of frontend permission-gating coverage, one row per page with mutating
controls. This is **not** the UX-quality audit (`scorecard.md` in this same directory) — it
tracks a narrower, security-relevant question: *for every control on this page that mutates or
persists data, is there a `<Can>` (or equivalent) gate, and does an automated test prove the
gate actually does something?*

Seeded by Task 1 (`NewsManagement`); every subsequent task in the plan appends its own page's
row. Rows are never deleted — a later fix updates the row's status in place.

## How a row is verified ("gate-covered?" column)

A gate only counts as **covered** if there is a test that:
1. Sets `hasPermission` (via the mutable `vi.hoisted` `AuthContext` mock — see
   `src/pages/ClusterEdit.test.tsx` / `src/pages/UserEdit.test.tsx` for the harness) to **deny**
   the permission and asserts the control is **absent** (not just disabled-looking).
2. Is paired with a **discriminating positive control** — the same query, with the permission
   granted — that asserts the control **is** present. This is what makes the negative
   non-vacuous: a broken selector or an accidentally-always-true mock would fail the positive
   test too.
3. For scoped gates (`<Can permission="…" clusterId={…}>`), the positive control must be
   scope-aware (`(perm, ctx) => perm === '…' && ctx?.clusterId === '<id>'`) — a wholesale
   `() => true` cannot catch a dropped `clusterId`.

"Discriminating" in the table below means both halves (1) and (2) exist and were proven to
actually fail when the gate is deleted from the page source (Step 4 of each task — delete the
gate, confirm the paired tests go red, restore, confirm green).

`<Can>` itself is never mocked in these test files — mocking it out (or hardcoding
`hasPermission: () => true`) makes every permission assertion pass regardless of whether the
page's gate exists, which is exactly the defect this effort exists to close (see the plan's
"Why this effort exists" section — a CSV-injection hole, a P0 DB-credential-edit gap, and a
proven `Ctrl/Cmd+S` zero-permission broadcast-send bypass all survived past review because of
this exact masking pattern).

## Rows

### NewsManagement (`src/pages/NewsManagement.tsx` / `src/pages/NewsManagement.test.tsx`)

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Row action: Edit (opens `/news/:id/edit`) | `<Can>` at `:432` | `news.update` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Delete (opens confirm dialog → `newsService.delete`) | `<Can>` at `:438` | `news.delete` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Add News" button (list has rows) | `<Can>` at `:465` | `news.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add News" button | `<Can>` at `:590` | `news.create` | platform (unscoped) | **Yes — discriminating** | None |
| Bulk "Publish Selected" (`newsService.update` × N) | JS conditional `canUpdate &&` at `:604` | `news.update` (via `hasPermission('news.update')` at `:96`) | platform (unscoped) | **Yes — discriminating** (existing tests: "shows Publish and Archive but not Delete…") | None — same permission source as the `<Can>` gates, just expressed as a plain boolean rather than a `<Can>` wrapper; not a gap |
| Bulk "Archive Selected" (`newsService.update` × N) | JS conditional `canUpdate &&` at `:610` | `news.update` | platform (unscoped) | **Yes — discriminating** (existing tests: "shows Archive but not Delete…", "shows both Archive and Delete…") | None |
| Bulk "Delete Selected" (`newsService.delete` × N) | JS conditional `canDelete &&` at `:616` | `news.delete` (via `hasPermission('news.delete')` at `:95`) | platform (unscoped) | **Yes — discriminating** (existing tests: "hides selection entirely when the user lacks news.delete", plus the archive-block permission-split tests) | None |
| Row-selection checkboxes (prerequisite for all 3 bulk actions above) | `enableRowSelection={canSelect}`, `canSelect = canDelete \|\| canUpdate` | `news.delete` OR `news.update` | platform (unscoped) | **Yes** (covered indirectly by the bulk-action tests above — no path to a bulk mutation without first passing this gate) | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only, no `onSave` | — | — | **N/A — no `onSave` wired, so no shortcut-driven mutation path exists on this page** (verified by reading `NewsManagement.tsx:139-141`; the W3 sweep already confirmed only `BroadcastCompose` had this bypass) | None |

**Audit result: no ungated mutation found.** All 4 `<Can>` gates (2 distinct permission strings,
one of them — `news.create` — gating two separate DOM locations) and both bulk-action JS
conditionals trace back to `hasPermission('news.update')` / `hasPermission('news.delete')`
exactly as they should; every mutating path was already reachable only through a real
permission check before this task started. This task's work was closing a **test-masking**
gap (the harness couldn't have failed on a removed gate, not that a gate was missing) plus a
genuine **product bug** in the shared `DataTable` component (see below) that was making the
test suite non-deterministic.

**Non-permission finding (fixed as part of the flake fix, see Task 1 report):**
`src/components/ui/data-table.tsx`'s `selectionResetKey`-driven reset effect fired
unconditionally on every fresh mount of `DataTable` (not just on a genuine "result set changed"
event), because callers like `NewsManagement` start bumping that counter from their own mount —
often before `DataTable` itself has mounted (it's gated behind a loading/empty check). The
effect's `setRowSelection({})` is an unconditional overwrite, not a functional update, so it
could race and silently drop a user's very first checkbox selection if it fired after that
click's own state update had been queued. This is not a permission-gating bug, but it directly
caused the CI flake this task was required to fix, so it's recorded here for visibility. Fixed
with a `useRef` guard so the reset effect only fires on a genuine change relative to what that
`DataTable` instance has already seen (see `data-table.tsx` diff in the Task 1 report).

**Test file:** `src/pages/NewsManagement.test.tsx` — `AuthContext` mock converted from
hardcoded `hasPermission: () => true` (two call sites, `:50` and `:169` in the pre-task file)
to the mutable `vi.hoisted` harness; `<Can>` left real throughout. 8 new gate tests added (2 per
gate: negative + discriminating positive), covering the row-action `DropdownMenu` (`news.update`
/ `news.delete`) and the header + empty-state Add News button (`news.create` × 2 locations).

### UserManagement (`src/pages/UserManagement.tsx` / `src/pages/UserManagement.test.tsx`)

No pre-existing test file (first coverage added this task).

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Header "Add User" button | `<Can>` at `:627` | `user.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add User" button | `<Can>` at `:761` | `user.create` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Edit (opens `/users/:id/edit`) | `<Can>` at `:576` | `user.update` | platform (unscoped) | **Yes — discriminating** (also formally proved by deletion, see report) | None |
| Row action: Delete (opens confirm dialog → `userService.delete`) | `<Can>` at `:582` | `user.delete` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Hard Delete (confirm dialog → `userService.hardDelete`) | `<Can>` at `:591` | `user.delete` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Fetch Keycloak" button → `userService.fetchKeycloakUsers()` (`POST /api-system/fetch-user`, syncs/imports users) | **Was ungated** — now `<Can>` at `:617` (this task's fix) | `user.create` | platform (unscoped) | **Yes — discriminating (fixed this task)** | **SECURITY FINDING — fixed.** No `<Can>` gate existed. The `/users` route only requires `user.read` (App.tsx:154), so any user who could view the page could trigger a Keycloak sync/import regardless of holding `user.create`/`user.update`. Exploitable: yes, in principle (an unauthorized directory mutation reachable by a read-only role) — no evidence it was exploited, but it fits the exact "P0"-class pattern (mutation reachable without its gate) that motivated this whole effort. Fixed by wrapping in `<Can permission="user.create">`, matching the permission the adjacent Add User button already uses (both bring new user records into the platform; no dedicated "sync" permission exists in `permissions.ts`, so the closest existing string was reused rather than inventing one). Failing-test-first: the test failed against the pre-fix source, then passed after the one-line JSX fix (see task-2-report.md §3 for both outputs). |
| Bulk "Delete" (soft, selected rows) → `userService.delete` × N | JS conditional: bulk bar rendered only when `isSuperAdmin && selectedUsers.length > 0` (`:771`); selection itself gated by `enableRowSelection={isSuperAdmin}` (`:808`) | — (`isSuperAdmin`, not a permission string) | platform (`effectivePermissions.is_super_admin`) | **Yes — discriminating** | None — `checkPermission` short-circuits to `true` for every permission once `is_super_admin` is set (`utils/permissions.ts:28`), so gating on `isSuperAdmin` is *strictly more restrictive* than gating on `hasPermission('user.delete')` would be, never less. Same "JS conditional tracing to a real check" pattern Task 1 judged not-a-gap for NewsManagement's bulk actions. Product note (not a security gap): a non-super-admin who holds a granular `user.delete` role grant cannot reach bulk delete — that's a feature-availability decision, not an authz bypass. |
| Bulk "Hard Delete" (selected rows) → `userService.hardDelete` × N | Same `isSuperAdmin` conditional as bulk Delete | — (`isSuperAdmin`) | platform | **Yes — discriminating** | None — see bulk Delete row above |
| Row-selection checkboxes (prerequisite for both bulk actions) | `enableRowSelection={isSuperAdmin}` (`:808`), `selectionResetKey={selectionResetKey}` (`:811`) | — (`isSuperAdmin`) | platform | **Yes** (covered indirectly by the bulk-action tests; also directly asserted absent for a non-super-admin) | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only (`:117`), no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |

**Audit result: one ungated mutation found and fixed** (Fetch Keycloak, see row above). All 5
pre-existing `<Can>` gates were already sound (2 permission strings: `user.create` × 2 locations,
`user.update` × 1, `user.delete` × 2) and are now discriminating-tested; the bulk-action
`isSuperAdmin` conditionals trace to a real (and strictly stricter) authorization check, matching
the NewsManagement precedent for JS-conditional gates.

**Regression guard for the Task 1 `data-table.tsx` fix:** `UserManagement` is the primitive's only
other consumer of `selectionResetKey` besides `NewsManagement`. Added
`UserManagement — row selection resets when the result set changes (data-table.tsx regression
guard)`: selects a row (checkbox checked, "1 selected" bar visible), triggers a sort change (one
of the `paginate`-watching effect's dependencies alongside page/perpage/search/advance), and
asserts BOTH the parent's `selectedUsers` state cleared (bar gone) AND `DataTable`'s own internal
`rowSelection` cleared (the checkbox itself unchecked) — the latter is what would silently break
if `UserManagement` ever stopped wiring `selectionResetKey` into `<DataTable>` correctly.

**Test file:** `src/pages/UserManagement.test.tsx` (new) — mutable `vi.hoisted` `AuthContext`
mock (`hasPermission` + `isSuperAdmin`), `<Can>` left real throughout; localStorage stub +
Radix pointer-capture/scrollIntoView polyfills copied from `ClusterManagement.test.tsx` (this
page also reads `localStorage` directly on every render and uses a Radix `DropdownMenu`). 13
tests: 4 for the two `user.create` Add User locations, 4 for the `user.update`/`user.delete` row
actions (including two single-permission discrimination tests proving Edit vs. Delete/Hard Delete
are gated independently), 2 for the new Fetch Keycloak fix, 2 for the `isSuperAdmin` bulk-action
gate, 1 for the selection-reset regression guard. Discrimination formally proved by deleting the
`user.update` row gate: 2 tests failed (`hides Edit, Delete and Hard Delete…`, `gates Edit on
user.update alone…`), then passed again after restoring — see task-2-report.md §3 for the raw
output. None of this page's 5 `<Can>` gates are `clusterId`-scoped (verified: `user.*` only
appears in `DEV_MOCK_EFFECTIVE_PERMISSIONS.platform`, never per-cluster, and no `<Can>` call site
on this page passes a `clusterId` prop), so unlike ClusterEdit/ClusterManagement there is no
scope-drop discrimination to demonstrate here.

### BusinessUnitManagement (`src/pages/BusinessUnitManagement.tsx` / `src/pages/BusinessUnitManagement.test.tsx`)

No pre-existing test file (first coverage added this task). Confirms the brief's W1 finding: BU
permissions are modeled entirely under `cluster.*` — `business_unit.*` does not appear anywhere
in the codebase (verified by grep), and the `/business-units*` routes themselves are gated on
`cluster.read` / `cluster.create` / `cluster.update` (`App.tsx:120-141`), matching the page's own
`<Can>` gates.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Row action: Edit (opens `/business-units/:id/edit`) | `<Can>` at `:342` | `cluster.update` | **cluster-scoped** — `clusterId={row.original.cluster_id}` (the BU row's own cluster) | **Yes — discriminating** | None |
| Row action: Delete (confirm dialog → `businessUnitService.delete`) | `<Can>` at `:348` | `cluster.delete` | **cluster-scoped** — `clusterId={row.original.cluster_id}` | **Yes — discriminating** | None |
| Header "Add Business Unit" button | `<Can>` at `:372` | `cluster.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add Business Unit" button | `<Can>` at `:498` | `cluster.create` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Export" button | Client-side CSV of already-fetched, already-permitted data; no write | — | — | N/A, not a mutation (matches NewsManagement/UserManagement precedent) | None |
| "Show soft-deleted" filter checkbox, status filter buttons, search, sort, pagination | Read-only query params, no mutation | — | — | N/A | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only, no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** (verified by reading `BusinessUnitManagement.tsx:59-61`) | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column, no bulk action bar (verified by grep: `selectionResetKey`/`clearSelection`/`enableRowSelection` all absent from the file) | — | — | N/A — not a consumer | None |

**Audit result: no ungated mutation found.** All 4 `<Can>` gates (3 distinct permission strings —
`cluster.update`, `cluster.delete`, `cluster.create`, the latter gating two separate DOM
locations) trace to real, correctly-scoped permission checks; every mutating path (row Edit, row
Delete, both Add Business Unit entry points) was already reachable only through a gate before
this task started. The row Edit/Delete gates are notable as this plan's **first genuinely
cluster-scoped, per-row** gates on a *list* page (ClusterManagement's row gates are scoped to the
row's own id, which is also a cluster id — this page's rows are BUs whose `cluster_id` points at
a *different* entity than the row itself, making the scope-drop discrimination meaningfully
different to prove — see below).

**Selection-reset (`data-table.tsx`) regression guard: not applicable.** `BusinessUnitManagement`
does not pass `selectionResetKey` to `<DataTable>`, does not set `enableRowSelection`, and has no
bulk-action bar — confirmed by grep (no matches for `selectionResetKey`, `clearSelection`, or
`enableRowSelection` in the file). It is not a consumer of the Task 1 `data-table.tsx` fix, so no
regression test was added (unlike NewsManagement/UserManagement).

**Test file:** `src/pages/BusinessUnitManagement.test.tsx` (new) — mutable `vi.hoisted`
`AuthContext` mock (`hasPermission`), `<Can>` left real throughout; `businessUnitService` mocked
(`getAll`, `delete`); localStorage stub + Radix pointer-capture/`scrollIntoView` polyfills copied
from `ClusterManagement.test.tsx` (this page also reads `localStorage` directly on every render
and uses a Radix `DropdownMenu` for row actions). Two-row fixture (`bu1` in cluster `c1`, `bu2` in
cluster `c2`) so the scoped gates can be proven per-row, not just present/absent. 8 tests: 4 for
the row-action `DropdownMenu` (full-deny negative, scope-matched discriminating positive, a
scope-leak negative proving a `c1` grant does not apply to a `c2` row, and a single-permission
split proving Edit/Delete are gated independently), 4 for the two `cluster.create` Add Business
Unit locations (negative + discriminating positive per location).

Discrimination formally proved two ways (both required by the brief: "delete a gate" and "drop a
clusterId"):
1. **Gate deletion** — removed the entire `<Can permission="cluster.update" clusterId={...}>`
   wrapper from around the row Edit item. 2 tests failed (`hides both row actions without
   cluster.update / cluster.delete`, `does not leak a c1-scoped grant into a business unit in
   another cluster`) because the now-unwrapped Edit item rendered unconditionally. Restored;
   `git diff` showed zero residual change; suite green again (8/8).
2. **`clusterId` drop** — kept the `<Can permission="cluster.delete">` wrapper but removed its
   `clusterId={row.original.cluster_id}` prop. 1 test failed (`shows both row actions when scoped
   to this exact cluster (discriminating control)`) because `Can` now calls
   `hasPermission('cluster.delete', undefined)`, and the scope-aware mock
   (`ctx?.clusterId === 'c1'`) evaluates false for every row once `ctx` is `undefined` — Delete
   disappeared even for the `c1` row that should have shown it. Restored; `git diff` showed zero
   residual change; suite green again (8/8).

See task-3-report.md §3 for both raw command outputs.

### ReportTemplateManagement (`src/pages/ReportTemplateManagement.tsx` / `src/pages/ReportTemplateManagement.test.tsx`)

No pre-existing test file (first coverage added this task).

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Row action: Edit (opens `/report-templates/:id/edit`) | `<Can>` at `:306` | `report_template.update` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Delete (opens confirm dialog → `reportTemplateService.delete`) | `<Can>` at `:312` | `report_template.delete` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Add Template" button | `<Can>` at `:336` | `report_template.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add Template" button | `<Can>` at `:471` | `report_template.create` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Export" button | Client-side CSV of already-fetched, already-permitted data; no write | — | — | N/A, not a mutation (matches NewsManagement/UserManagement/BusinessUnitManagement precedent) | None |
| Name column link (row → `/report-templates/:id/edit`) | Ungated `<Link>`; route itself requires `report_template.update` (`App.tsx:194`) and `ReportTemplateEdit.tsx` has its own `<Can permission="report_template.update">` gate (`:390`) on the actual mutating controls | — | — | N/A — same accepted pattern as ClusterManagement's/BusinessUnitManagement's Name-column link | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only (`:81-83`), no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column, no bulk action bar (verified by grep: `selectionResetKey`/`clearSelection`/`enableRowSelection` all absent from the file) | — | — | N/A — not a consumer | None |

**Audit result: no ungated mutation found.** All 4 `<Can>` gates (3 distinct permission strings —
`report_template.update`, `report_template.delete`, `report_template.create`, the latter gating
two separate DOM locations: header + empty-state) trace to real permission checks present in
`DEV_MOCK_EFFECTIVE_PERMISSIONS.platform` (`utils/permissions.ts:46`); every mutating path (row
Edit, row Delete, both Add Template entry points) was already reachable only through a gate
before this task started. None of the four gates pass a `clusterId` prop — `report_template.*`
is platform-only (never appears per-cluster), matching the UserManagement precedent rather than
the ClusterManagement/BusinessUnitManagement scoped pattern, so there is no scope-drop
discrimination to demonstrate here.

**Selection-reset (`data-table.tsx`) regression guard: not applicable.** `ReportTemplateManagement`
does not pass `selectionResetKey` to `<DataTable>`, does not set `enableRowSelection`, and has no
bulk-action bar — confirmed by grep (no matches for `selectionResetKey`, `clearSelection`, or
`enableRowSelection` in the file). It is not a consumer of the Task 1 `data-table.tsx` fix, so no
regression test was added.

**Test file:** `src/pages/ReportTemplateManagement.test.tsx` (new) — mutable `vi.hoisted`
`AuthContext` mock (`hasPermission`), `<Can>` left real throughout; `reportTemplateService` mocked
(`getAll`, `getById`, `create`, `update`, `delete`, `listDbObjects`); localStorage stub + Radix
pointer-capture/`scrollIntoView` polyfills copied from `ClusterManagement.test.tsx` (this page
also reads `localStorage` directly on every render and uses a Radix `DropdownMenu` for row
actions). 8 tests: 4 for the row-action `DropdownMenu` (full-deny negative, discriminating
positive with both permissions, and two single-permission splits proving Edit/Delete are gated
independently), 4 for the two `report_template.create` Add Template locations (negative +
discriminating positive per location, header and empty-state).

Discrimination formally proved by deleting a gate: removed the entire
`<Can permission="report_template.delete">` wrapper from around the row Delete item (leaving the
`DropdownMenuItem` rendering unconditionally). 2 of 8 tests failed (`hides Edit and Delete
without report_template.update / report_template.delete`, `gates Edit on report_template.update
alone — Delete stays hidden`) because the now-unwrapped Delete item rendered regardless of
`hasPermission`'s return value. Restored the gate; `diff` against the pre-edit backup showed zero
residual change; suite green again (8/8). See task-4-report.md §3 for both raw command outputs.
