# Users Bulk Delete (Super Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super admins select multiple users on the current page of `/users` and delete them in one action — both soft (reversible) and hard (permanent, confirmed by a random 8-digit code).

**Architecture:** Add opt-in row-selection to the shared `DataTable` (TanStack Table's built-in selection, rendered only when `enableRowSelection` is true). `UserManagement` enables it for super admins, tracks selected rows, and shows a toolbar with bulk Delete / Hard Delete. Deletes loop client-side over the existing `userService.delete` / `userService.hardDelete` with `Promise.allSettled`.

**Tech Stack:** React 18 + TypeScript (strict), Vite, TanStack Table v8, shadcn/ui (Radix + CVA), sonner toasts, lucide-react icons.

## Global Constraints

- **Gate:** entire feature behind `isSuperAdmin` (from `useAuth()`, type `boolean`). Non-super-admins must see the page byte-for-byte as today.
- **Selection scope:** current page only (server-side pagination; no cross-page selection).
- **No new libraries.** Use the existing raw `<input type="checkbox">` convention (no new `Checkbox` primitive).
- **`DataTable` changes must be additive / backward-compatible** — existing callers pass no new props and behave exactly as before.
- **Never** use `alert()` / `window.confirm()` — use `toast.*` and dialog components.
- **Never** add a `#` row-index column manually — `DataTable` already adds one.
- **Wrap column defs** in `useMemo` with correct deps.
- **Bulk hard delete** confirmation = type a **system-generated random 8-digit code**.

## Testing Approach (read first)

This repo has **no unit-test runner** (vitest/jest are deferred work — see project memory). Do **not** add one. Each task's verification cycle is:

1. **Type check:** `npx tsc --noEmit` → expect no errors.
2. **Lint/build:** `bun run build` (eslint runs via vite-plugin-eslint) → expect success. If `bun` is unavailable, use `npm run build`.
3. **Manual browser check:** run `bun start` (dev server on `:3304`), follow the task's manual checklist.

A focused Playwright E2E in the sibling repo `../carmen-platform-e2e` is a **follow-up**, not part of these tasks.

## File Structure

- `src/components/ui/data-table.tsx` — **modify.** Add opt-in row-selection props, internal selection state, a conditional checkbox column, and parent notification/reset effects. One responsibility: the reusable table wrapper.
- `src/pages/UserManagement.tsx` — **modify.** Enable selection for super admins, hold selected rows, render the bulk toolbar and the two bulk dialogs (soft via `ConfirmDialog`, hard via a custom `Dialog`).
- `src/services/userService.ts` — **not modified** (client-side loop reuses `delete` / `hardDelete`). Only revisit if swagger reveals a real bulk endpoint (out of scope here).

---

### Task 1: Add opt-in row selection to `DataTable`

**Files:**
- Modify: `src/components/ui/data-table.tsx`

**Interfaces:**
- Consumes: TanStack Table v8 (`useReactTable`, `RowSelectionState`, `ColumnDef`).
- Produces (new optional `DataTableProps` fields, consumed by Task 2):
  - `enableRowSelection?: boolean` — default `false`; when `true`, renders a checkbox column as the first column.
  - `getRowId?: (row: TData, index: number) => string` — stable row id used as the selection key.
  - `onSelectionChange?: (rows: TData[]) => void` — called with the selected row objects whenever selection changes.
  - `selectionResetKey?: unknown` — when this value changes, internal selection is cleared.

- [ ] **Step 1: Import `RowSelectionState`**

In the type import block (currently lines 8–13), add `type RowSelectionState`:

```ts
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type Updater,
  type RowSelectionState,
} from '@tanstack/react-table';
```

- [ ] **Step 2: Add an indeterminate-aware checkbox component**

Insert this small component just above `interface DataTableProps<TData>` (around line 40):

```tsx
function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-input cursor-pointer"
    />
  );
}
```

- [ ] **Step 3: Extend `DataTableProps` with the four new optional props**

Add to the `DataTableProps<TData>` interface (after `defaultSort?` on line 52):

```ts
  enableRowSelection?: boolean;
  getRowId?: (row: TData, index: number) => string;
  onSelectionChange?: (rows: TData[]) => void;
  selectionResetKey?: unknown;
```

- [ ] **Step 4: Destructure the new props in the function signature**

In the `DataTable({ ... })` parameter list (after `defaultSort,` on line 67), add:

```ts
  enableRowSelection = false,
  getRowId,
  onSelectionChange,
  selectionResetKey,
```

- [ ] **Step 5: Add internal selection state**

Just below the `pagination` state (after line 75), add:

```ts
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
```

- [ ] **Step 6: Wire selection into the table config**

In the `useReactTable({ ... })` call: add `rowSelection` to `state`, and add `enableRowSelection`, `onRowSelectionChange`, and `getRowId` options.

Change the `state` object (lines 123–127) to include `rowSelection`:

```ts
    state: {
      sorting,
      globalFilter: serverSide ? undefined : globalFilter,
      pagination,
      rowSelection,
    },
```

And add these three options alongside the other manual flags (e.g. right after `manualFiltering: serverSide,` on line 131):

```ts
    enableRowSelection,
    onRowSelectionChange: setRowSelection,
    getRowId,
```

- [ ] **Step 7: Add reset + notify effects**

Add these two effects immediately after the existing `React.useEffect` that syncs pagination (after line 81):

```ts
  React.useEffect(() => {
    setRowSelection({});
  }, [selectionResetKey]);

  React.useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(selected);
    // table/onSelectionChange intentionally excluded: fire only when the
    // selection map changes; parent passes a stable (useCallback) handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, enableRowSelection]);
```

Note: `table` is defined later in the component but is in scope inside the effect callback (the effect runs after render). If your linter flags use-before-define for `table`, move these two effects to just below the `useReactTable(...)` assignment instead.

- [ ] **Step 8: Add the conditional checkbox column**

Replace the `columnsWithIndex` memo (lines 109–118) with a version that prepends a selection column when enabled:

```tsx
  const columnsWithIndex = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    const base: ColumnDef<TData, unknown>[] = [
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }) => pagination.pageIndex * pagination.pageSize + row.index + 1,
        enableSorting: false,
        meta: { cellClassName: 'text-muted-foreground w-10' },
      },
      ...columns,
    ];
    if (!enableRowSelection) return base;
    const selectionCol: ColumnDef<TData, unknown> = {
      id: 'select',
      enableSorting: false,
      meta: { headerClassName: 'w-10', cellClassName: 'w-10' },
      header: ({ table }) => (
        <SelectCheckbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          ariaLabel="Select all on this page"
        />
      ),
      cell: ({ row }) => (
        <SelectCheckbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          ariaLabel="Select row"
        />
      ),
    };
    return [selectionCol, ...base];
  }, [columns, pagination.pageIndex, pagination.pageSize, enableRowSelection]);
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 10: Build / lint**

Run: `bun run build`
Expected: build succeeds, no eslint errors. (Use `npm run build` if `bun` is unavailable.)

- [ ] **Step 11: Manual regression check (no behaviour change for existing callers)**

Run `bun start`, open `http://localhost:3304/clusters` (a page that does NOT pass the new props).
Expected: table renders exactly as before — **no** checkbox column, `#` index column still first, sorting/pagination unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/components/ui/data-table.tsx
git commit -m "feat(data-table): opt-in row selection (checkbox column)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire selection + bulk soft delete into `UserManagement`

**Files:**
- Modify: `src/pages/UserManagement.tsx`

**Interfaces:**
- Consumes: `DataTable` props from Task 1 (`enableRowSelection`, `getRowId`, `onSelectionChange`, `selectionResetKey`); `isSuperAdmin: boolean` from `useAuth()`; `userService.delete(id)`; `ConfirmDialog`.
- Produces (consumed by Task 3): the helpers `clearSelection()`, `summarizeBulk(results)`, the `selectedUsers` state, and the bulk toolbar where Task 3 adds its Hard Delete button.

- [ ] **Step 1: Add selection + bulk-soft state**

After the existing `const [syncing, setSyncing] = useState(false);` (line 101), add:

```ts
  const [selectedUsers, setSelectedUsers] = useState<UserRecord[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [bulkSoftOpen, setBulkSoftOpen] = useState(false);
```

- [ ] **Step 2: Add selection + summary helpers**

After `handleConfirmHardDelete` / `handleCopyUsername` (around line 279, before `handleExport`), add:

```ts
  const handleSelectionChange = useCallback((rows: UserRecord[]) => {
    setSelectedUsers(rows);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUsers([]);
    setSelectionResetKey((k) => k + 1);
  }, []);

  const summarizeBulk = (results: PromiseSettledResult<unknown>[]) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`Deleted ${ok} user(s)`);
    else if (ok === 0) toast.error(`Failed to delete ${fail} user(s)`);
    else toast.warning(`Deleted ${ok}, ${fail} failed`);
  };

  const handleConfirmBulkSoftDelete = async () => {
    const results = await Promise.allSettled(selectedUsers.map((u) => userService.delete(u.id)));
    summarizeBulk(results);
    setBulkSoftOpen(false);
    clearSelection();
    setPaginate((prev) => ({ ...prev }));
  };
```

- [ ] **Step 3: Bump the skeleton column count for the checkbox column**

Change the `TableSkeleton` line (line 647) from:

```tsx
                  <TableSkeleton columns={9} rows={paginate.perpage || 5} />
```

to:

```tsx
                  <TableSkeleton columns={isSuperAdmin ? 10 : 9} rows={paginate.perpage || 5} />
```

- [ ] **Step 4: Render the bulk toolbar above the table**

In `CardContent`, immediately inside the `!error ?` branch and before the `<div className="relative">` (i.e. just before line 645), insert the toolbar:

```tsx
            {isSuperAdmin && selectedUsers.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{selectedUsers.length} selected</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBulkSoftOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                  {/* Hard Delete button is added in Task 3 */}
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
```

- [ ] **Step 5: Pass the selection props to `DataTable`**

Update the `<DataTable ... />` (lines 655–664) to add the four selection props:

```tsx
                <DataTable
                  columns={columns}
                  data={users}
                  serverSide
                  totalRows={totalRows}
                  page={paginate.page}
                  perpage={paginate.perpage}
                  onPaginateChange={handlePaginateChange}
                  onSortChange={handleSortChange}
                  enableRowSelection={isSuperAdmin}
                  getRowId={(row) => row.id}
                  onSelectionChange={handleSelectionChange}
                  selectionResetKey={selectionResetKey}
                />
```

- [ ] **Step 6: Add the bulk soft-delete `ConfirmDialog`**

Right after the existing single-row `ConfirmDialog` (closes at line 681), add:

```tsx
      <ConfirmDialog
        open={bulkSoftOpen}
        onOpenChange={(open) => { if (!open) setBulkSoftOpen(false); }}
        title={`Delete ${selectedUsers.length} user(s)`}
        description="Soft-delete the selected user(s)? They can be restored later."
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleConfirmBulkSoftDelete}
      />
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Build / lint**

Run: `bun run build`
Expected: success, no eslint errors.

- [ ] **Step 9: Manual check**

Run `bun start`, open `http://localhost:3304/users` **logged in as a super admin**:
- A checkbox column appears as the first column; header checkbox toggles all rows on the current page (indeterminate when only some are selected).
- Selecting ≥1 row shows the toolbar with "N selected", Delete, Clear.
- **Clear** deselects everything and hides the toolbar.
- **Delete** opens the confirm dialog ("Delete N user(s)"); confirming soft-deletes them, shows a summary toast (`Deleted N user(s)`), clears selection, and the list refreshes.
- Log in as a **non-super-admin**: no checkbox column, no toolbar — page identical to before.

- [ ] **Step 10: Commit**

```bash
git add src/pages/UserManagement.tsx
git commit -m "feat(users): bulk soft delete for super admins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Bulk hard delete with random 8-digit code

**Files:**
- Modify: `src/pages/UserManagement.tsx`

**Interfaces:**
- Consumes: `selectedUsers`, `clearSelection()`, `summarizeBulk()` from Task 2; `userService.hardDelete(id)`; `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter`, `Label`, `Input`, `Button`, and icons `AlertTriangle` / `Trash2` / `Loader2` (all already imported in this file).

- [ ] **Step 1: Add bulk hard-delete state**

After the `bulkSoftOpen` state added in Task 2, add:

```ts
  const [bulkHardOpen, setBulkHardOpen] = useState(false);
  const [bulkConfirmCode, setBulkConfirmCode] = useState('');
  const [bulkConfirmInput, setBulkConfirmInput] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
```

- [ ] **Step 2: Add the code generator + handlers**

After `handleConfirmBulkSoftDelete` (from Task 2), add:

```ts
  const genBulkCode = () => String(Math.floor(10000000 + Math.random() * 90000000));

  const openBulkHardDelete = () => {
    setBulkConfirmCode(genBulkCode());
    setBulkConfirmInput('');
    setBulkHardOpen(true);
  };

  const handleConfirmBulkHardDelete = async () => {
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(selectedUsers.map((u) => userService.hardDelete(u.id)));
      summarizeBulk(results);
      setBulkHardOpen(false);
      setBulkConfirmInput('');
      clearSelection();
      setPaginate((prev) => ({ ...prev }));
    } finally {
      setBulkDeleting(false);
    }
  };
