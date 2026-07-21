# Frontend Defense-in-Depth for Authz (DB Password + Broadcast) — Implementation Plan

> **For agentic workers:** execute task-by-task with a fresh subagent + review per task. Steps use `- [ ]`.

**Goal:** Align the frontend with the server-side authz just added in `carmen-turborepo-backend-v2` PR #239 — make the DB-password field write-only with a guarded on-demand reveal, and reflect that broadcast sends are now server-enforced. This is DEFENSE-IN-DEPTH; the real security boundary is the backend PR.

**Architecture:** React 19 + TS + Vite. The backend now (a) redacts `db_connection.password` from the BU detail response, (b) preserves the stored password when an update omits it, (c) exposes a guarded `GET /api-system/business-units/:id/reveal-db-connection` (returns the plaintext only to `cluster.update` holders), and (d) enforces `broadcast.send` on both broadcast endpoints (coarsely). The frontend must stop assuming the password is in the payload, add an on-demand reveal, and surface the backend's authz honestly.

**Tech Stack:** React 19, TypeScript, Vitest + RTL, axios (`src/services/api.ts`), `<Can>` gating.

**Grounding (READ FIRST):** `/Users/samutpra/GitHub/carmensoftware-organize/carmen-platform/.superpowers/sdd/authz-grounding.md` — the exact FE files + current behavior (§Issue 1 components at DbConnectionView.tsx/DatabaseConnectionSection.tsx; §Issue 2 BroadcastCompose gating). Backend contract: `.superpowers/sdd/authz-backend-grounding.md`.

## Global Constraints

- Frontend-only. No new libraries. No `any`. Do NOT modify `src/components/ui/` primitives.
- **The password is no longer in the BU detail response** (backend redacts). Do NOT assume `formData.db_connection.password` has a value on load. The edit field is write-only (blank default); the backend preserves the stored password when the update omits/blanks it.
- The reveal endpoint returns a SECRET — gate its UI on `cluster.update` via `<Can>`; call it ON DEMAND (a button), never auto-fetch on mount. Surface its errors via `parseApiError` + `toast.error`.
- Service calls: `/api-system/...` base, `keysToSnake`/`keysToCamel` per the repo pattern; unwrap `response.data.data || response.data`.
- Catch blocks: `parseApiError(err)` + `toast.error` — never a raw axios message.
- Tests: co-located `*.test.tsx`, explicit `vitest` imports (no globals), **discriminating** permission tests (mutable AuthContext mock, real `<Can>`, prove by removing the gate → a test fails), assert behavior/roles, deterministic. Run `bun run test` + `CI=true bun run build`.

---

## File Structure

- `src/services/businessUnitService.ts` — Task 1 (add `revealDbPassword`).
- `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx` — Task 1 (write-only hint + reveal-current action gated on cluster.update).
- `src/pages/BusinessUnitEdit.tsx` — Task 1 (only send password when non-blank; thread reveal props).
- `src/components/DbConnectionView.tsx` — Task 1 (read-only password shows hidden/unavailable; no reveal for non-cluster.update).
- `src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx` (+ maybe BusinessUnitEdit.test.tsx) — Task 1.
- `src/pages/BroadcastCompose.tsx` — Task 2 (comment update + honest 403 handling).
- `src/pages/BroadcastCompose.test.tsx` — Task 2.

---

### Task 1: DB password — write-only field + guarded on-demand reveal

**Files:** (see File Structure above)

**Grounding:** `.superpowers/sdd/authz-grounding.md` §Issue 1. Read the REAL components first — `DatabaseConnectionSection.tsx` (edit-mode password `<Input>` + Eye toggle, no permission check), `DbConnectionView.tsx` (read-only masked view with local reveal toggle), `BusinessUnitEdit.tsx` (how `formData.db_connection` is loaded + sent on save), `businessUnitService.ts` (getById/update pattern). The backend gateway route is `GET /api-system/business-units/:business_unit_id/reveal-db-connection` returning `{ ...db_connection incl password }` (guarded by `cluster.update` server-side, fail-closed).

- [ ] **Step 1: Add the service method**

In `businessUnitService.ts`, add `revealDbPassword(id: string)` (or `revealDbConnection`) → `api.get(\`/api-system/business-units/${id}/reveal-db-connection\`)`, unwrap + `keysToCamel`, return the db_connection object (incl. password). Match the file's existing method shape.

- [ ] **Step 2: Write the failing tests**

In `DatabaseConnectionSection.test.tsx` (and/or a new test), with a mutable AuthContext mock + real `<Can>`:
- The password input renders write-only: a "leave blank to keep unchanged" hint is present (and the input starts empty even when the BU loads without a password).
- A "Reveal current password" control renders ONLY when the user has `cluster.update` (discriminating: without it, the control is absent). Clicking it calls `businessUnitService.revealDbPassword` and shows the returned plaintext.
Run — watch fail.

- [ ] **Step 3: Implement write-only + reveal in the edit section**

