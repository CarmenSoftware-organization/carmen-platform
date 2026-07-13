# News Multi-Select Bulk Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkbox multi-select + a type-a-code confirm bulk delete to the `/news` list page.

**Architecture:** All changes live in `src/pages/NewsManagement.tsx` plus a new co-located test. Reuse the existing `DataTable` row-selection API and copy the type-code `Dialog` + `Promise.allSettled` handler shape already proven in `src/pages/UserManagement.tsx`. Soft-delete only — no service, type, or `ui/` primitive changes.

**Tech Stack:** React 19 + TypeScript, TanStack Table v8 (`DataTable` wrapper), shadcn/ui `Dialog`/`Label`/`Input`, sonner toasts, Vitest + React Testing Library + `@testing-library/user-event`.

## Global Constraints

- Bulk feature gated on permission **`news.delete`** — no permission ⇒ `enableRowSelection={false}` ⇒ no checkbox column, no toolbar.
- News is **soft delete only**: `newsService.delete(id)` → `DELETE /api/news/:id`. No hard delete, no restore.
- Do **not** modify `src/components/ui/` primitives or `src/services/newsService.ts`.
- Use `toast.*` (never `alert`) and the shadcn `Dialog` (needs a code `Input`, so **not** `ConfirmDialog`).
- Partial failures must be tolerated: `Promise.allSettled`, never `Promise.all`.
- Tests: explicit `vitest` imports (no globals), mock shell + services, real `MemoryRouter`, assert behavior.

---

### Task 1: Multi-select bulk delete on NewsManagement

**Files:**
- Modify: `src/pages/NewsManagement.tsx`
- Test: `src/pages/NewsManagement.test.tsx` (create)

**Interfaces:**
- Consumes (existing, verified):
  - `useAuth()` → `{ hasPermission(key: string, opts?): boolean }` from `../context/AuthContext`.
  - `newsService.delete(id: string): Promise<unknown>` from `../services/newsService`.
  - `DataTable` props: `enableRowSelection?: boolean`, `getRowId?: (row, index) => string`, `onSelectionChange?: (rows: TData[]) => void`, `selectionResetKey?: unknown`, `getRowSelectionLabel?: (row: TData) => string`.
  - `ui/dialog` exports `Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription`; `ui/label` exports `Label`; `ui/input` exports `Input`; `lucide-react` exports `Loader2`.
- Produces: none (leaf feature — nothing else depends on it).

- [ ] **Step 1: Write the failing test file**

Create `src/pages/NewsManagement.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/newsService', () => ({
  default: { getAll: vi.fn(), getTags: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import NewsManagement from './NewsManagement';
import newsService from '../services/newsService';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const NEWS = [
  { id: 'n1', title: 'Alpha', status: 'published' },
  { id: 'n2', title: 'Beta', status: 'draft' },
];

const renderPage = () => render(<MemoryRouter><NewsManagement /></MemoryRouter>);

describe('NewsManagement bulk delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => true } as never);
    vi.mocked(newsService.getAll).mockResolvedValue({
      data: NEWS,
      paginate: { total: 2, page: 1, perpage: 10 },
    } as never);
    vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    vi.mocked(newsService.delete).mockResolvedValue({} as never);
  });

  it('shows the selection toolbar with a count when rows are checked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('opens the confirm dialog and keeps Delete disabled until the code matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const del = within(dialog).getByRole('button', { name: /^delete$/i });
    expect(del).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'WRONG1');
    expect(del).toBeDisabled();
  });

  it('deletes every selected row on the correct code, toasts success, clears selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(newsService.delete).toHaveBeenCalledTimes(2));
    expect(newsService.delete).toHaveBeenCalledWith('n1');
    expect(newsService.delete).toHaveBeenCalledWith('n2');
    expect(toast.success).toHaveBeenCalledWith('Deleted 2 news article(s)');
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('warns on partial failure', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.delete)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({} as never);
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Deleted 1, 1 failed'));
  });

  it('hides selection entirely when the user lacks news.delete', async () => {
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => false } as never);
    renderPage();
    await screen.findByText('Alpha');
    expect(screen.queryByLabelText('Select Alpha')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/pages/NewsManagement.test.tsx`
Expected: FAIL — no "Select Alpha" checkbox / no "Delete Selected" button yet (selection not wired).

