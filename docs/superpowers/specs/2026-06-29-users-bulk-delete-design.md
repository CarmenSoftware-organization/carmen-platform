# Bulk Delete on Users page (Super Admin only) — Design

**Date:** 2026-06-29
**Page:** `http://localhost:3304/users` (`src/pages/UserManagement.tsx`)
**Status:** Approved, ready for implementation plan

## Summary

Add multi-row ("bulk") delete to the User Management page. The entire feature is
gated to the logged-in user being a **super admin** (`isSuperAdmin === true` from
`useAuth()`). Non-super-admin users see the page exactly as it is today — no
checkboxes, no toolbar.

Two bulk actions are provided:

- **Bulk soft delete** — reversible (sets `deleted_at`), confirmed with the
  standard `ConfirmDialog`.
- **Bulk hard delete** — permanent, confirmed by typing a **system-generated
  random 8-digit code**.

Row selection covers **the current page only** (server-side pagination; no
cross-page selection).

## Goals

- Super admins can select multiple users on the current page and delete them in
  one action (soft or hard).
- Keep the existing single-row Delete / Hard Delete behaviour untouched.
- Zero behaviour change for non-super-admins.
- No new third-party libraries.

## Non-Goals

- Cross-page / "select all matching filter" selection.
- A new reusable `Checkbox` UI primitive (use the existing raw
  `<input type="checkbox">` convention already used in the filter sheet).
- Bulk restore / bulk edit.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Which delete types? | **Both** — bulk soft delete and bulk hard delete |
| Bulk hard-delete confirmation | Type a **random 8-digit code** the system generates |
| "Select all" scope | **Current page only** |
| Selection implementation | **Extend `DataTable`** with opt-in row-selection props (Approach A) |
| Gate | `isSuperAdmin` only (independent of the per-row `user.delete` permission) |

## Architecture

### 1. `src/components/ui/data-table.tsx` — opt-in row selection (additive)

Add optional props. All default to off, so existing callers are unaffected
(backward compatible):

```ts
enableRowSelection?: boolean;                 // render the checkbox column when true
getRowId?: (row: TData, index: number) => string;  // stable id, caller passes (r) => r.id
onSelectionChange?: (rows: TData[]) => void;  // fires with the selected row objects
selectionResetKey?: unknown;                  // when this value changes, clear internal selection
```

Implementation notes:

- Use TanStack Table's built-in row selection: add `enableRowSelection`,
  `state.rowSelection`, `onRowSelectionChange`, and `getRowId` to the
  `useReactTable` config. Hold `rowSelection` in internal `useState({})`.
- Prepend a **selection column as the very first column** (before the auto `#`
  index column), rendered only when `enableRowSelection` is true.
  - **Header cell:** select-all checkbox for the current page using
    `table.getIsAllPageRowsSelected()`, `table.getIsSomePageRowsSelected()`
    (set the DOM `indeterminate` flag via a ref), and
    `table.getToggleAllPageRowsSelectedHandler()`.
    `aria-label="Select all on this page"`.
  - **Row cell:** `row.getIsSelected()` / `row.getToggleSelectedHandler()`.
    `aria-label` includes the row's username/email.
  - Use `<input type="checkbox" className="h-4 w-4 rounded border-input cursor-pointer">`
    and `onClick`/`onChange` `stopPropagation` so cell links aren't triggered.
  - Because `manualPagination` is on, the "page" is exactly the loaded rows, so
    page-scoped helpers naturally implement "current page only".
- Notify the parent: a `useEffect` keyed on `[rowSelection]` calls
  `onSelectionChange(table.getSelectedRowModel().rows.map(r => r.original))`.
- Reset: a `useEffect` keyed on `[selectionResetKey]` calls `setRowSelection({})`.
- Guard against render loops: parent passes a `useCallback`-stable
  `onSelectionChange` and a stable `data` reference (the `users` state array).

### 2. `src/pages/UserManagement.tsx`

**Gating:** pass `enableRowSelection={isSuperAdmin}` to `DataTable`. Everything
below is rendered only when `isSuperAdmin` is true.

**New state:**

```ts
const [selectedUsers, setSelectedUsers] = useState<UserRecord[]>([]);
const [selectionResetKey, setSelectionResetKey] = useState(0);
const [bulkSoftOpen, setBulkSoftOpen] = useState(false);
const [bulkHardOpen, setBulkHardOpen] = useState(false);
const [bulkConfirmCode, setBulkConfirmCode] = useState('');
const [bulkConfirmInput, setBulkConfirmInput] = useState('');
const [bulkDeleting, setBulkDeleting] = useState(false);
```

