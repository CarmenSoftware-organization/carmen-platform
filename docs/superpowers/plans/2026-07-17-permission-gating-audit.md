# Permission-Gating Audit & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the recurring "permission gap found only by human review" failure into "caught by CI". Give every page with mutating controls a **discriminating** permission test (one that FAILS if a gate is removed or mis-scoped), fix the one file that still masks `<Can>`, fix the CI flake that makes the suite non-deterministic, and settle two small hardening items — **while auditing each gate for real gaps as the test is written.**

**Architecture:** This is a security-test effort, findings-first. For each page, writing the discriminating test *is* the audit — enumerate its mutating controls, verify each gate's permission string exists and is correctly scoped, and confirm no path (button, row action, dialog, keyboard shortcut, deep link) reaches a mutation without the gate. **A test that has to be written around a missing/mis-scoped gate is a SECURITY FINDING to fix, not a test to weaken.** Tasks are ordered by risk (the masking file first, then the untested pages by gate count, then hardening).

**Tech Stack:** React 19 + TypeScript (Vite), Vitest (jsdom) + React Testing Library. Package manager: Bun.

**Branch:** off `main` @ `556639d` (contains merged W0 #42 + W1 #43 + W2 #44 + W3 #45).

## Why this effort exists (context — not boilerplate)

Across Waves 1–3, the "UX unification" effort kept turning up security bugs it wasn't looking for: a CSV formula-injection hole (W1); **five permission gaps including a P0** where a user without `cluster.update` could edit and save DB credentials (W2); and a **proven `Ctrl/Cmd+S` bypass** letting a zero-permission user send a broadcast (W3). Every one had survived for a long time **because the page tests mock `<Can>` to always render children — so no test in the repo could fail on a missing gate.** W2/W3 fixed the harness on the pages they touched; this effort finishes the job on the rest.

## The correct test harness — copy it, do not invent one

Read `src/pages/ClusterEdit.test.tsx` (its scope-aware mock + the comment explaining why) and `src/pages/UserEdit.test.tsx`. The pattern, non-negotiable:
- mock `AuthContext` with a **mutable** `hasPermission` (via `vi.hoisted`), reset in `beforeEach`;
- leave `<Can>` **REAL** — never `vi.mock('../components/Can')`, and never hardcode `hasPermission: () => true`;
- every negative test (gate hidden) is paired with a **discriminating positive control** (same query resolves when permission IS granted) so a typo'd selector can't make the negative pass vacuously;
- for **scoped** gates (`<Can permission="…" clusterId={…}>`), the mock must be **scope-aware**: `(perm, ctx) => perm === '…' && ctx?.clusterId === '<id>'`. A wholesale `() => true`/`() => false` cannot catch a dropped `clusterId` — that regression is the whole point.
Read `src/components/Can.tsx`, `src/context/AuthContext.tsx`, `src/utils/permissions.ts` (`checkPermission`) to match the **real** signatures.

## Global Constraints

- Frontend-only. No new libraries. Do **not** modify `src/components/ui/` primitives. No `any`.
- **Do not change page source except to fix a real gap the audit finds** — and when you do, it's a SECURITY FINDING: report it, say whether it's exploitable, and add the failing-first test that proves the fix.
- Verify every permission string against `src/utils/permissions.ts` / `src/App.tsx` — don't invent one. Watch for **a data condition wearing a permission's name** (`canAddBU={userClusters.length > 0}` read like a gate but wasn't — W2).
- The `Ctrl/Cmd+S`-bypass class was swept app-wide in W3 (21 `useGlobalShortcuts` sites; only BroadcastCompose had it). You need not re-sweep it — but where a page under test wires `onSave`, add a one-line regression assertion that the shortcut can't reach a mutation without permission.
- **Per-task gate:** `bun run test` green + `CI=true bun run build` clean. ⚠️ **The suite is non-deterministic until Task 1 lands** (see the flake below) — until then, if the ONLY failure is `NewsManagement.test.tsx > NewsManagement bulk delete > "opens the confirm dialog and keeps Delete disabled until the code matches"`, rerun it in isolation and say so.
- Source of truth for findings: create `.planning/design/audit/permission-scorecard.md` (Task 1 seeds it; every task appends its page's row).

## Scope & Deferrals (no silent cap)

**In scope:** discriminating permission tests for the 6 pages with mutating controls + no adequate test (`NewsManagement` — masked; `ApplicationManagement`, `BusinessUnitManagement`, `ReportTemplateManagement`, `RoleManagement`, `UserManagement` — no file; `SuperAdminManagement` — no file, super-admin-gated); de-masking `userEdit/UserAccessTree.test.tsx`; the CI flake; and two hardening items (decouple `canSend`; extract duplicated permission-string literals). Any real gate gap found gets fixed here.

**Deferred (product/authz decisions — NOT for this effort):**
- 🔒 **`DbConnectionView`'s "Reveal password" is gated on `cluster.read`, not `cluster.update`** — a read-authorization product decision.
- 🔒 **`broadcast.send` is checked UNSCOPED** — a cluster-scoped grantee reaches system-wide send modes; fixing it changes targeting behaviour.
Both stay in the code with their existing `TODO(RBAC)` markers; this effort only decouples `canSend`/`canSendSystem` so a future scoping fix doesn't silently block legitimate BU sends.

---

### Task 1: NewsManagement — de-mask, add discriminating gate tests, fix the flake

The highest-risk file: it **masks** `<Can>` (`hasPermission: () => true` at `:50,:169`) over **4 gates** (`news.update` `:432`, `news.delete` `:438`, `news.create` `:465`/`:590`), AND it is the source of the long-standing CI flake.

**Files:** Modify `src/pages/NewsManagement.test.tsx`; create `.planning/design/audit/permission-scorecard.md`.

- [ ] **Step 1: Audit the page's mutating controls** — read `src/pages/NewsManagement.tsx`; enumerate every control that mutates/persists (Add, Edit, Delete, bulk actions) and its gate + string + scope. Report the enumeration. If any mutation is reachable without a gate, that's a FINDING — fix it (failing test first) and note whether exploitable.
- [ ] **Step 2: De-mask** — replace both `hasPermission: () => true` mocks with the mutable `vi.hoisted` `AuthContext` mock (harness above), `<Can>` left real.
- [ ] **Step 3: Add discriminating gate tests** — for each of the 4 gates: a negative (permission absent → control absent) + a discriminating positive control. Keep the existing `() => false` selection test but strengthen it into this pattern.
- [ ] **Step 4: Prove discrimination** — temporarily delete one gate from `NewsManagement.tsx`; run the tests; confirm they FAIL; restore; confirm GREEN. **Report both outputs.**
- [ ] **Step 5: Fix the flake** — `NewsManagement bulk delete > "opens the confirm dialog and keeps Delete disabled until the code matches"` fails ~1 run in 3. Diagnose the timing/async issue in the type-to-confirm assertion (likely a missing `await`/`findBy`/`waitFor` around the code-match state transition) and fix it so it's deterministic. **Prove it: run the isolated test 5×; all must pass.** If you cannot make it deterministic, `it.skip` it with a `// FLAKY:` comment + a one-line reason rather than leaving CI non-deterministic — and say which you did.
- [ ] **Step 6: Seed the scorecard** — create `.planning/design/audit/permission-scorecard.md` with a header (what it is, how a row is verified) + NewsManagement's row: page, mutating controls, each gate's string/scope, gate-covered? (yes/discriminating), any finding.
- [ ] **Step 7: Gate + commit** — `bun run test` (now deterministic; if not, say so) + `CI=true bun run build`. Commit.

---

### Task 2: UserManagement — discriminating gate tests (5 gates, no test file)

**Files:** Create `src/pages/UserManagement.test.tsx`.

- [ ] **Step 1: Audit** — enumerate `src/pages/UserManagement.tsx`'s mutating controls and its 5 `<Can>` gates (verify strings in `permissions.ts`/`App.tsx`; note any `clusterId` scoping). Report the enumeration + any gap found (fix gaps failing-test-first).
- [ ] **Step 2: Write the test file** — the harness above; a negative + discriminating positive control per gate; scope-aware mock for any scoped gate. If the page wires `onSave`, add the shortcut-can't-mutate-without-permission assertion.
- [ ] **Step 3: Prove discrimination** — delete one gate (and, for a scoped gate, separately drop its `clusterId`); confirm the tests FAIL; restore; GREEN. Report outputs.
- [ ] **Step 4:** Append UserManagement's row to `permission-scorecard.md`.
- [ ] **Step 5:** Gate + commit.

---

### Task 3: BusinessUnitManagement — discriminating gate tests (4 gates, no test file)

**Files:** Create `src/pages/BusinessUnitManagement.test.tsx`.
Same 5 steps as Task 2, for `src/pages/BusinessUnitManagement.tsx`'s 4 gates. **Note:** BU permissions are modeled under `cluster.*` (W1 finding) — verify the actual strings rather than assuming `business_unit.*`.

- [ ] **Step 1: Audit** — enumerate mutating controls + 4 gates; verify strings; report + fix any gap.
- [ ] **Step 2: Test file** — harness; negative + positive control per gate; scope-aware where scoped.
- [ ] **Step 3: Prove discrimination** — delete a gate / drop a `clusterId`; FAIL → restore → GREEN; report outputs.
- [ ] **Step 4:** Append the scorecard row.
- [ ] **Step 5:** Gate + commit.

---

### Task 4: ReportTemplateManagement — discriminating gate tests (4 gates, no test file)

**Files:** Create `src/pages/ReportTemplateManagement.test.tsx`.
Same 5 steps as Task 2, for `src/pages/ReportTemplateManagement.tsx`'s 4 gates (`report_template.create/update/delete`).

- [ ] **Step 1: Audit** — enumerate + verify strings; report + fix any gap.
- [ ] **Step 2: Test file** — harness; negative + positive control per gate.
- [ ] **Step 3: Prove discrimination** — delete a gate; FAIL → restore → GREEN; report outputs.
- [ ] **Step 4:** Append the scorecard row.
- [ ] **Step 5:** Gate + commit.

---

### Task 5: RoleManagement — discriminating gate tests (4 gates, no test file)

**Files:** Create `src/pages/RoleManagement.test.tsx`.
Same 5 steps, for `src/pages/RoleManagement.tsx`'s 4 gates (`role.create/update/delete`). **Note:** this is the *platform* roles page (`/platform/roles`, `platform_role` service) — verify strings accordingly (W1 gotcha).

- [ ] **Step 1: Audit** — enumerate + verify strings; report + fix any gap.
- [ ] **Step 2: Test file** — harness; negative + positive control per gate.
- [ ] **Step 3: Prove discrimination** — delete a gate; FAIL → restore → GREEN; report outputs.
- [ ] **Step 4:** Append the scorecard row.
- [ ] **Step 5:** Gate + commit.

---

### Task 6: ApplicationManagement — discriminating gate tests (4 gates, no test file)

**Files:** Create `src/pages/ApplicationManagement.test.tsx`.
Same 5 steps, for `src/pages/ApplicationManagement.tsx`'s 4 gates (`application.create/update/delete`). **Note:** W1 added a `<Can>` on the empty-state Add CTA here — confirm it's covered.

- [ ] **Step 1: Audit** — enumerate + verify strings; report + fix any gap.
- [ ] **Step 2: Test file** — harness; negative + positive control per gate (including the empty-state Add gate).
- [ ] **Step 3: Prove discrimination** — delete a gate; FAIL → restore → GREEN; report outputs.
- [ ] **Step 4:** Append the scorecard row.
- [ ] **Step 5:** Gate + commit.

---

### Task 7: SuperAdminManagement — super-admin gating test (no test file)

`SuperAdminManagement` mutates (add/remove super admins) and wires `onSave`, but is gated at the **route** (`superAdminOnly`), and W2 documented that it intentionally has no per-control `<Can>` (super admins bypass all permission checks). So the test here proves the **route-level** protection, not `<Can>`.

**Files:** Create `src/pages/SuperAdminManagement.test.tsx`.

- [ ] **Step 1: Audit** — enumerate the add/remove mutating controls and confirm what actually protects each (route `superAdminOnly` via `PrivateRoute`, and/or `isSuperAdmin` from `AuthContext`). Read `src/components/PrivateRoute.tsx`. Report how a non-super-admin is blocked. **If a mutation is reachable by a non-super-admin (e.g. the page renders for them because the route guard is bypassable, or `⌘S` mutates), that's a FINDING.**
- [ ] **Step 2: Test** — with a mutable `AuthContext` mock, assert that a non-super-admin (`isSuperAdmin: false`) does not get an actionable add/remove path (control absent or disabled), and a super-admin does (discriminating control). If the page relies solely on the route guard, test the guard's behaviour for this page instead, and note in the scorecard that per-control protection is route-level by design.
- [ ] **Step 3:** Append the scorecard row (record the "route-level by design" deviation).
- [ ] **Step 4:** Gate + commit.

---

### Task 8: De-mask `userEdit/UserAccessTree.test.tsx` (the deferred landmine)

`src/pages/userEdit/UserAccessTree.test.tsx:12` hardcodes `hasPermission: () => true` over a real scoped gate. It's not a live hole (the gate is covered by `UserEdit.test.tsx`), but it's a landmine that would make a future permission test in this file vacuous.

**Files:** Modify `src/pages/userEdit/UserAccessTree.test.tsx`.

- [ ] **Step 1:** Replace the hardcoded mock with the mutable `vi.hoisted` `AuthContext` harness. Keep the file's existing structural tests (`groupAccessByCluster`) green.
- [ ] **Step 2:** If it's cheap and correct, add a discriminating scope-aware test for `UserAccessTree.tsx`'s own `cluster.update` gate at this level (in addition to `UserEdit.test.tsx`'s). If it would duplicate `UserEdit`'s coverage with no added value, say so and just de-mask.
- [ ] **Step 3:** Gate + commit.

---

### Task 9: Hardening — decouple `canSend`, extract permission-string constants

**Files:** Modify `src/pages/BroadcastCompose.tsx`; `src/utils/permissions.ts` (add constants); adopt the constants where a permission string is currently duplicated as two independent literals.

- [ ] **Step 1: Decouple `canSend`** — `BroadcastCompose.tsx:103-107` aliases `canSend = canSendSystem`. They mean different things ("may send at all" vs "may send system-wide"); when a future fix scopes `canSendSystem` per the existing `TODO(RBAC)`, `canSend` would silently inherit the scope and block legitimate BU sends. Give `canSend` its own `hasPermission('broadcast.send')` (unscoped, matching the button), independent of `canSendSystem`. Keep behaviour identical today; verify via `BroadcastCompose.test.tsx`.
- [ ] **Step 2: Extract permission constants** — add a `PERMISSIONS` constant map (or per-resource `as const` strings) to `src/utils/permissions.ts` so a permission like `broadcast.send` isn't a bare literal duplicated between `hasPermission('broadcast.send')` and `<Can permission="broadcast.send">`. **Adopt it only where a string is currently duplicated within a single file** (start with BroadcastCompose's `:103`/`:576`) — do NOT churn every call site; a mass rename is out of scope and risky. Keep the string values byte-identical.
- [ ] **Step 3:** Gate + commit.

---

## Exit check

- [ ] `bun run test` — **deterministic** now (Task 1 fixed/skipped the flake): run it 3×, all green.
- [ ] Corrected masking grep returns nothing live: `grep -rnE "vi\.mock.*[Cc]an['\"]|hasPermission: *\(\) *=> *true" src/` — every hit is a comment, a `<Can>`-free page, or documented in the scorecard.
- [ ] Every page with mutating controls now has a **discriminating** permission test — for at least one scoped gate per page, discrimination was *demonstrated* (delete the gate / drop `clusterId` ⇒ a test fails).
- [ ] `.planning/design/audit/permission-scorecard.md` covers every mutating page with its gates, coverage, and any finding.
- [ ] Any real gate gap found was fixed with a failing-first test, or (if a product decision) recorded in Scope & Deferrals — none dropped silently.