- [ ] **Step 3: Add imports, auth gate, and bulk state**

In `src/pages/NewsManagement.tsx`:

Add `Loader2` to the existing `lucide-react` import (line 14):

```tsx
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Download, Newspaper, Globe, Building2, Loader2 } from 'lucide-react';
```

Add these imports after the existing `ConfirmDialog` import (line 17):

```tsx
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
```

Immediately after `const navigate = useNavigate();` (line 57), add:

```tsx
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('news.delete');
```

Next to the existing `const [deleteId, setDeleteId] = useState<string | null>(null);` (line 85), add:

```tsx
  const [selectedNews, setSelectedNews] = useState<News[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCode, setBulkCode] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
```

- [ ] **Step 4: Add the bulk helpers and handler**

In `src/pages/NewsManagement.tsx`, immediately after `handleConfirmDelete` (ends line 186), add:

```tsx
  const clearSelection = () => {
    setSelectedNews([]);
    setSelectionResetKey((k) => k + 1);
  };

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
      const results = await Promise.allSettled(selectedNews.map((n) => newsService.delete(n.id)));
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

- [ ] **Step 5: Add the toolbar and wire the DataTable selection props**

In the render, find the DataTable branch (currently starts at line 452):

```tsx
            ) : !error ? (
              <div className="relative">
```

Replace those two lines with (wrap in a fragment, prepend the toolbar):

```tsx
            ) : !error ? (
              <>
                {canDelete && selectedNews.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedNews.length} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="destructive" size="sm" onClick={openBulkDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                <div className="relative">
```

Then find the matching close of that `<div className="relative">` (currently line 476):

```tsx
                  </>
                )}
              </div>
            ) : null}
```

Replace with (add the fragment close):

```tsx
                  </>
                )}
                </div>
              </>
            ) : null}
```

Add the selection props to the `<DataTable ... />` block (after `defaultSort={{ id: 'published_at', desc: true }}`, line 472):

```tsx
                      enableRowSelection={canDelete}
                      getRowId={(row) => row.id}
                      onSelectionChange={setSelectedNews}
                      selectionResetKey={selectionResetKey}
                      getRowSelectionLabel={(n) => `Select ${n.title || 'news'}`}
```

Update the `TableSkeleton` column count (line 455) to account for the checkbox column:

```tsx
                  <TableSkeleton columns={canDelete ? 9 : 8} rows={paginate.perpage || 5} />
