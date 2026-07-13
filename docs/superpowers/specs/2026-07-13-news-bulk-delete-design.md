# News Multi-Select Bulk Delete — Design

**Date:** 2026-07-13
**Page:** `/news` (`src/pages/NewsManagement.tsx`)
**Status:** Approved for implementation

## Goal

Let an admin select multiple news rows via checkboxes and delete them in one action,
guarded by a type-a-code confirmation dialog.

## Constraints & Facts

- News supports **soft delete only** — `newsService.delete(id)` → `DELETE /api/news/:id`.
  There is no hard-delete endpoint for news. The list already hides soft-deleted rows
  (`getAll` filters `!deleted_at && !audit?.deleted?.at`).
- `DataTable` (`src/components/ui/data-table.tsx`) already exposes the selection API:
  `enableRowSelection`, `onSelectionChange`, `selectionResetKey`, `getRowSelectionLabel`.
  **No `ui/` primitive changes.**
- **No service changes** — `newsService.delete` is sufficient.
- Reference implementation: `src/pages/UserManagement.tsx` (bulk hard-delete flow) —
  copy its toolbar, `genBulkCode`, type-code `Dialog`, `summarizeBulk`, and
  `Promise.allSettled` handler shape.
- Per-row Delete is gated by `<Can permission="news.delete">`; the bulk feature uses the
  same permission.

## Design

Changes confined to `src/pages/NewsManagement.tsx` (+ its test file).

### 1. Selection wiring

New state:

```ts
const [selectedNews, setSelectedNews] = useState<News[]>([]);
const [selectionResetKey, setSelectionResetKey] = useState(0);
const [bulkOpen, setBulkOpen] = useState(false);
const [bulkCode, setBulkCode] = useState('');
const [bulkInput, setBulkInput] = useState('');
const [bulkDeleting, setBulkDeleting] = useState(false);
```

Permission gate:

```ts
const { hasPermission } = useAuth();
const canDelete = hasPermission('news.delete');
```

Pass to `DataTable`:

```tsx
enableRowSelection={canDelete}
onSelectionChange={setSelectedNews}
selectionResetKey={selectionResetKey}
getRowSelectionLabel={(n) => `Select ${n.title || 'news'}`}
```

Without `news.delete`, `enableRowSelection` is `false` → no checkbox column renders.

`clearSelection` helper:

```ts
const clearSelection = () => {
  setSelectedNews([]);
  setSelectionResetKey((k) => k + 1);
};
```

### 2. Selection toolbar

Rendered in `CardHeader`, only when `selectedNews.length > 0`:

- `{selectedNews.length} selected` text.
- Destructive **Delete Selected** button → `openBulkDelete()`.
- Ghost **Clear** button → `clearSelection()`.

Follows the UserManagement toolbar layout; placed with the search/filter row so it does
not shift the table.

### 3. Type-code confirm dialog

Copied from UserManagement hard-delete `Dialog` (not `ConfirmDialog` — needs the code input).

```ts
const genBulkCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const openBulkDelete = () => {
  setBulkCode(genBulkCode());
  setBulkInput('');
  setBulkOpen(true);
};
```

Dialog body:

- Title: `Delete {n} News Article(s)`.
- Description: "This will delete {n} selected news article(s). This action cannot be undone."
- `Type <span class="font-mono font-semibold text-destructive">{bulkCode}</span> to confirm`
  + `Input` bound to `bulkInput`.
- Cancel button (disabled while `bulkDeleting`) closes and resets `bulkInput`.
- Delete button: `disabled={bulkDeleting || bulkInput !== bulkCode}`; shows
  `Loader2` spinner + "Deleting..." while in flight, else `Trash2` + "Delete".

### 4. Bulk delete handler

```ts
const summarizeBulk = (results: PromiseSettledResult<unknown>[]) => {
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.length - ok;
  if (fail === 0) toast.success(`Deleted ${ok} news article(s)`);
  else if (ok === 0) toast.error(`Failed to delete ${fail} news article(s)`);
  else toast.warning(`Deleted ${ok}, ${fail} failed`);
};

const handleConfirmBulkDelete = async () => {
  setBulkDeleting(true);
  try {
    const results = await Promise.allSettled(
      selectedNews.map((n) => newsService.delete(n.id)),
    );
    summarizeBulk(results);
    setBulkOpen(false);
    setBulkInput('');
    clearSelection();
    setPaginate((prev) => ({ ...prev })); // refetch
  } finally {
    setBulkDeleting(false);
  }
};
```

