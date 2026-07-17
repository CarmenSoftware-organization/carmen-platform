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

### RoleManagement (`src/pages/RoleManagement.tsx` / `src/pages/RoleManagement.test.tsx`)

No pre-existing test file (first coverage added this task). This is the **platform roles** page
(`/platform/roles`, backed by the `platform_role` service via `roleService` ->
`/api-system/platform/roles`) — **not** application roles (`/api-system/roles`); verified by
reading `roleService.ts` and the route registration in `App.tsx:255-278`.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Row action: Edit (opens `/platform/roles/:id/edit`) | `<Can>` at `:318` | `role.update` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Delete (opens confirm dialog → `roleService.delete`) | `<Can>` at `:327` | `role.delete` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Add Role" button | `<Can>` at `:368` | `role.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add Role" button | `<Can>` at `:502` | `role.create` | platform (unscoped) | **Yes — discriminating** | None |
| Header "Permission Catalog" button (navigates to `/platform/permissions`) | Ungated; route itself requires only `role.read` (`App.tsx:280-286`) | — | — | N/A — read-only navigation, no mutation | None |
| Header "Export" button | Client-side CSV of already-fetched, already-permitted data; no write | — | — | N/A, not a mutation (matches prior pages' precedent) | None |
| Name column link (row → `/platform/roles/:id/edit`) + summary-band "Broadest roles" links (same target) | Ungated `<Link>`s; route itself requires `role.update` (`App.tsx:271-278`) and `RoleEdit.tsx` has its own `<Can permission="role.update">` gate (`:335`) on the actual mutating controls | — | — | N/A — same accepted pattern as ClusterManagement's/BusinessUnitManagement's/ReportTemplateManagement's Name-column link | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only (`:95-97`), no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column, no bulk action bar (verified by grep: `selectionResetKey`/`clearSelection`/`enableRowSelection`/`bulk` all absent from the file) | — | — | N/A — not a consumer | None |

**Audit result: no ungated mutation found.** All 4 `<Can>` gates (3 distinct permission strings —
`role.update`, `role.delete`, `role.create`, the latter gating two separate DOM locations: header
+ empty-state) trace to real permission checks present in `DEV_MOCK_EFFECTIVE_PERMISSIONS.platform`
(`utils/permissions.ts:51`) and are mirrored by the route-level `PrivateRoute` guards
(`role.read` for the list, `role.create` for `/platform/roles/new`, `role.update` for
`/platform/roles/:id/edit` — `App.tsx:255-278`); every mutating path (row Edit, row Delete, both
Add Role entry points) was already reachable only through a gate before this task started. None
of the four gates pass a `clusterId` prop — `role.*` is platform-only (never appears per-cluster
in `permissions.ts`), matching the UserManagement/ReportTemplateManagement precedent rather than
the ClusterManagement/BusinessUnitManagement scoped pattern, so there is no scope-drop
discrimination to demonstrate here.

**Selection-reset (`data-table.tsx`) regression guard: not applicable.** `RoleManagement` does not
pass `selectionResetKey` to `<DataTable>`, does not set `enableRowSelection`, and has no
bulk-action bar — confirmed by grep (no matches for `selectionResetKey`, `clearSelection`,
`enableRowSelection`, or `bulk` in the file). It is not a consumer of the Task 1 `data-table.tsx`
fix, so no regression test was added.

**Test file:** `src/pages/RoleManagement.test.tsx` (new) — mutable `vi.hoisted` `AuthContext`
mock (`hasPermission`), `<Can>` left real throughout; `roleService` mocked (`getAll`, `getById`,
`create`, `update`, `delete`); localStorage stub + Radix pointer-capture/`scrollIntoView`
polyfills copied from `ClusterManagement.test.tsx` (this page also reads `localStorage` directly
on every render and uses a Radix `DropdownMenu` for row actions). `roleService.getAll` is mocked
with a `perpage`-aware implementation so the page's independent RBAC summary band
(`RolesAccessSummary`, which separately calls `getAll({ perpage: -1 })` on mount) always resolves
empty — this keeps the summary's "Broadest roles" panel from rendering a second node with the
same role name as the table row, which would otherwise make `findByText('Admin')` throw on an
unrelated duplicate. 8 tests: 4 for the row-action `DropdownMenu` (full-deny negative,
discriminating positive with both permissions, and two single-permission splits proving Edit/
Delete are gated independently), 4 for the two `role.create` Add Role locations (negative +
discriminating positive per location, header and empty-state).

Discrimination formally proved by deleting a gate: removed the entire
`<Can permission="role.delete">` wrapper from around the row Delete item (leaving the
`DropdownMenuItem` rendering unconditionally). 2 of 8 tests failed (`hides Edit and Delete without
role.update / role.delete`, `gates Edit on role.update alone — Delete stays hidden`) because the
now-unwrapped Delete item rendered regardless of `hasPermission`'s return value. Restored the
gate; `diff` against the pre-edit backup showed zero residual change; suite green again (8/8). See
task-5-report.md §3 for both raw command outputs.

### ApplicationManagement (`src/pages/ApplicationManagement.tsx` / `src/pages/ApplicationManagement.test.tsx`)

No pre-existing test file (first coverage added this task). Wave 1 had already added a `<Can>`
gate on the empty-state "Add Application" CTA (in addition to the 3 pre-existing gates), so this
page shipped with 4 gates and zero tests before this task.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Header "Add Application" button | `<Can>` at `:388` | `application.create` | platform (unscoped) | **Yes — discriminating** | None |
| Empty-state "Add Application" button (Wave 1 addition) | `<Can>` at `:500` | `application.create` | platform (unscoped) | **Yes — discriminating, exact-count (2) positive control** | None |
| Row action: Edit (opens `/applications/:id/edit`) | `<Can>` at `:358` | `application.update` | platform (unscoped) | **Yes — discriminating** | None |
| Row action: Delete (opens confirm dialog → `applicationService.delete`) | `<Can>` at `:364` | `application.delete` | platform (unscoped) | **Yes — discriminating** | None |
| App ID column "copy" icon button (`navigator.clipboard.writeText`) | Ungated | — | — | N/A — not a mutation; never calls `applicationService`, writes nothing to the backend | None |
| Header "Export" button | Client-side CSV of already-fetched, already-permitted data; no write | — | — | N/A, not a mutation (matches prior pages' precedent) | None |
| Name column link (row → `/applications/:id/edit`) | Ungated `<Link>`; route itself requires `application.update` (`App.tsx:111-118`) and `ApplicationEdit.tsx` gates its own save action | — | — | N/A — same accepted pattern as ClusterManagement's/RoleManagement's Name-column link | None |
| Status/Device filter Sheet, search | Read-only query refinement over data already permitted by the route (`application.read`) | — | — | N/A, not a mutation | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only (`:89-91`), no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column, no bulk action bar (verified by grep: `selectionResetKey`/`clearSelection`/`enableRowSelection`/`bulk` all absent from the file) | — | — | N/A — not a consumer | None |

**Audit result: no ungated mutation found.** All 4 `<Can>` gates (3 distinct permission strings —
`application.create`, `application.update`, `application.delete`, the first gating two separate
DOM locations: header + empty-state) trace to real permission checks present in
`DEV_MOCK_EFFECTIVE_PERMISSIONS.platform` (`utils/permissions.ts:48`) and are mirrored by the
route-level `PrivateRoute` guards (`application.read` for the list, `application.create` for
`/applications/new`, `application.update` for `/applications/:id/edit` — `App.tsx:96-118`); every
mutating path (row Edit, row Delete, both Add Application entry points) was already reachable
only through a gate before this task started. None of the four gates pass a `clusterId` prop —
`application.*` is platform-only (never appears per-cluster in `permissions.ts`), matching the
UserManagement/RoleManagement precedent rather than the ClusterManagement/BusinessUnitManagement
scoped pattern, so there is no scope-drop discrimination to demonstrate here.

**Selection-reset (`data-table.tsx`) regression guard: not applicable.** `ApplicationManagement`
does not pass `selectionResetKey` to `<DataTable>`, does not set `enableRowSelection`, and has no
bulk-action bar — confirmed by grep (no matches for `selectionResetKey`, `clearSelection`,
`enableRowSelection`, or `bulk` in the file). It is not a consumer of the Task 1 `data-table.tsx`
fix, so no regression test was added.

**Test file:** `src/pages/ApplicationManagement.test.tsx` (new) — mutable `vi.hoisted`
`AuthContext` mock (`hasPermission`), `<Can>` left real throughout; `applicationService` mocked
(`getAll`, `getById`, `create`, `update`, `delete`, `getApiCatalog`); localStorage stub + Radix
pointer-capture/`scrollIntoView` polyfills copied from `RoleManagement.test.tsx` (this page also
reads `localStorage` directly on every render and uses a Radix `DropdownMenu` for row actions).
`applicationService.getAll` is mocked with a `perpage`-aware implementation so the page's
independent registry summary band (`ApplicationRegistrySummary`, which separately calls
`getAll({ perpage: -1 })` on mount) always resolves empty. 8 tests: 4 for the row-action
`DropdownMenu` (full-deny negative, discriminating positive with both permissions, and two
single-permission splits proving Edit/Delete are gated independently), 4 for the two
`application.create` Add Application locations (negative + discriminating positive per location,
header and empty-state).

**Test-quality nit fixed for this page (per Task 6 brief):** Task 2/5's empty-state positive
control asserted `getAllByRole('button', {name:/add .../i}).length > 0` — satisfied by the header
button alone, so it would NOT catch a typo'd/mis-scoped empty-state gate (e.g. a permission string
of `applications.create` that never matches) that silently never rendered. This page's positive
control instead asserts an **exact count of 2** (`toHaveLength(2)`) with the list forced empty, so
both the header's and the empty-state's `application.create` gates must independently be satisfied
for the test to pass.

Discrimination formally proved two ways:

1. **Whole-page discrimination** (a gate deleted): removed the entire
   `<Can permission="application.update">` wrapper from around the row Edit item (leaving the
   `DropdownMenuItem` rendering unconditionally). 2 of 8 tests failed (`hides Edit and Delete
   without application.update / application.delete`, `gates Delete on application.delete alone —
   Edit stays hidden`) because the now-unwrapped Edit item rendered regardless of
   `hasPermission`'s return value. Restored the gate; `diff` against the pre-edit backup showed
   zero residual change; suite green again (8/8).
2. **Empty-state gate independently discriminated**: with the row-action and header gates left
   untouched, removed only the `<Can permission="application.create">` wrapper around the
   empty-state "Add Application" button (leaving that one `Button` rendering unconditionally). 1
   of 8 tests failed — exactly the targeted
   `hides the empty-state Add Application button without application.create` test (all header and
   row-action tests stayed green, proving the failure was scoped to the empty-state gate alone,
   not a side effect of a shared fixture). Restored the gate; `diff` showed zero residual change;
   suite green again (8/8). See task-6-report.md §3–4 for all four raw command outputs (delete/
   restore × row gate/empty-state gate).

### SuperAdminManagement (`src/pages/SuperAdminManagement.tsx` / `src/pages/SuperAdminManagement.test.tsx`)

No pre-existing test file (first coverage added this task). **Deviation from every prior row in
this table:** this page has **zero per-control `<Can>` gates and zero `isSuperAdmin` checks in
its own source** (verified by reading the file — no `useAuth` import at all). This is
**intentional, documented by Wave 2**: super admins bypass every permission check
(`checkPermission` short-circuits to `true` once `is_super_admin` is set —
`utils/permissions.ts:28`), so a `<Can>` gate on this page would always evaluate true for the
only audience that can ever legitimately reach it — a checked box with no real discrimination.
Protection is **entirely route-level**: `App.tsx:287-294` registers `/platform/super-admins` as
`<PrivateRoute requireSuperAdmin><SuperAdminManagement /></PrivateRoute>` — the only place this
component is ever rendered (verified by grep) — and `PrivateRoute` (`:60-62`) renders
`<AccessDenied>` instead of `children` whenever `requireSuperAdmin && !isSuperAdmin`, so the page
(and its unconditionally-wired mutating UI) never mounts for a non-super-admin. The sidebar nav
item is separately hidden for non-super-admins (`Layout.tsx:65,73`, `superAdminOnly: true`), but
that's UX, not the security boundary.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Header "Add Super Admin" button + dialog → `superAdminService.add` | **None in-component** — route-level `<PrivateRoute requireSuperAdmin>` only | — (`isSuperAdmin`) | route (platform) | **Yes — discriminating, at the route layer** | None — by design, see deviation note above |
| Empty-state "Add Super Admin" button (same dialog) | Same — route-level only | — (`isSuperAdmin`) | route (platform) | **Yes — discriminating, at the route layer** (same test covers both entry points, since neither has its own gate to distinguish) | None |
| Row action: Remove (`DropdownMenuItem` → `ConfirmDialog` → `superAdminService.remove`) | Same — route-level only | — (`isSuperAdmin`) | route (platform) | **Yes — discriminating, at the route layer** | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only (`:68-70`), no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column, no bulk action bar, no `selectionResetKey` (verified by grep) | — | — | N/A — not a consumer | None |

**Audit result: no ungated mutation found; route-level protection is sufficient and matches Wave
2's documented design.** All three mutating controls (Add dialog reachable from two entry
points, Remove) are wired unconditionally in the component itself, but the component only ever
mounts behind `<PrivateRoute requireSuperAdmin>` — there is no second path (no other route, no
other importer) that renders `SuperAdminManagement`. **This is the first row in the table where
"gate-covered" is proven one layer up (`PrivateRoute`) instead of inside the page**, because the
page has no internal branch on `isSuperAdmin`/`hasPermission` to assert a discriminating pair
against — it would render identically for a super-admin and a non-super-admin if it were ever
mounted directly.