```

- [ ] **Step 6: Add the type-code confirm dialog**

In `src/pages/NewsManagement.tsx`, add this block immediately before `<DevDebugSheet ... />` (line 492):

```tsx
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkDeleting) { setBulkOpen(false); setBulkInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete {selectedNews.length} News Article(s)
            </DialogTitle>
            <DialogDescription>
              This will delete {selectedNews.length} selected news article(s). This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
              {selectedNews.map((n) => (
                <div key={n.id} className="text-sm font-medium">{n.title || '(untitled)'}</div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkNewsConfirm">
                Type <span className="font-mono font-semibold text-destructive">{bulkCode}</span> to confirm
              </Label>
              <Input
                id="bulkNewsConfirm"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value.toUpperCase())}
                placeholder="Enter the 6-character code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(false); setBulkInput(''); }} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmBulkDelete}
              disabled={bulkDeleting || bulkInput !== bulkCode}
            >
              {bulkDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {bulkDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 7: Run the bulk-delete tests to verify they pass**

Run: `bun run test src/pages/NewsManagement.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 8: Run the full test suite (regression check)**

Run: `bun run test`
Expected: PASS — no existing test broken (esp. `NewsManagement.buildAdvance.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add src/pages/NewsManagement.tsx src/pages/NewsManagement.test.tsx
git commit -m "$(cat <<'EOF'
feat(news): multi-select bulk delete with type-code confirm

Add checkbox row selection + selection toolbar + a 6-char type-to-confirm
dialog to NewsManagement. Bulk deletes via Promise.allSettled with an
ok/fail/mixed toast summary; gated on news.delete. Soft delete only,
no service changes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Selection wiring (state, `canDelete`, DataTable props, `clearSelection`) → Steps 3, 5. ✔
- Selection toolbar (count + Delete Selected + Clear) → Step 5. ✔
- Type-code confirm dialog (`genBulkCode`, disabled-until-match, spinner) → Steps 4, 6. ✔
- Bulk handler (`Promise.allSettled` + `summarizeBulk` + refetch) → Step 4. ✔
- Permission gate (no checkboxes without `news.delete`) → Steps 3, 5; test in Step 1. ✔
- Edge cases (partial failure warn, empty selection unreachable, wrong code disabled) → tests in Step 1. ✔
- No service / `ui/` changes → honored. ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✔

**Type consistency:** `selectedNews: News[]`, `newsService.delete(n.id)`, `summarizeBulk(results: PromiseSettledResult<unknown>[])`, `getRowId={(row) => row.id}` — names/types consistent across steps and match verified `DataTable` / service signatures. ✔

---

### Task 2: Bulk archive (add to the same selection infra)

**Depends on Task 1** (its selection + dialog are already committed). Line numbers below are the file's state after Task 1 (commit `7d14821`); if an anchor drifted, match on the code text, not the number.

**Files:**
- Modify: `src/pages/NewsManagement.tsx`
- Modify: `src/pages/NewsManagement.test.tsx`

**Task 2 Global Constraints (additional to the section above):**
- Archive = `newsService.update(id, { status: 'archived' })`. Gated on **`news.update`** (`canArchive`), independent from `canDelete`.
- Checkboxes show when the user can do **either** action: `canSelect = canDelete || canArchive`.
- `doc_version`: for archive only, send `getDocVersion(n)` **only when present** (`dv != null`). Delete never sends it.
- One mode-aware `Dialog` for both actions (`bulkMode: 'delete' | 'archive'`) — do not add a second dialog. Rename `bulkDeleting` → `bulkBusy`.
- Toast copy: `Deleted N news article(s)` / `Archived N news article(s)`; all-fail `Failed to delete N…` / `Failed to archive N…`; mixed `Deleted X, Y failed` / `Archived X, Y failed`.

**Interfaces:**
- Consumes (existing, verified): `newsService.update(id: string, data: Partial<News>, image?: File): Promise<unknown>`; `getDocVersion(record): number | undefined` from `../utils/docVersion`; `News.doc_version?: number`; `NewsStatus` includes `'archived'`; lucide `Archive` icon.

- [ ] **Step 1: Extend the test file with failing archive tests**

In `src/pages/NewsManagement.test.tsx`, add `update: vi.fn()` to the `newsService` mock:

```tsx
vi.mock('../services/newsService', () => ({
  default: { getAll: vi.fn(), getTags: vi.fn(), delete: vi.fn(), update: vi.fn() },
}));
```

Then append a new `describe` block after the existing `describe('NewsManagement bulk delete', …)` block (reuses the module-level `makeLocalStorage`, `renderPage`, `NEWS`):

```tsx
const NEWS_DV = [
  { id: 'n1', title: 'Alpha', status: 'published', doc_version: 3 },
  { id: 'n2', title: 'Beta', status: 'draft' },
];

describe('NewsManagement bulk archive', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage());
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ hasPermission: () => true } as never);
    vi.mocked(newsService.getAll).mockResolvedValue({
      data: NEWS_DV,
      paginate: { total: 2, page: 1, perpage: 10 },
    } as never);
    vi.mocked(newsService.getTags).mockResolvedValue([] as never);
    vi.mocked(newsService.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Archive but not Delete for a news.update-only user', async () => {
    vi.mocked(useAuth).mockReturnValue({ hasPermission: (k: string) => k === 'news.update' } as never);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    expect(await screen.findByRole('button', { name: /archive selected/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument();
  });

  it('archives every selected row with status archived, forwarding doc_version only when present', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await user.click(screen.getByRole('button', { name: /archive selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(newsService.update).toHaveBeenCalledTimes(2));
    expect(newsService.update).toHaveBeenCalledWith('n1', { status: 'archived', doc_version: 3 });
    expect(newsService.update).toHaveBeenCalledWith('n2', { status: 'archived' });
    expect(toast.success).toHaveBeenCalledWith('Archived 2 news article(s)');
    await waitFor(() => expect(screen.queryByText('2 selected')).not.toBeInTheDocument());
  });

  it('warns on partial archive failure', async () => {
    const user = userEvent.setup();
    vi.mocked(newsService.update)
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce({} as never);
    renderPage();
    await screen.findByText('Alpha');
    await user.click(screen.getByLabelText('Select Alpha'));
    await user.click(screen.getByLabelText('Select Beta'));
    await user.click(screen.getByRole('button', { name: /archive selected/i }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByText(/^[A-Z0-9]{6}$/).textContent as string;
    await user.type(within(dialog).getByRole('textbox'), code);
    await user.click(within(dialog).getByRole('button', { name: /^archive$/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('Archived 1, 1 failed'));
  });
});
```

- [ ] **Step 2: Run to verify the archive tests fail**

Run: `bun run test src/pages/NewsManagement.test.tsx`
Expected: the 3 new archive tests FAIL (no "Archive Selected" button / `newsService.update` never called); existing delete tests still pass.

- [ ] **Step 3: Imports + permission + state**

In `src/pages/NewsManagement.tsx`:

Add `Archive` to the lucide import (line 14):

```tsx
import { Plus, Pencil, Trash2, MoreHorizontal, Filter, X, Download, Newspaper, Globe, Building2, Loader2, Archive } from 'lucide-react';
```

Add the `getDocVersion` import (after the `Input` import, line 21):

```tsx
import { getDocVersion } from '../utils/docVersion';
```

After `const canDelete = hasPermission('news.delete');` (line 63) add:

```tsx
  const canArchive = hasPermission('news.update');
  const canSelect = canDelete || canArchive;
```

Add `bulkMode` state and rename `bulkDeleting` → `bulkBusy`. Replace (lines 94-97):

```tsx
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCode, setBulkCode] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
```

with:

```tsx
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'delete' | 'archive'>('delete');
  const [bulkCode, setBulkCode] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
```

- [ ] **Step 4: Generalize the open helper, summary, and handler**

Replace `openBulkDelete` (lines 220-224):

```tsx
  const openBulkDelete = () => {
    setBulkCode(genBulkCode());
    setBulkInput('');
    setBulkOpen(true);
  };
```

with:

```tsx
  const openBulk = (mode: 'delete' | 'archive') => {
    setBulkMode(mode);
    setBulkCode(genBulkCode());
    setBulkInput('');
    setBulkOpen(true);
  };
```

Replace `summarizeBulk` (lines 226-232):

```tsx
  const summarizeBulk = (results: PromiseSettledResult<unknown>[]) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`Deleted ${ok} news article(s)`);
    else if (ok === 0) toast.error(`Failed to delete ${fail} news article(s)`);
    else toast.warning(`Deleted ${ok}, ${fail} failed`);
  };
```

with:

```tsx
  const summarizeBulk = (results: PromiseSettledResult<unknown>[], pastVerb: string, baseVerb: string) => {
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`${pastVerb} ${ok} news article(s)`);
    else if (ok === 0) toast.error(`Failed to ${baseVerb} ${fail} news article(s)`);
    else toast.warning(`${pastVerb} ${ok}, ${fail} failed`);
  };
```

Replace `handleConfirmBulkDelete` (lines 234-246):

```tsx
  const handleConfirmBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(selectedNews.map((n) => newsService.delete(n.id)));
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

with:

```tsx
  const handleConfirmBulk = async () => {
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        selectedNews.map((n) => {
          if (bulkMode === 'archive') {
            const dv = getDocVersion(n);
            return newsService.update(n.id, { status: 'archived', ...(dv != null ? { doc_version: dv } : {}) });
          }
          return newsService.delete(n.id);
        }),
      );
      if (bulkMode === 'archive') summarizeBulk(results, 'Archived', 'archive');
      else summarizeBulk(results, 'Deleted', 'delete');
      setBulkOpen(false);
      setBulkInput('');
      clearSelection();
      setPaginate((prev) => ({ ...prev })); // refetch
    } finally {
      setBulkBusy(false);
    }
  };
```

- [ ] **Step 5: Toolbar (Archive + Delete), skeleton, DataTable gate**

Replace the toolbar block (lines 514-527):

```tsx
                {canDelete && selectedNews.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedNews.length} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="destructive" size="sm" onClick={openBulkDelete}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
```

with:

```tsx
                {canSelect && selectedNews.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium">{selectedNews.length} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                      {canArchive && (
                        <Button variant="outline" size="sm" onClick={() => openBulk('archive')}>
                          <Archive className="mr-2 h-4 w-4" />
                          Archive Selected
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="destructive" size="sm" onClick={() => openBulk('delete')}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Selected
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
```

Update the `TableSkeleton` column count (line 530): `canDelete` → `canSelect`:

```tsx
                  <TableSkeleton columns={canSelect ? 9 : 8} rows={paginate.perpage || 5} />
```

Update the `DataTable` selection gate (line 548): `enableRowSelection={canDelete}` → `enableRowSelection={canSelect}`.

- [ ] **Step 6: Make the dialog mode-aware**

Immediately before the page's `return (` statement (right after the `columns` `useMemo` closes, before `return (`), add:

```tsx
  const isArchive = bulkMode === 'archive';
```

Replace the entire `<Dialog open={bulkOpen} …> … </Dialog>` block (lines 573-620) with:

```tsx
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkBusy) { setBulkOpen(false); setBulkInput(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${isArchive ? '' : 'text-destructive'}`}>
              {isArchive ? <Archive className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
              {isArchive ? 'Archive' : 'Delete'} {selectedNews.length} News Article(s)
            </DialogTitle>
            <DialogDescription>
              {isArchive
                ? `This will archive ${selectedNews.length} selected news article(s). They can be un-archived later by editing each article.`
                : `This will delete ${selectedNews.length} selected news article(s). This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`max-h-40 overflow-y-auto rounded-md border px-3 py-2 space-y-1 ${isArchive ? 'border-border bg-muted/50' : 'border-destructive/30 bg-destructive/5'}`}>
              {selectedNews.map((n) => (
                <div key={n.id} className="text-sm font-medium">{n.title || '(untitled)'}</div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulkNewsConfirm">
                Type <span className={`font-mono font-semibold ${isArchive ? '' : 'text-destructive'}`}>{bulkCode}</span> to confirm
              </Label>
              <Input
                id="bulkNewsConfirm"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value.toUpperCase())}
                placeholder="Enter the 6-character code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkOpen(false); setBulkInput(''); }} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button
              variant={isArchive ? 'default' : 'destructive'}
              size="sm"
              onClick={handleConfirmBulk}
              disabled={bulkBusy || bulkInput !== bulkCode}
            >
              {bulkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isArchive ? <Archive className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />)}
              {bulkBusy ? (isArchive ? 'Archiving...' : 'Deleting...') : (isArchive ? 'Archive' : 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 7: Run the archive tests + full delete tests**

Run: `bun run test src/pages/NewsManagement.test.tsx`
Expected: PASS — all delete + archive tests green (10 total).

- [ ] **Step 8: Run the full suite**

Run: `bun run test`
Expected: PASS — no regression.

- [ ] **Step 9: Commit**

```bash
git add src/pages/NewsManagement.tsx src/pages/NewsManagement.test.tsx
git commit -m "$(cat <<'EOF'
feat(news): add bulk archive alongside bulk delete

Generalize the type-code bulk dialog into a mode-aware delete|archive.
Archive sets status='archived' via newsService.update, gated on
news.update, forwarding doc_version only when the list row carries one.
Checkboxes show when the user can delete or archive.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Task 2 Self-Review

**Spec coverage (addendum):** `canArchive`/`news.update` gate (Step 3); `canSelect` selection visibility (Steps 3, 5); Archive Selected toolbar button (Step 5); mode-aware dialog (Step 6); `handleConfirmBulk` archive branch + `doc_version` when present (Step 4); parameterized `summarizeBulk` toast copy (Step 4); tests (Step 1). ✔

**Placeholder scan:** every step shows complete code. ✔

**Type consistency:** `bulkMode: 'delete' | 'archive'`, `bulkBusy`/`setBulkBusy` (renamed consistently across state, dialog, handler, Cancel button), `openBulk(mode)`, `summarizeBulk(results, pastVerb, baseVerb)`, `handleConfirmBulk`, `getDocVersion(n)` → `Partial<News>` payload — consistent across all steps and match verified `newsService.update` / `getDocVersion` signatures. Old names (`openBulkDelete`, `handleConfirmBulkDelete`, `bulkDeleting`) fully replaced. ✔
