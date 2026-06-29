# Clear List Filters on Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every successful login, wipe all persisted per-page list view-state (search, filters, sort, page, perpage) from `localStorage` so each list page opens at its defaults.

**Architecture:** A new `clearListViewState()` util prefix-sweeps `localStorage`, removing only keys that match the known view-state prefixes (plus one exact key). `AuthContext.login()` calls it once after the authorized session is persisted. Auth keys and the sidebar preference don't match the prefixes, so they survive.

**Tech Stack:** React 18 + TypeScript (strict), Vite, browser `localStorage`.

## Global Constraints

- Clear ONLY on a **successful, authorized** login — call sits after the access-gate denial path returns, after the session is persisted.
- **Preserve** `token`, `user`, `loginResponse`, `effectivePermissions`, and `sidebar-collapsed` (none match the view-state prefixes).
- View-state prefixes to clear (verbatim): `search_`, `filters_`, `status_filters_`, `filter_`, `page_`, `sort_`, `perpage_`, `devicefilter_`. Exact key to clear: `report_template_probe_bu`.
- Both `filter_` AND `filters_` are required (`'filters_clusters'.startsWith('filter_') === false`).
- The sweep must never make `login()` throw (wrap in `try/catch`).
- Do NOT call the sweep from the session-restore/init effect — only from `login()`.
- No new libraries.

## Testing Approach (read first)

This repo has **no unit-test runner** (vitest/jest deferred — do not add one). The util uses the browser `localStorage` global, so a Node test is not in scope. Verification:

1. `npx tsc --noEmit` → zero errors.
2. `bun run build` (eslint runs via vite-plugin-eslint) → success. Use `npm run build` if `bun` is missing.
3. Manual browser check (deferred to controller/user): set search + filter + page/sort/perpage on a list page → log out → log back in → that page is back to defaults; sidebar collapse state unchanged.

## File Structure

- `src/utils/clearListViewState.ts` — **create.** Single exported function `clearListViewState(): void` that prefix-sweeps `localStorage`. One responsibility; no imports.
- `src/context/AuthContext.tsx` — **modify.** Import the util and call it once inside `login()` after the session is persisted.

---

### Task 1: clearListViewState util + wire into login()

**Files:**
- Create: `src/utils/clearListViewState.ts`
- Modify: `src/context/AuthContext.tsx` (add import near the other imports; add one call inside `login()` immediately after `setLoginResponse(loginData);`)

**Interfaces:**
- Consumes: nothing (uses the global `localStorage`).
- Produces: `export function clearListViewState(): void` — removes all list view-state keys from `localStorage`; preserves auth keys + `sidebar-collapsed`; never throws.

- [ ] **Step 1: Create the util**

Create `src/utils/clearListViewState.ts` with exactly:

```ts
// Per-entity list view-state persisted by Management pages (search box, filter
// sheet, status/deleted toggles, current page, sort, rows-per-page). Auth keys
// (token/user/loginResponse/effectivePermissions) and UI prefs (sidebar-collapsed)
// do NOT match these prefixes, so they are preserved.
//
// `filter_` and `filters_` are both required: 'filters_clusters'.startsWith('filter_')
// is false (char 7 is 's', not '_'), so the singular prefix would miss the plural keys.
const VIEW_STATE_PREFIXES = [
  'search_',
  'filters_',
  'status_filters_',
  'filter_',
  'page_',
  'sort_',
  'perpage_',
  'devicefilter_',
];

// View-state keys that don't follow the prefix convention.
const VIEW_STATE_EXACT_KEYS = ['report_template_probe_bu'];

/**
 * Remove all persisted list view-state from localStorage so each Management
 * list page opens at its defaults. Call on successful login. Never throws —
 * a storage failure must not block login.
 */
export function clearListViewState(): void {
  try {
    // Collect first, then remove: removing during the key(i) loop shifts indices.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        VIEW_STATE_EXACT_KEYS.includes(key) ||
        VIEW_STATE_PREFIXES.some((p) => key.startsWith(p))
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage unavailable (e.g. privacy mode) — never block login.
  }
}
```

- [ ] **Step 2: Type-check the util**

Run: `npx tsc --noEmit`
Expected: PASS (zero errors).

- [ ] **Step 3: Add the import to AuthContext**

In `src/context/AuthContext.tsx`, add this import alongside the other relative imports near the top of the file (e.g. just after the existing `import api from ...` / utils imports):

```ts
import { clearListViewState } from '../utils/clearListViewState';
```

- [ ] **Step 4: Call the sweep inside login()**

In `src/context/AuthContext.tsx`, inside the `login` function, find the authorized-session persistence block (around line 153–156):

```ts
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('loginResponse', JSON.stringify(loginData));
      setUser(userData);
      setLoginResponse(loginData);
```

Immediately after `setLoginResponse(loginData);` and before the existing `fetchProfile();` line, insert:

```ts

      // Fresh login starts clean — drop saved per-page filters/search/sort/pagination.
      clearListViewState();
```

(The auth keys set just above do not match the sweep's prefixes, so they are not removed.)

- [ ] **Step 5: Type-check the wiring**

Run: `npx tsc --noEmit`
Expected: PASS (zero errors).

- [ ] **Step 6: Build / lint**

Run: `bun run build`
Expected: build succeeds, no eslint errors. (Use `npm run build` if `bun` is unavailable.)

- [ ] **Step 7: Manual verification (deferred to controller/user — needs a running app + login)**

Run `bun start`, open `http://localhost:3304`. On a list page (e.g. Users): type a search, open Filters and set a status/deleted filter, change the page, change sort, change rows-per-page. Then log out and log back in. Reopen Users:
- search box empty, no active filter badges, page 1, default sort, default rows-per-page.
- Collapse the sidebar before logging out → after re-login the sidebar collapse state is unchanged (preserved).

If you cannot run the interactive check in this environment, confirm by code inspection that (a) the call is reached only on authorized login, (b) the swept prefixes cover every `search_/filters_/status_filters_/filter_/page_/sort_/perpage_/devicefilter_` key and `report_template_probe_bu`, and (c) none of `token/user/loginResponse/effectivePermissions/sidebar-collapsed` match a prefix — and note that reasoning in the report.

- [ ] **Step 8: Commit**

```bash
git add src/utils/clearListViewState.ts src/context/AuthContext.tsx
git commit -m "feat(auth): clear all list filters on login

Add clearListViewState() prefix-sweep util and call it in
AuthContext.login() after the session is authorized. Wipes per-entity
search/filters/sort/page/perpage from localStorage; preserves auth keys
and the sidebar-collapsed preference.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Clear all view-state on successful login → Task 1 Steps 1+4. ✓
- Preserve auth keys + `sidebar-collapsed` → util prefixes exclude them (Step 1); noted in Global Constraints. ✓
- Approach A prefix-sweep + denylist → Step 1 util. ✓
- Call after authorized persistence, not on restore → Step 4 placement (after `setLoginResponse`), explicitly not the init effect. ✓
- `filter_` and `filters_` both present; `report_template_probe_bu` exact key → Step 1. ✓
- Never block login on storage error → `try/catch` in Step 1. ✓
- Robust to future entities → prefix sweep (no per-entity list). ✓

**Placeholder scan:** No TBD/TODO; the util and the edit show complete code; commands have expected outcomes. ✓

**Type consistency:** Single symbol `clearListViewState(): void` defined in Step 1 and imported/called identically in Steps 3–4. No other types introduced. ✓
