# UX Unification — Wave 4 (Console / Operational — A7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 2 Console/Operational (A7) pages — `SqlWorkbench` and `TenantMigrationManagement` — up to the A7 contract: align the SHELL (PageHeader, `<Badge>` status, spacing, a11y) while keeping the bespoke core; close a real permission finding on the DDL/DML executor; and resolve the two "cancel a long op" gaps honestly (build it only if the backend can actually cancel — otherwise document, don't ship a lying button).

**Architecture:** A7 pages are legitimately bespoke at their core (SQL editor / streaming deploy console). Per the A7 contract (`.planning/design/system/page-patterns.md` → `## A7`), only the **shell + states + safety + tokens** must match the app. Findings-first: the security finding (SqlWorkbench Run gating) is Task 1. The two "cancel" tasks require **reading the actual backend** before writing any Cancel UI.

**Tech Stack:** React 19 + TypeScript (Vite), CodeMirror 6 (SqlWorkbench editor), Vitest (jsdom) + RTL, shadcn/ui + Tailwind. Package manager: Bun.

**Branch:** off `main` @ `0cfd17a` (contains W0–W3 #42–#45 + the permission audit #46).

## Global Constraints

- Frontend-only unless a finding is genuinely a backend gap (then STOP + document, don't ship a UI that lies). No new libraries. Do **not** modify `src/components/ui/` primitives. No `any`.
- **A7 keeps its bespoke core** — do NOT force the SQL editor / deploy console into a table/form pattern. Align only shell/states/safety/tokens.
- **Status via `<Badge>`** — never a hand-rolled colored span. Error regions `role="alert"`, loading/progress regions `role="status"`/`role="progressbar"` + `aria-live`. Never `alert()` — `toast.*`.
- Dangerous ops (DDL/DML, drops, deploys) via `ConfirmDialog` + a **verified** `<Can>` permission gate.
- **Per-task gate:** `bun run test` green (deterministic now) + `CI=true bun run build` clean.
- Source of truth: A7 contract in `.planning/design/system/page-patterns.md`; findings in `.planning/design/audit/scorecard.md`.

## Lessons carried from prior waves + the permission audit — requirements

1. **An audit score is evidence, not proof — and so is the contract.** Re-check each page against `## A7`; report anything the scorecard missed. Three contract lines were already found wrong this effort.
2. 🔒 **Assume permission gates are missing until you've checked, and use the audit's harness.** The audit gave every mutating page a **discriminating** permission test (mutable `AuthContext` mock, REAL `<Can>`, positive control, scope-aware for `clusterId`; prove it by deleting a gate → a test fails). SqlWorkbench (which executes DDL/DML) has **no test file** and a live "Run not gated" finding — Task 1. Verify permission strings in `src/utils/permissions.ts` (`sql_workbench.manage` is known real). Watch for a **data condition wearing a permission's name**.
3. **Don't ship a button that lies.** Wave 3 refused to build a "remove saved image" button because the backend couldn't express it; the permission audit refused to weaken a test. For each "Cancel" here, **read the actual backend** (`../carmen-turborepo-backend-v2` on disk) to determine whether aborting the client stream/request genuinely cancels the server-side op. If Cancel would only stop the client listening while an **irreversible** deploy continues server-side, that is a lying button — DON'T build it; document the backend gap + follow-up.
4. **Never hardcode a derived count** — and check whether a table uses `DataTable` (auto `#` column ⇒ `+1`) or a plain `<table>` (no `+1`) before deriving.
5. **Never silently drop a gap** → "Scope & Deferrals" with file:line. (The task report is gitignored scratch and will be lost — deferrals go in the plan or a committed doc.)
6. **`validateField` cannot express required-ness**; **hit-slop overlays can overlap on dense layouts** (prove geometry or use box-growth). Reuse `src/lib/hitSlop.ts`, `src/components/FetchErrorState.tsx`, `src/components/ListEmptyState.tsx` — don't rebuild.

## Scope & Deferrals (no silent cap)

**Wave 4 fixes:** both A7 pages' P1s + the mechanical P2s, and the SqlWorkbench Run-permission finding. The two "cancel" gaps are resolved as **build-if-possible-else-document**.

**Deferred (carried forward — product/authz/backend decisions, NOT this wave):**
- 🔒 `DbConnectionView`'s "Reveal password" gated on `cluster.read`, not `cluster.update` — read-authz product decision.
- 🔒 `broadcast.send` checked unscoped — targeting-behaviour product decision.
- Broader `PERMISSIONS`-constant adoption; `formatDateTime` util extraction; CLAUDE.md's stale "Form Field Pattern".
- Anything a "cancel" task finds the backend can't support (recorded there with a backend follow-up).
- **Task 3 — SqlWorkbench "true cancel" needs a backend endpoint (no true cancel shipped).** Traced the Run path: `sqlQueryService.executeSql` (frontend) → `ConfigSqlQueryController.execute` → `ConfigSqlQueryService.execute` (gateway, `apps/backend-gateway/src/config/config_sql-query/config_sql-query.controller.ts:97-106` and `config_sql-query.service.ts:31-65`) → `businessService.send('business.sql-query-execute', …)` over the custom HTTP RPC transport (`packages/nest-http-transport/src/http-client.proxy.ts`) → `SqlQueryController.execute` → `SqlQueryService.execute` (`apps/micro-business/src/sql-query/sql-query.service.ts:90-150`), which runs the statements inside `prisma.$transaction(...)` with `SET LOCAL statement_timeout = '30s'`. The gateway controller does `await this.service.execute(...)` and only responds afterward — it never listens for `req.on('close')`/client-disconnect, so aborting the browser's request cannot reach the gateway→microservice call at all; the microservice's Postgres transaction has no cancellation hook either. **Aborting the client HTTP request only stops the browser from waiting — the query keeps running server-side until it finishes or hits its own `statement_timeout`/transaction timeout.** Follow-up needed for a real cancel: (1) gateway `execute()` must watch `req` for disconnect and unsubscribe/abort the microservice call (the HTTP RPC transport already supports this — `HttpClientProxy.publish()`, same file, returns a teardown that calls `controller.abort()` on unsubscribe, it's just never wired to client disconnect here); (2) the microservice must actually kill the in-flight query on abort (e.g. run it on a dedicated connection and issue `pg_cancel_backend`/`pg_terminate_backend`, or accept a cancel token Prisma can honor) — today aborting the HTTP call to the microservice would only drop the response stream, not stop the already-dispatched `$transaction`. Shipped instead: `AbortController` wired to abort the request on `SqlWorkbench` unmount only (prevents a leaked request / stale state update after navigating away); no user-facing "Cancel" button, since one would lie about stopping the DB query. See `src/services/sqlQueryService.ts` (`executeSql`) and `src/pages/sqlWorkbench/SqlWorkbench.tsx` (`runSql`, `runAbortControllerRef`).

---

### Task 1: SqlWorkbench — gate DDL/DML execution + discriminating permission test 🔒

**The security finding.** `SqlEditor.tsx:208-223` renders the Run/execute button to read-only users; **DML/DDL via Run is not UI-permission-gated (only Save/Drop are), relying on backend rejection.** This page executes arbitrary SQL against tenant DBs.

**Files:** `src/pages/sqlWorkbench/**` (`SqlWorkbench.tsx`, `SqlEditor.tsx`, and wherever Run/execute is wired); create `src/pages/sqlWorkbench/SqlWorkbench.test.tsx` (no test file exists).

- [ ] **Step 1: Audit the intended permission model FIRST.** Read `SqlWorkbench.tsx` + `SqlEditor.tsx` + `src/utils/permissions.ts` + `App.tsx`'s route guard for this page. Determine: what does `sql_workbench.read` vs `sql_workbench.manage` mean here? Is read-only SELECT meant to be allowed while **DDL/DML execute** requires `sql_workbench.manage`? What exactly does Run do — does it run any SQL (incl. destructive), or is there a separate "dangerous" path? **Report the model + how Save/Drop are gated today** before changing anything. If the finding is NOT actually a gap (e.g. the route already requires `manage`, so a read-only user can't reach the page at all), say so with evidence and make the task a test-only regression guard.
- [ ] **Step 2: If Run is genuinely reachable by a user without execute permission** (or executes destructive SQL without the gate Save/Drop have), gate it: wrap/guard the Run action on the correct string (`sql_workbench.manage` if that's execute; verify). If SELECT-only should stay allowed for read users but DDL/DML shouldn't, gate by the operation, not the whole button — and be honest about how you distinguish them (don't invent a client-side SQL parser that lies; if the client can't reliably tell SELECT from DML, gate conservatively and say so). **Write the failing test FIRST.**
- [ ] **Step 3: Discriminating permission test** — `SqlWorkbench.test.tsx` with the audit harness (mutable `AuthContext` mock, REAL `<Can>`/`hasPermission`, positive control). Cover the Run gate AND the existing Save/Drop gates. **Prove discrimination:** remove the Run gate → a test fails; restore → green. Report both outputs.
- [ ] **Step 4:** Append a `SqlWorkbench` row to `.planning/design/audit/permission-scorecard.md` (its gates, the finding + fix, coverage).
- [ ] **Step 5:** Gate + commit.

---

### Task 2: SqlWorkbench — A7 shell alignment

**Files:** `src/pages/sqlWorkbench/**` (`SqlWorkbench.tsx`, `ConnectionBar.tsx`, `BuSwitcher.tsx`, `DbObjectTree.tsx`, `SqlEditor.tsx`).

- [ ] **Step 1: Re-audit against `## A7`** (Lesson 1); report anything the scorecard missed. Keep the bespoke core (editor/results/tree) — align only the shell.
- [ ] **Step 2: Shared `PageHeader`** — replace the hand-rolled header (Database icon + `text-lg font-semibold` + inline action buttons, `SqlWorkbench.tsx:282-320`) with the shared `PageHeader` (title + subtitle + actions slot for the existing buttons), so the title size/structure matches every other page.
- [ ] **Step 3: `<Badge>` status** — replace the raw colored `<span>`s with `<Badge variant=…>`: read/write vs read-only (`ConnectionBar.tsx:64-68`), "connected" (`BuSwitcher.tsx:230-234`), PROC/FN (`DbObjectTree.tsx:244-248`). Map to the existing variants; keep semantic tokens only.
- [ ] **Step 4: Standard spacing** — replace ad-hoc `pb-4`/repeated `mt-4` (`SqlWorkbench.tsx:280,322,386,395`) with the app-standard `space-y-4 sm:space-y-6` rhythm, without breaking the panel layout.
- [ ] **Step 5: "Format SQL" no longer swallows errors** — `SqlEditor.tsx:188-190` has `catch { /* ignore */ }`, so malformed SQL makes the button silently do nothing. Surface a `toast.error` (or inline hint) on format failure. (Lesson: no silent catch.)
- [ ] **Step 6:** Gate + commit.

---

### Task 3: SqlWorkbench — cancel a running query (build-if-possible-else-document)

`SqlWorkbench.tsx:140-153` — a long query only disables the Run button; there's no abort control.

- [x] **Step 1: Investigate the backend + the execution path FIRST.** Read how Run executes (the service call / fetch) and whether the query endpoint supports cancellation — read `../carmen-turborepo-backend-v2` on disk. Does aborting the client request actually cancel the server-side query, or just stop the client waiting (leaving the query running on the DB)? **Report what Cancel would really do.** — Traced gateway `ConfigSqlQueryController.execute` → `ConfigSqlQueryService.execute` (`await`s to completion, no client-disconnect wiring) → HTTP RPC transport → microservice `SqlQueryService.execute` (`prisma.$transaction`, no cancellation hook). Verdict: abort would only stop the browser waiting; the DB query keeps running until it completes or hits its own `statement_timeout`/transaction timeout. See Scope & Deferrals for file:line evidence.
- [x] **Step 2: Decide honestly.** If the client can genuinely cancel (e.g. an abortable request that the backend honors), build it: an `AbortController`, a Cancel button shown only while running (`role`/`aria-label`), and a "cancelled" state. If it can only stop the client from waiting while the query keeps running server-side, **do NOT ship a "Cancel" that lies** — instead ensure the request is aborted on unmount (avoid leaks), show honest "still running" feedback, and record the true-cancel gap + backend follow-up in Scope & Deferrals. State which you did and why. — Took the second path: no Cancel button shipped. Added `AbortController` wired to abort `executeSql`'s request only on `SqlWorkbench` unmount (`runAbortControllerRef`), preventing a leaked request/stale state update after navigating away. Existing "Running query…" `role="status"` feedback in `ResultPanel` is unchanged (already honest — disables Run, no fake cancel affordance). Backend follow-up recorded in Scope & Deferrals above.
- [x] **Step 3:** Gate + commit.

---

### Task 4: TenantMigrationManagement — A7 shell / states / a11y

**Files:** `src/pages/TenantMigrationManagement.tsx`, `src/pages/tenantMigration/DeployConsole.tsx`. (Its permission side — defence-in-depth `isSuperAdmin` guards on `applyOne`/`deployAll` — was already done in the permission audit #46; do NOT redo it, but keep it green.)

- [ ] **Step 1: Re-audit against `## A7`** (Lesson 1); report scorecard misses.
- [ ] **Step 2: `<Badge>` status** — the status column's hand-rolled colored dot + text span (`bg-success`/`bg-warning`/`bg-destructive` keyed by status, `:305-317`) → `<Badge variant=…>`, mirroring the sibling `src/components/TenantMigrationCard.tsx:131-132` which already does this for the same status. Reuse its variant mapping so the two stay consistent.
- [ ] **Step 3: Progress a11y** — the batch progress bar (`DeployConsole.tsx:30-32`) and per-row "Applying N/total" (`TenantMigrationManagement.tsx:318-323`) get `role="progressbar"` + `aria-valuenow/valuemin/valuemax` (or `role="status"` + `aria-live` for the text), mirroring `TenantMigrationCard.tsx:174-181` which already implements this for the identical feature.
- [ ] **Step 4: Per-row error `role="alert"`** — `rs.errorMsg` row-level error (`:324`) is a plain `<div>`; add `role="alert"` (the page-level banner at `:447` already has it).
- [ ] **Step 5: Skeleton count** — `TableSkeleton columns={5}` at `~:461` (deferred from W2): **verify the real rendered column count** and whether this table is a `DataTable` (auto `#` ⇒ `+1`) or a plain `<table>` (no `+1`) — derive it, don't hardcode (Lesson 4).
- [ ] **Step 6:** Gate (keep the audit's `TenantMigrationManagement.test.tsx` green) + commit.

---

### Task 5: TenantMigrationManagement — cancel an in-flight deploy (build-if-possible-else-document)

`tenantMigrationService._streamDeploy` opens a `fetch()` NDJSON stream with **no `AbortController`**; neither the per-row Apply nor `DeployConsole` exposes Cancel. The op is described to the user as **irreversible ("cannot be undone")**.

**Files:** `src/services/tenantMigrationService.ts`, `src/pages/tenantMigration/DeployConsole.tsx`, `src/pages/TenantMigrationManagement.tsx`.

- [ ] **Step 1: Investigate the backend FIRST (this one is high-stakes — the deploy is irreversible).** Read `../carmen-turborepo-backend-v2` for what `_streamDeploy`'s endpoint does on client abort: does aborting the NDJSON `fetch()` actually **stop the server-side migration deploy**, or does the deploy continue to completion server-side while the client just stops listening? **Report exactly what abort does.**
- [ ] **Step 2: Decide honestly.**
  - If aborting genuinely cancels the server-side deploy (or the deploy is safely resumable/idempotent and stopping mid-stream is defined behaviour): add an `AbortController` to `_streamDeploy`, a Cancel action in `DeployConsole`/per-row (shown only while deploying, `aria-label`), and a "cancelled" state.
  - **If abort only stops the client listening while an irreversible migration keeps deploying server-side: do NOT ship a "Cancel" button** — that would tell the user they stopped an irreversible op they didn't. Instead: wire the `AbortController` so the stream is aborted on unmount/navigation (prevent leaks + a hung reader), keep showing honest progress, and record in Scope & Deferrals that true cancel needs a backend cancel/rollback endpoint (with the follow-up). **State which path you took and the backend evidence.**
- [ ] **Step 3:** Gate + commit.

---

## Wave 4 exit check

- [ ] `bun run test` green (deterministic) · `CI=true bun run build` clean.
- [ ] SqlWorkbench has a discriminating permission test; its Run/DDL-DML gating finding is fixed or shown not-a-gap with evidence.
- [ ] Both A7 pages: status via `<Badge>`, progress/error a11y roles present, spacing/PageHeader aligned — bespoke cores untouched.
- [ ] Each "cancel" task either shipped a real cancel (backend-verified) or documented why it can't (backend follow-up in Scope & Deferrals) — **no lying Cancel button**.
- [ ] `scorecard.md` updated with the W4 deltas; deferrals carried forward, none dropped.