```

- [ ] **Step 3: Add the Hard Delete button to the toolbar**

In the toolbar from Task 2, replace the `{/* Hard Delete button is added in Task 3 */}` comment with:

```tsx
                  <Button variant="destructive" size="sm" onClick={openBulkHardDelete}>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Hard Delete
                  </Button>
```

- [ ] **Step 4: Add the bulk hard-delete dialog**

After the single-row hard-delete `Dialog` (closes at line 745) and before the Debug Sheet block, add:

```tsx
      {/* Bulk Hard Delete Dialog with random-code confirmation */}
      <Dialog open={bulkHardOpen} onOpenChange={(open) => { if (!open && !bulkDeleting) { setBulkHardOpen(false); setBulkConfirmInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently Delete {selectedUsers.length} User(s)
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the selected users and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
              {selectedUsers.map((u) => (
                <div key={u.id} className="text-sm font-medium">
                  {u.username || u.email || u.user_id || u.id}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkHardConfirm">
                Type <span className="font-mono font-semibold text-destructive">{bulkConfirmCode}</span> to confirm
              </Label>
              <Input
                id="bulkHardConfirm"
                value={bulkConfirmInput}
                onChange={(e) => setBulkConfirmInput(e.target.value)}
                placeholder="Enter the 8-digit code"
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkHardOpen(false); setBulkConfirmInput(''); }} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmBulkHardDelete}
              disabled={bulkDeleting || bulkConfirmInput !== bulkConfirmCode}
            >
              {bulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {bulkDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Build / lint**

Run: `bun run build`
Expected: success, no eslint errors.

- [ ] **Step 7: Manual check**

Run `bun start`, open `http://localhost:3304/users` as a super admin:
- Select ≥1 row → toolbar now shows **Hard Delete** (destructive) between Delete and Clear.
- Click **Hard Delete** → dialog opens listing the selected usernames and showing a fresh random 8-digit code.
- The "Permanently Delete" button is **disabled** until the typed value exactly equals the code.
- Typing the wrong code keeps it disabled; typing the exact code enables it.
- Confirming permanently deletes the users, shows a summary toast, clears selection, closes the dialog, and refreshes the list.
- Re-opening the dialog shows a **different** code each time.
- Cancel (or closing) resets the typed input; the button shows a spinner and is disabled while deleting.

- [ ] **Step 8: Commit**

```bash
git add src/pages/UserManagement.tsx
git commit -m "feat(users): bulk hard delete with random-code confirmation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Gate to `isSuperAdmin` → Task 2 Step 5 (`enableRowSelection={isSuperAdmin}`) + toolbar/skeleton guards. ✓
- Opt-in `DataTable` selection (current page only) → Task 1 (page-scoped header helpers). ✓
- Bulk soft delete via `ConfirmDialog` → Task 2 Steps 2/6. ✓
- Bulk hard delete via random 8-digit code → Task 3 Steps 1–4. ✓
- `Promise.allSettled` + summary toast → Task 2 `summarizeBulk` (shared by Task 3). ✓
- Clear selection + refetch after delete → `clearSelection()` + `setPaginate((p) => ({ ...p }))` in both handlers. ✓
- No new libraries / raw checkbox → Task 1 `SelectCheckbox` uses `<input type="checkbox">`. ✓
- Backward compatibility → Task 1 Step 11 regression check on `/clusters`. ✓
- Service layer untouched → confirmed in File Structure (swagger bulk-endpoint check is an out-of-scope follow-up from the spec). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only inline comment markers (`{/* Hard Delete button is added in Task 3 */}`) are intentional handoffs and are replaced in Task 3 Step 3. ✓

**Type consistency:** `selectedUsers: UserRecord[]`, `getRowId={(row) => row.id}` (matches `UserRecord.id: string`), `onSelectionChange: (rows: UserRecord[]) => void` (matches `DataTable`'s `onSelectionChange?: (rows: TData[]) => void`), `summarizeBulk(results: PromiseSettledResult<unknown>[])` consumed identically in Tasks 2 and 3, `clearSelection()` defined in Task 2 and called in Task 3. ✓