`Promise.allSettled` (not `all`) → a partial failure still deletes the rest and reports
mixed outcomes via the warning toast.

### 5. Unchanged

Per-row Delete (`ConfirmDialog` + `handleDelete`/`handleConfirmDelete`), filters, tag
filter, CSV export, columns (aside from the auto-injected checkbox column), debug sheet,
routes, and `newsService`.

## Edge Cases

| Case | Behavior |
|------|----------|
| No `news.delete` permission | `enableRowSelection={false}` → no checkboxes, no toolbar |
| Empty selection | Toolbar hidden → dialog unreachable |
| Wrong / empty code typed | Delete button stays disabled |
| Partial API failure | `allSettled` → warning toast "Deleted X, Y failed"; survivors still gone |
| Selection spans pages | Only current-page rows selectable (server-side table, standard behavior) |

## Testing

Add to the `NewsManagement` test suite (Vitest + RTL; mock `newsService`, real
`MemoryRouter`, mock `Layout`/`Can`, grant `news.delete` via the auth mock):

1. Selecting rows shows the `{n} selected` toolbar.
2. **Delete Selected** opens the dialog showing the generated code.
3. Wrong code keeps the Delete button disabled.
4. Correct code + Delete calls `newsService.delete` once per selected id.
5. On success: success toast fires and selection clears (toolbar gone).
6. Partial failure (one rejected mock) → warning toast; dialog closes.

## Out of Scope

- Hard/permanent delete or restore for news (no backend endpoint).
- Cross-page "select all matching filter" selection.

---

## Addendum (2026-07-13): Bulk Archive

Extends the same selection infrastructure with a second bulk action — **archive**
(set `status: 'archived'` on each selected row). Approved with the same
type-a-code confirmation as delete.

### Constraints & Facts
- Archive is an **update**: `newsService.update(id, { status: 'archived' })`
  (multipart; the service appends `status`). Gated on **`news.update`**
  (`canArchive`), independent from `news.delete` (`canDelete`).
- News is `doc_version` optimistic-locked (rule 17). Send each row's token
  **only when the list row carries one**: `dv = getDocVersion(n)`, include
  `doc_version: dv` only when `dv != null` — a runtime no-op if the list read
  doesn't expose it (defensive per the doc_version spec). Delete needs no token.
- No service, type, or `ui/` changes (`update` already exists).

### Design
- **Selection visibility:** checkboxes show if the user can do *either* action —
  `canSelect = canDelete || canArchive`; `enableRowSelection={canSelect}`,
  skeleton count `9` when `canSelect`.
- **Toolbar:** **Archive Selected** (outline, `Archive` icon) when `canArchive`;
  **Delete Selected** (destructive) when `canDelete`; **Clear** always. A user
  with only one permission sees only that action.
- **Mode-aware dialog:** one dialog parameterized by `bulkMode: 'delete' |
  'archive'`. Title / description / list styling / confirm label + variant /
  spinner label switch on mode. Same 6-char code, same disabled-until-match.
  `bulkDeleting` renamed `bulkBusy` (covers both actions).
- **Handler:** `handleConfirmBulk` branches on `bulkMode` — archive →
  `newsService.update(n.id, { status: 'archived', ...token })`, delete →
  `newsService.delete(n.id)`. `summarizeBulk(results, pastVerb, baseVerb)`
  parameterized: `Deleted`/`delete`, `Archived`/`archive` →
  `{pastVerb} N news article(s)` / `Failed to {baseVerb} N news article(s)` /
  `{pastVerb} X, Y failed`. Both refetch + `clearSelection()`.

### Edge Cases (additional)
| Case | Behavior |
|------|----------|
| `news.update` but not `news.delete` | Checkboxes + Archive Selected only; no Delete |
| Row has no `doc_version` in list read | Archive omits the token (no 400/409 risk) |
| Archive partial failure | `allSettled` → `Archived X, Y failed` warning |
| Active status filter excludes `archived` | Archived rows drop out on refetch (expected) |

### Testing (additional)
- `news.update`-only user → Archive Selected visible, Delete Selected absent.
- Archive flow → `newsService.update` called `{ status: 'archived' }` per id,
  `doc_version` forwarded only for the row that carries it, success toast, selection clears.
- Archive partial failure → `Archived X, Y failed` warning.
