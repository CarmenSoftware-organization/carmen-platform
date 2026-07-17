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