**Selection-reset (`data-table.tsx`) regression guard: not applicable.** No `selectionResetKey`,
`enableRowSelection`, or `clearSelection` anywhere in the file (confirmed by grep) — not a
consumer of the Task 1 `data-table.tsx` fix.

**Test file:** `src/pages/SuperAdminManagement.test.tsx` (new) — mutable `vi.hoisted`
`AuthContext` mock (`isAuthenticated`, `loading`, `isSuperAdmin`, `hasPermission`); `Layout`
mocked (shell only), `superAdminService` and `userService` mocked; localStorage stub + Radix
pointer-capture/`scrollIntoView` polyfills copied from `UserManagement.test.tsx` (this page also
reads `localStorage` directly and uses a Radix `DropdownMenu`/`Select`/`Dialog`). Renders through
the **real** `<PrivateRoute requireSuperAdmin>` wrapper (not a bespoke stand-in), mirroring the
exact route registration in `App.tsx`. 3 tests: (1) negative — `isSuperAdmin: false` renders
`AccessDenied`, no "Super Admins" heading, no "Add Super Admin" button, and — critically —
`superAdminService.list`/`userService.getAll` are never called, proving the page never mounts
rather than just being visually covered; (2) positive — `isSuperAdmin: true` renders the page
heading and an actionable "Add Super Admin" button (discriminating control for the Add path);
(3) positive — a super-admin can open a row's actions menu and see "Remove" (discriminating
control for the second mutating control).