`onSelectionChange={handleSelectionChange}` where `handleSelectionChange` is a
`useCallback` that does `setSelectedUsers(rows)`.

`TableSkeleton` column count becomes `isSuperAdmin ? 10 : 9` (extra checkbox
column).

**Selection toolbar** — rendered when `isSuperAdmin && selectedUsers.length > 0`,
placed above the table (in `CardHeader` or a bar above `DataTable`):

> **`N` selected** · `[ Delete ]` · `[ Hard Delete ]` (destructive) · `[ Clear ]`

- **Delete** → `setBulkSoftOpen(true)`
- **Hard Delete** → `setBulkConfirmCode(genCode()); setBulkConfirmInput(''); setBulkHardOpen(true)`
- **Clear** → `clearSelection()`

Helpers:

```ts
const genCode = () => String(Math.floor(10000000 + Math.random() * 90000000)); // 8 digits
const clearSelection = () => { setSelectedUsers([]); setSelectionResetKey((k) => k + 1); };
```

**Shared finish logic** after a bulk operation resolves:

```ts
const summarize = (results: PromiseSettledResult<unknown>[]) => {
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.length - ok;
  if (fail === 0) toast.success(`Deleted ${ok} user(s)`);
  else if (ok === 0) toast.error(`Failed to delete ${fail} user(s)`);
  else toast.warning(`Deleted ${ok}, ${fail} failed`);
};
```

Then: `clearSelection()`, refetch via `setPaginate((prev) => ({ ...prev }))`, and
close the dialog.

### 3. Bulk soft delete

`ConfirmDialog`:

- `title`: `Delete ${selectedUsers.length} user(s)`
- `description`: `Soft-delete the selected user(s)? They can be restored later.`
- `confirmText`: `Delete`, `confirmVariant`: `destructive`
- `onConfirm`:
  ```ts
  const results = await Promise.allSettled(selectedUsers.map((u) => userService.delete(u.id)));
  summarize(results);
  // clear + refetch + close
  ```

### 4. Bulk hard delete (custom Dialog)

Modeled on the existing single-row hard-delete `Dialog` in the same file:

- Title (destructive, `AlertTriangle`): "Permanently Delete N Users"
- Body:
  - Warning that this removes the users and all associated data, cannot be undone.
  - **List of selected users** (username, falling back to email) — scrollable if long.
  - The generated 8-digit code shown in a copyable mono span.
  - `Input` bound to `bulkConfirmInput` with label "Type `<code>` to confirm".
- Footer:
  - Cancel (disabled while `bulkDeleting`).
  - "Permanently Delete" (`variant="destructive"`), **disabled unless**
    `bulkConfirmInput === bulkConfirmCode`, shows `Loader2` spinner while
    `bulkDeleting`.
- `onConfirm`:
  ```ts
  setBulkDeleting(true);
  try {
    const results = await Promise.allSettled(selectedUsers.map((u) => userService.hardDelete(u.id)));
    summarize(results);
    // clear + refetch + close
  } finally {
    setBulkDeleting(false);
  }
  ```

### 5. Service / Backend

Default: **client-side loop** with `Promise.allSettled` over the existing
`userService.delete(id)` / `userService.hardDelete(id)` — no backend change.

During implementation, **confirm against swagger** (`/api-system` backend)
whether a bulk delete endpoint exists. If one does, add
`userService.bulkDelete` / `userService.bulkHardDelete` and call it once instead
of looping; the toast summary then reflects the single response.

## Files Touched

- `src/components/ui/data-table.tsx` — additive opt-in row selection.
- `src/pages/UserManagement.tsx` — selection state, toolbar, two bulk dialogs, gating.
- *(maybe)* `src/services/userService.ts` — only if a bulk endpoint exists.

## Edge Cases

- **Already soft-deleted rows** selected for bulk soft delete → backend may error;
  `Promise.allSettled` surfaces it in the "Y failed" summary (no crash).
- **Refetch after delete** replaces `users`; `selectionResetKey` bump clears
  internal selection so no stale ids remain selected.
- **Page change / filter change** reloads data; selection resets because the new
  rows' ids no longer match (and a reset key bump can be added on those handlers
  if needed).
- **Non-super-admin**: `enableRowSelection={false}` → no checkbox column, no
  toolbar, identical to today.

## Accessibility

- Header checkbox `aria-label="Select all on this page"`; row checkboxes carry an
  `aria-label` referencing the username/email.
- Toolbar buttons have clear labels; destructive button uses `variant="destructive"`.

## Out of Scope / Follow-ups

- Reusing the new `DataTable` selection on other Management pages (now possible,
  but not part of this change).
- A dedicated backend bulk endpoint (only adopted if it already exists).