In `DatabaseConnectionSection.tsx`: keep the write-only password `<Input>` (blank default), add a small hint "Leave blank to keep the current password." Add a "Reveal current password" action wrapped in `<Can permission="cluster.update">` (needs the BU `id` — thread it from `BusinessUnitEdit` via the section's props bundle) that calls `revealDbPassword(id)` on click and displays the fetched plaintext read-only (do NOT prefill the write-only input with it). Handle the fetch error via `parseApiError` + `toast.error`. Never auto-fetch on mount.

- [ ] **Step 4: Save only sends a changed password**

In `BusinessUnitEdit.tsx`'s save path: only include `db_connection.password` in the update payload when the user entered a non-blank value; otherwise omit it (the backend preserves the stored password). Verify the current save shape and adjust minimally. (The backend preserves-on-blank regardless, so this is belt-and-suspenders + avoids sending an empty string.)

- [ ] **Step 5: Read-only view reflects the redaction**

In `DbConnectionView.tsx`: since the plaintext password no longer arrives, the password field should render as hidden/unavailable (e.g. `••••••••` with no working reveal, or "hidden") for read-only viewers — do NOT show a reveal toggle that reveals an empty value. (A `cluster.read`-only viewer has no `cluster.update`, so no reveal path — correct.)

- [ ] **Step 6: Run tests — verify pass; full gate**

Run: `bun run test` then `CI=true bun run build`
Expected: green + clean. The reveal-gate test must discriminate (remove the `<Can>` → it fails).

- [ ] **Step 7: Commit**

```bash
git add src/services/businessUnitService.ts src/pages/businessUnitEdit/sections/DatabaseConnectionSection.tsx src/pages/BusinessUnitEdit.tsx src/components/DbConnectionView.tsx src/pages/businessUnitEdit/sections/DatabaseConnectionSection.test.tsx
git commit -m "feat(business-unit): write-only db password + guarded on-demand reveal (cluster.update)"
```

---

### Task 2: Broadcast — reflect server-side enforcement (honest, no fake scoping)

**Files:**
- Modify: `src/pages/BroadcastCompose.tsx`
- Modify: `src/pages/BroadcastCompose.test.tsx`

**Grounding:** `.superpowers/sdd/authz-grounding.md` §Issue 2. The FE already gates `canSend`/`canSendSystem`/`<Can>` on `broadcast.send` (unscoped/coarse). The backend PR #239 now ENFORCES `broadcast.send` on both broadcast endpoints — but ALSO coarsely (platform OR any-cluster; per-cluster scoping is deferred backend-side). So the FE's coarse gate now MATCHES the backend; do NOT fake fine per-cluster scoping the backend can't enforce.

- [ ] **Step 1: Write the failing test**

In `BroadcastCompose.test.tsx`: assert the send handler surfaces a backend authz error honestly — mock `broadcastService.sendSystem` to reject with a 403-shaped error (`{ response: { data: { error: { message: 'Missing platform permission: broadcast.send' } } } }`), trigger a send, assert a `toast.error` (or inline) shows the parsed message, NOT a raw axios string. Run — watch fail if the handler doesn't parse it.

- [ ] **Step 2: Honest error handling**

In `BroadcastCompose.tsx`'s send handler catch, ensure `parseApiError(err)` + `toast.error(...)` (match how other pages surface backend errors). Do not show a raw axios message.

- [ ] **Step 3: Update the stale TODO(RBAC) comments**

Update the two `TODO(RBAC)` comments (`~:102-103`, `~:577-578`) to record: the backend now ENFORCES `broadcast.send` server-side (PR #239) as the real boundary; the FE keeps the coarse `broadcast.send` gate to match; fine per-cluster scoping (a cluster-scoped grantee reaching system-wide modes) remains DEFERRED pending backend cluster-scope-resolution infra (`bu_code → cluster_id` + a scoped check) — do NOT fake it client-side since the backend can't enforce it. Keep the gate as-is.

- [ ] **Step 4: Run tests — verify pass; full gate**

Run: `bun run test` then `CI=true bun run build`
Expected: green + clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BroadcastCompose.tsx src/pages/BroadcastCompose.test.tsx
git commit -m "fix(broadcast): honest 403 handling + note server-side broadcast.send enforcement"
```

---

## Scope & Deferrals

- **Deferred (needs backend infra, not faked):** fine per-cluster scoping of `broadcast.send` on the FE (system-wide requires platform-only grant; bu-mode scoped to the selected BU's cluster). The backend cannot enforce this yet (coarse `has()`), so faking it client-side would be theater. Keep the coarse gate matching the backend.
- **Deferred UX:** DB password is now view-only-on-demand for `cluster.update` holders and never shown to `cluster.read`-only viewers (correct, secure). Admins can no longer "see the current password" inline in read-only mode — by design (the write-only + guarded-reveal model the user chose).

## Self-Review

- Coverage: Issue 1 = Task 1 (write-only + reveal + read-only redaction reflection); Issue 2 = Task 2 (honest error + accurate comments).
- The reveal gate test discriminates (remove `<Can permission="cluster.update">` → a test fails) — the effort's standard.
- No fake scoping on either side; the coarse FE gate matches the coarse backend enforcement, deferral documented.
- No `any`, no `ui/` primitive change, no new library.