Discrimination formally proved by disabling the gate: changed
`if (requireSuperAdmin && !isSuperAdmin)` to `if (false && requireSuperAdmin && !isSuperAdmin)`
in `PrivateRoute.tsx`. The negative test failed (`findByText('Access Denied')` timed out — the
full `SuperAdminManagement` page rendered instead for a non-super-admin); the two positive tests
stayed green (already asserting the allowed state, so an always-allowing bypass doesn't disturb
them). Restored the original condition; `git diff --stat` on `PrivateRoute.tsx` showed no
changes; suite green again (3/3). See task-7-report.md for the raw command output.

### TenantMigrationManagement (`src/pages/TenantMigrationManagement.tsx` / `src/pages/TenantMigrationManagement.test.tsx`)

Added by the final-review fix round — this page was omitted from the original task sweep despite
being the single most destructive page in the app (it deploys/applies schema migrations directly
to tenant databases). Pre-existing test coverage (`disables all action buttons for a
non-super-admin`) already proved the UI-layer gate; this round adds the handler-level
defence-in-depth guard plus its own discriminating tests.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| Per-row "Apply" (opens confirm dialog → `tenantMigrationService.deployStream`) | UI: `disabled={!!disabledReason}` at `:376` where `disabledReason = !isSuperAdmin ? '...' : null` (`:95`); **handler-level: `if (!isSuperAdmin) return;`** added to `applyOne` this round (`:156`) | — (`isSuperAdmin`, not a permission string) | route (platform) | **Yes — discriminating, both layers** (see Finding) | **Fixed this round.** The disabled button already blocked a normal click (not a live hole — proven by the pre-existing "disables all action buttons" test), but `applyOne` itself had no guard, unlike `BroadcastCompose.handleSend`'s `if (!canSend) return;` funnel. Added the guard, and — because `applyOne`'s `useCallback` deps were `[checkOne]` (no `isSuperAdmin`) — also added `isSuperAdmin` to the dependency array; without that, the guard would have closed over a stale `isSuperAdmin` value captured at first render and could wrongly allow a deploy after a mid-session permission revocation. New discriminating pair proves the *handler's own* check, not just the disabled attribute: opens the confirm dialog while `isSuperAdmin: true` (a reachable state — the dialog's own Confirm button is never itself gated), then flips `isSuperAdmin` to `false` and forces a re-render before clicking Confirm, modelling a permission revoked mid-session between opening the dialog and confirming it. |
| Header "Deploy all" (opens confirm dialog → `tenantMigrationService.deployAllStream`) | UI: `disabled={!!disabledReason}` at `:418`; **handler-level: `if (!isSuperAdmin) return;`** added to `deployAll` this round (`:194`) | — (`isSuperAdmin`) | route (platform) | **Yes — discriminating, both layers** | **Fixed this round**, same pattern and same stale-closure fix (`deployAll`'s deps were `[]`, now `[isSuperAdmin]`) as the row above. |
| Per-row "Check" / header "Check all" (`tenantMigrationService.getStatus` — read-only, no mutation) | UI: `disabled={!!disabledReason}` only | — | — | N/A — not a mutation; left ungated at the handler level intentionally (nothing to protect) | None |
| `Ctrl/Cmd+S` global shortcut | N/A — page wires `useGlobalShortcuts({ onSearch })` only, no `onSave` | — | — | **N/A — no `onSave` wired, no shortcut-driven mutation path exists** | None |
| Row-selection / bulk actions | **Does not exist on this page** — no `enableRowSelection`, no checkbox column (verified by grep) | — | — | N/A — not a consumer | None |

**Deferred question, reconciled:** the `/tenant-migrations` route itself only requires
`cluster.read` (`App.tsx:144-149`) — someone with plain read access to clusters can *view* this
page. The actual mutating actions require `isSuperAdmin`, enforced in-component (both the
disabled buttons and, as of this round, the handler guards) rather than at the route. This is the
same "route is broad, component narrows further" shape as `BroadcastCompose` (route requires no
specific broadcast permission; the Send button and its handlers gate on `broadcast.send`) — not a
gap, since the narrower in-component check is what actually stands between a `cluster.read`-only
viewer and a mutating deploy.

**Test file:** `src/pages/TenantMigrationManagement.test.tsx` — 4 new tests added this round
under `handler-level super-admin guard (defence-in-depth)`: 2 for `applyOne` (negative: guard
holds when `isSuperAdmin` is revoked after the confirm dialog opens; positive: deploy proceeds
when `isSuperAdmin` stays true throughout) and the same pair for `deployAll`. All 7 pre-existing
tests in the file stayed green throughout. Discrimination formally proved by temporarily removing
both `if (!isSuperAdmin) return;` guards: both new negative tests failed (`expected "vi.fn()" to
not be called at all, but actually been called 1 times`) while all 9 other tests (including the
new positive controls) stayed green; guards restored, `git diff --stat` showed the intended
2-line-per-guard change only, suite green again (11/11).

### SqlWorkbench (`src/pages/sqlWorkbench/SqlWorkbench.tsx` / `src/pages/sqlWorkbench/SqlWorkbench.test.tsx`)

This is UX Unification Wave 4's Task 1, not a continuation of the original permission-gating
plan above, but uses the same harness and is logged in the same ledger since it closes a
security finding of the identical shape. **This page executes arbitrary SQL (incl. DDL/DML)
against live tenant databases** — the most destructive class of surface in this codebase,
alongside `TenantMigrationManagement`. A pre-existing test file (`SqlWorkbench.test.tsx`, 12
tests) already existed before this task — the brief's claim of "no test file exists" was stale.

**Route:** `/sql-workbench` requires only `sql_workbench.read` (`App.tsx:312-316`; nav item
`Layout.tsx:67` gates on the same string) — **a read-only user CAN reach this page.** This is the
load-bearing fact that makes the finding real: the page is not protected end-to-end by the route
alone, unlike e.g. `SuperAdminManagement`'s `requireSuperAdmin` route gate.

| Mutating control | Gate | Permission string | Scope | Gate-covered? | Finding |
|---|---|---|---|---|---|
| "Run" (`SqlEditor` toolbar button + Ctrl/⌘+Enter shortcut) → `sqlQueryService.executeSql` (any SQL, incl. destructive DDL/DML) | **Was ungated** — now `onRun={canManage ? handleRun : undefined}` at `SqlWorkbench.tsx:471` (this task's fix); `SqlEditor` itself already conditionally rendered the button via `{onRun && (<Button>...Run</Button>)}` (`SqlEditor.tsx:208`), so omitting the prop hides the button entirely and makes the Ctrl/⌘+Enter path a no-op (`runFromEditor` returns `false` when its `onRun` ref is `undefined`) | `sql_workbench.manage` | platform (unscoped) | **Yes — discriminating (fixed this task)** | **SECURITY FINDING — fixed.** Run had zero UI-permission gating; only the backend's own rejection stood between a `sql_workbench.read`-only user and executing arbitrary SQL (incl. `DROP`/`DELETE`/`UPDATE`/`ALTER`) against a tenant DB, while `ConnectionBar` simultaneously displayed a "read-only" badge next to the connected BU (`ConnectionBar.tsx` — badge text driven by the same `canManage` boolean) — i.e. the UI actively told the user they were read-only while Run remained fully live. Save/Drop (below) were already correctly gated on the same string; Run was the one surface missed. |
| Header "Save" button → `sqlQueryService.saveDdl` (persists a view/procedure/function) | Pre-existing JS conditional `canManage && (...)` at `SqlWorkbench.tsx:309` | `sql_workbench.manage` | platform (unscoped) | **Yes — discriminating** (pre-existing negative test; positive control added this task) | None — was already correctly gated |
| Header "Drop" button (loaded object only) → confirm dialog → `sqlQueryService.dropObject` | Pre-existing JS conditional `canManage && loadedObject && (...)` at `SqlWorkbench.tsx:293` | `sql_workbench.manage` | platform (unscoped) | **Yes — discriminating** (both negative and positive control added this task — page had zero Drop-gate tests before) | None — was already correctly gated |
| DB object tree click → `sqlQueryService.getDefinition` (loads a view/procedure/function definition into the editor, read-only) | Ungated | — | — | N/A — not a mutation; loads text into local state only | None |
| Table click → auto-fills `SELECT * FROM t LIMIT 100;` into the editor | Ungated | — | — | N/A — not a mutation, no `sqlQueryService` call at all until Run | None |
| BU switcher (`⌘B`/click) | Ungated | — | — | N/A — not a mutation; selects which tenant DB subsequent reads/writes target, itself gated on the route-level `sql_workbench.read` | None |

**SELECT-vs-DML decision, made honestly.** `src/utils/sqlValidator.ts`'s own top-of-file comment
states its `classifyStatements`/`validateSqlSafety` functions are "UI feedback only… nothing here
is a security gate and it is intentionally bypassable" — used solely to drive the pre-existing
"confirm before running a destructive statement" dialog (any user, regardless of permission,
still gets that confirm). Reusing that same classifier to let `sql_workbench.read` users run
SELECT while blocking DML/DDL would mean promoting a self-documented non-security parser into a
permission boundary — exactly the "client-side SQL parser that lies" the brief warned against
(it also doesn't classify `INSERT` as destructive at all, so it isn't even a complete DML
detector). Gated conservatively instead: **the entire Run executor requires
`sql_workbench.manage`**, matching exactly what Save/Drop already required and what the
`ConnectionBar` "read-only" badge already promised the user. Net effect: `sql_workbench.read`
alone now lets a user reach the page, browse the schema tree, view object definitions, and stage
SQL text in the editor — but not execute anything, including SELECT. This is a deliberate,
reported product trade-off, not an oversight.

**Test file:** `src/pages/sqlWorkbench/SqlWorkbench.test.tsx` — pre-existing `hasPermission =
vi.fn()` mock (not `vi.hoisted`, since this page has no `<Can>` usage at all, only a raw
`hasPermission('sql_workbench.manage')` boolean — verified by grep across
`src/pages/sqlWorkbench/*.tsx`), reset to `mockReturnValue(true)` in a (now module-scoped)
`beforeEach`; real `AuthContext`/`hasPermission` function exercised throughout, never hardcoded
to bypass. The `SqlEditor` mock (CodeMirror needs layout APIs jsdom lacks, so it's stubbed to a
textarea + Run button) was corrected to conditionally render the Run button only when `onRun` is
passed — mirroring the real component's `{onRun && (...)}` — so the test can assert the button's
**absence**, not just non-functionality. 6 new tests added under a `SqlWorkbench —
sql_workbench.manage gates (Run / Save / Drop)` describe block: negative + discriminating
positive for each of Run, Save, Drop (Save's negative already existed; its positive control and
both Drop tests were net-new). All 11 pre-existing tests stayed green throughout (17/17 total).

Discrimination formally proved by deleting the Run gate: changed
`onRun={canManage ? handleRun : undefined}` back to `onRun={handleRun}`. Exactly 1 of 17 tests
failed — `hides Run and blocks execution without sql_workbench.manage` (`expected document not to
contain element, found <button type="button">Run</button>`) — while the other 16, including the
new Run positive control and the pre-existing Run-behavior tests (destructive confirm,
multi-statement run, etc., which all run with `hasPermission` defaulted to `true`), stayed green.
Restored the gate; `diff` against the pre-edit backup showed zero residual change; suite green
again (17/17). See task-1-report.md §3 for both raw command outputs.

### UserPlatformManagement (`src/pages/UserPlatformManagement.tsx`)

Reviewed — no in-page mutation (nav-only `<Link>` at `:254` to
`/platform/user-platform/:id`); edit route gated separately. No `useAuth`/`<Can>` import, no
`*Service.create`/`update`/`delete` call anywhere in the file (verified by grep) — only
`userService.getAll` and `userRoleService.list`, both reads. No test file added; there is no
mutating control on this page to gate or discriminate.
