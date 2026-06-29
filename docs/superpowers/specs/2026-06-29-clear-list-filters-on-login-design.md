# Clear all list filters on login — Design

**Date:** 2026-06-29
**Touches:** `src/context/AuthContext.tsx`, new `src/utils/clearListViewState.ts`
**Status:** Approved, ready for implementation plan

## Summary

Every Management list page persists its view-state (search text, filters, status,
deleted toggle, current page, sort, rows-per-page) in `localStorage` under
per-entity keys. The user wants a **clean slate on every successful login**: all
of that saved list view-state is wiped so each list page opens at its defaults
after logging in.

A previous session's filters should not carry over to a fresh login.

## Goals

- On every **successful, authorized** login, remove all persisted per-page list
  view-state from `localStorage`.
- Preserve authentication state and UI chrome preferences.
- Robust to new entities/pages added later (no per-entity maintenance).

## Non-Goals

- Clearing on logout (login-only covers the requirement — YAGNI).
- Resetting React state of already-mounted list pages (none are mounted at login
  time — see "Why this is sufficient").
- A user-facing "clear filters" button (separate concern, already exists per-page).

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| What to reset | **Everything** — search, filters, status, deleted toggle, page, sort, AND perpage, back to defaults on every page |
| Implementation | **Approach A** — prefix-sweep with a denylist (clear only keys matching known view-state prefixes) |
| When | Inside `login()`, after the session is authorized & persisted — not on session restore/refresh |

## Persisted keys (inventory)

View-state keys that MUST be cleared (observed across all 8 Management pages):

- Prefix `search_` — e.g. `search_users`, `search_clusters`, `search_user_platform`
- Prefix `filters_` — e.g. `filters_clusters`, `filters_report_templates`, `filters_report_templates_source_type`
- Prefix `status_filters_` — e.g. `status_filters_users`, `status_filters_user_platform`
- Prefix `filter_` — e.g. `filter_users_deleted`, `filter_clusters_deleted`, `filter_business_units_deleted`
- Prefix `page_` — e.g. `page_users`, `page_user_platform`
- Prefix `sort_` — e.g. `sort_users`, `sort_roles`
- Prefix `perpage_` — e.g. `perpage_users`, `perpage_news`
- Prefix `devicefilter_` — e.g. `devicefilter_applications`
- Exact key `report_template_probe_bu` (does not follow the prefix convention)

Keys that MUST be preserved (none match the prefixes above, so they are safe):

- `token`, `user`, `loginResponse`, `effectivePermissions` (auth/session)
- `sidebar-collapsed` (UI chrome preference)

Note on prefix overlap: `filter_` does NOT match `filters_clusters`
(`'filters_clusters'.startsWith('filter_')` is `false` — char 7 is `s` vs `_`),
so both `filter_` and `filters_` are needed; both are in the list.

## Architecture

### 1. New util — `src/utils/clearListViewState.ts`

A single pure-ish function that sweeps `localStorage`:

```ts
// Per-entity list view-state persisted by Management pages. Auth keys
// (token/user/loginResponse/effectivePermissions) and UI prefs
// (sidebar-collapsed) do not match these prefixes, so they are preserved.
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

export function clearListViewState(): void {
  try {
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

Implementation notes:
- **Collect-then-remove:** gather matching keys first, then remove — removing
  during the `localStorage.key(i)` loop shifts indices and skips keys.
- **try/catch:** a storage failure must never make `login()` throw.

### 2. Call site — `src/context/AuthContext.tsx`, inside `login()`

- Add `import { clearListViewState } from '../utils/clearListViewState';`.
- After the authorized session is persisted — immediately after
  `setLoginResponse(loginData);` (currently line 156) and before
  `fetchProfile();` — call:

```ts
// Fresh login starts clean — drop saved per-page filters/search/sort/pagination.
clearListViewState();
```

Placement rationale: the access-gate denial path (currently lines 135–145) tears
the partial session down and returns failure before this point, so filters are
only cleared on a fully successful, authorized login. The auth keys set just
above are not matched by the sweep, so order is not load-bearing — but placing it
after persistence keeps the "authorized" intent obvious.

### Why this is sufficient

Every list page reads its view-state from `localStorage` at mount
(e.g. `const storedSearch = localStorage.getItem('search_users')`). At login the
user is on `/login`; no list page is mounted holding stale React state. Clearing
`localStorage` during `login()` means the next time any list page mounts it reads
empty values and falls back to its defaults. No cross-page React state reset is
needed.

## Files Touched

- **Create** `src/utils/clearListViewState.ts` — the sweep util.
- **Modify** `src/context/AuthContext.tsx` — import + one call inside `login()`.

## Edge Cases

- **localStorage throws** (privacy mode / quota): `try/catch` swallows it; login proceeds.
- **No view-state keys present** (first-ever login): loop finds nothing; no-op.
- **Session restore on refresh:** the init/restore effect does NOT call the sweep,
  so refreshing while logged in keeps the user's current filters.
- **Future entities:** a new page using `search_<x>` / `perpage_<x>` etc. is
  cleared automatically by the prefix sweep — no maintenance needed. A new page
  using a non-conventional exact key would need adding to `VIEW_STATE_EXACT_KEYS`
  (same as `report_template_probe_bu`).

## Testing / Verification

This repo has no unit-test runner (vitest/jest deferred). Verification:

- `npx tsc --noEmit` → 0 errors.
- `bun run build` → success, no eslint errors.
- Manual: on a list page (e.g. Users) set a search + a filter + change page/sort/
  rows-per-page → log out → log back in → reopen Users → all back to defaults.
  Confirm the sidebar collapsed/expanded preference is unchanged.

## Out of Scope / Follow-ups

- Clearing on logout (could be added later if cross-account leakage of filters
  becomes a concern; login-only is enough for the stated requirement).
