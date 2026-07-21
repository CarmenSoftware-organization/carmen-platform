# Responsive Card View for DataTable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below `lg` (1024px), the shared `DataTable` renders one card per row instead of a horizontally scrolling table; every management page benefits, clusters gets polished hints.

**Architecture:** A new `useMediaQuery` hook drives a single-branch render in `DataTable` — table on desktop, a `MobileCardList` on smaller screens. `MobileCardList` reuses the same TanStack `table` instance and `flexRender`, so every cell renders identically; it places cells by `column.id` / `meta.card` hints. Clusters columns gain `meta.card` hints.

**Tech Stack:** React 19 + TypeScript, TanStack Table v8, Tailwind, Vitest + React Testing Library (jsdom).

## Global Constraints

- Package manager: **Bun**. Run tests with `bun run test`; production build with `bun run build`.
- Tests: Vitest with **explicit imports** (no globals), co-located `*.test.ts(x)` beside source, assert behavior/roles/text (no snapshots).
- Breakpoint query is exactly `(min-width: 1024px)` — desktop = table.
- `meta.card` vocabulary is exactly `'title' | 'badge' | 'hidden' | 'actions'`.
- Modifying `src/components/ui/data-table.tsx` (a `ui/` primitive) is explicitly in scope for this plan.
- camelCase in code; Tailwind design tokens (`bg-card`, `border-border`, `text-muted-foreground`, `shadow-[var(--shadow-xs)]`) — no raw hex, no raw green for status.
- Run `bun run build` before the final commit (CLAUDE.md: build check for `.ts`/`.tsx`).

---

### Task 1: `useMediaQuery` hook

**Files:**
- Create: `src/hooks/useMediaQuery.ts`
- Test: `src/hooks/useMediaQuery.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useMediaQuery(query: string): boolean` — reactive CSS media-query match; the initial value is read synchronously from `window.matchMedia(query).matches`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useMediaQuery.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

type Listener = () => void;

// A controllable matchMedia stub whose result the test can flip at runtime.
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() { return matches; },
    media: '',
    addEventListener: (_: string, cb: Listener) => { listeners.add(cb); },
    removeEventListener: (_: string, cb: Listener) => { listeners.delete(cb); },
    _set(next: boolean) { matches = next; listeners.forEach((cb) => cb()); },
  };
  vi.stubGlobal('matchMedia', (q: string) => { mql.media = q; return mql; });
  return mql;
}

describe('useMediaQuery', () => {
  it('returns the initial match synchronously', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query result changes', () => {
    const mql = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);

    act(() => { mql._set(true); });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/hooks/useMediaQuery.test.ts`
Expected: FAIL — `Failed to resolve import "./useMediaQuery"` (module does not exist yet).

- [ ] **Step 3: Write the hook**

Create `src/hooks/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react';

// Reactive CSS media-query match. The lazy initializer reads the current match
// synchronously, so the first paint is already correct (no layout flash on mount).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/hooks/useMediaQuery.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMediaQuery.ts src/hooks/useMediaQuery.test.ts
git commit -m "feat(hooks): add useMediaQuery hook"
```

---

### Task 2: DataTable card rendering + matchMedia test polyfill

**Files:**
- Modify: `src/components/ui/data-table.tsx`
- Modify: `vitest.setup.ts`
- Test: `src/components/ui/data-table.test.tsx` (create)

**Interfaces:**
- Consumes: `useMediaQuery(query)` from `src/hooks/useMediaQuery.ts`.
- Produces:
  - Two new optional `DataTableProps` fields: `mobileCards?: boolean` (default `true`), `mobileBreakpoint?: string` (default `'(min-width: 1024px)'`).
  - Card placement contract read from each column: skip `id: 'rowIndex'` and `meta.card === 'hidden'`; `id: 'select'` → top-left checkbox; `id: 'actions'` or `meta.card === 'actions'` → top-right; `meta.card === 'title'` → title line; `meta.card === 'badge'` → chip; everything else → `label : value` row (label = the column's string `header`).
  - A default `window.matchMedia` polyfill in `vitest.setup.ts` where `(min-width: …)` queries match (desktop → table), so existing tests keep asserting the table.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/data-table.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

type Row = { id: string; code: string; name: string; active: boolean };

const data: Row[] = [{ id: '1', code: 'HQ-01', name: 'Head Office', active: true }];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'code', header: 'Code', meta: { card: 'title' } },
  { accessorKey: 'name', header: 'Name', meta: { card: 'title' } },
  {
    accessorKey: 'active',
    header: 'Status',
    meta: { card: 'badge' },
    cell: ({ row }) => <span>{row.original.active ? 'Active' : 'Inactive'}</span>,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <button aria-label={`Actions for ${row.original.name}`}>menu</button>,
  },
];

// Each test sets the viewport before rendering; useMediaQuery reads matchMedia
// synchronously in its lazy initializer, so the stub must exist first.
function setViewport(isDesktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width/.test(query) ? isDesktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('DataTable responsive card view', () => {
  it('renders a table on desktop', () => {
    setViewport(true);
    const { container } = render(<DataTable columns={columns} data={data} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('renders cards (no table) below the breakpoint', () => {
    setViewport(false);
    const { container } = render(<DataTable columns={columns} data={data} />);
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('HQ-01')).toBeInTheDocument();
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /actions for head office/i })).toBeInTheDocument();
  });

  it('keeps a per-row selection checkbox in card mode', () => {
    setViewport(false);
    render(<DataTable columns={columns} data={data} enableRowSelection getRowId={(r) => r.id} />);
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('falls back to the table when mobileCards is disabled', () => {
    setViewport(false);
    const { container } = render(<DataTable columns={columns} data={data} mobileCards={false} />);
    expect(container.querySelector('table')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/components/ui/data-table.test.tsx`
Expected: FAIL — the "renders cards (no table)" test fails because `DataTable` still always renders a `<table>` (so `container.querySelector('table')` is not null).

- [ ] **Step 3: Add the `matchMedia` polyfill to `vitest.setup.ts`**

Append to `vitest.setup.ts` (after the existing `IntersectionObserver` stub):

```ts
// jsdom has no matchMedia. useDarkMode (prefers-color-scheme) and DataTable's
// useMediaQuery both call it. Default: width queries match (desktop → table view)
// so existing management-page tests keep asserting the table; other queries
// (e.g. prefers-color-scheme: dark) do not match → light theme. Individual tests
// override this via vi.stubGlobal to exercise the mobile card view.
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: /min-width/.test(query),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));
```

- [ ] **Step 4: Implement card rendering in `src/components/ui/data-table.tsx`**

1. Extend the type imports from `@tanstack/react-table` (the existing import block, lines ~2-14) to also import the table type. Change the closing of that import to include:

```ts
  type RowSelectionState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
```

2. Add the hook import near the top (after the `cn` import, line ~24):

```ts
import { useMediaQuery } from '../../hooks/useMediaQuery';
```

3. Add a card-role type just above `interface DataTableProps` (line ~70):

```ts
type CardRole = 'title' | 'badge' | 'hidden' | 'actions';
```

4. Add two fields to `interface DataTableProps<TData>` (after `stickyLeftColumns?: 2 | 3 | 4;`, line ~96):

```ts
  // Below `mobileBreakpoint` the table is replaced by one card per row. Default on.
  mobileCards?: boolean;
  mobileBreakpoint?: string;
```

5. Add the two params with defaults to the destructured props (after `stickyLeftColumns = 2,`, line ~118):

```ts
  mobileCards = true,
  mobileBreakpoint = '(min-width: 1024px)',
```

6. Compute the layout choice — add just before `const totalDisplay = ...` (line ~277):

```ts
  const isDesktop = useMediaQuery(mobileBreakpoint);
  const showCards = mobileCards && !isDesktop;
```

7. In the returned JSX, wrap the existing table block in the `showCards` branch. Replace the opening of the table wrapper — the current:

```tsx
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <Table ref={tableRef} className={cn(
```

with:

```tsx
      {showCards ? (
        <MobileCardList table={table} />
      ) : (
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <Table ref={tableRef} className={cn(
```

and close it — change the existing table-wrapper closing:

```tsx
        </Table>
      </div>
```

to:

```tsx
        </Table>
      </div>
      )}
```

(The sticky-pagination `<div>` that follows stays outside this conditional — pagination renders in both modes. The `useLayoutEffect` that measures sticky columns is a no-op in card mode because `tableRef.current` is null.)

8. Add the `MobileCardList` component at the bottom of the file, just before `export { DataTable };`:

```tsx
function MobileCardList<TData>({ table }: { table: TanstackTable<TData> }) {
  const rows = table.getRowModel().rows;
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">No results found</div>;
  }
  return (
    <div className="space-y-3 py-1">
      {rows.map((row) => {
        const allCells = row.getVisibleCells();
        const titleCells: typeof allCells = [];
        const badgeCells: typeof allCells = [];
        const rowCells: typeof allCells = [];
        let actionsCell: (typeof allCells)[number] | null = null;
        let selectCell: (typeof allCells)[number] | null = null;

        for (const cell of allCells) {
          const colId = cell.column.id;
          const role = (cell.column.columnDef.meta as { card?: CardRole } | undefined)?.card;
          if (colId === 'rowIndex' || role === 'hidden') continue;
          if (colId === 'select') { selectCell = cell; continue; }
          if (colId === 'actions' || role === 'actions') { actionsCell = cell; continue; }
          if (role === 'title') { titleCells.push(cell); continue; }
          if (role === 'badge') { badgeCells.push(cell); continue; }
          rowCells.push(cell);
        }

        const hasHeader = !!(selectCell || titleCells.length || badgeCells.length || actionsCell);

        return (
          <div key={row.id} className="rounded-lg border border-border bg-card p-4 text-sm shadow-[var(--shadow-xs)]">
            {hasHeader && (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  {selectCell && (
                    <div className="pt-0.5">
                      {flexRender(selectCell.column.columnDef.cell, selectCell.getContext())}
                    </div>
                  )}
                  <div className="min-w-0 space-y-1">
                    {titleCells.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium">
                        {titleCells.map((cell, i) => (
                          <React.Fragment key={cell.id}>
                            {i > 0 && <span className="text-muted-foreground">&middot;</span>}
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    {badgeCells.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {badgeCells.map((cell) => (
                          <React.Fragment key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {actionsCell && (
                  <div className="-mr-1 shrink-0">
                    {flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}
                  </div>
                )}
              </div>
            )}
            {rowCells.length > 0 && (
              <dl className={cn('space-y-1.5', hasHeader && 'mt-3')}>
                {rowCells.map((cell) => {
                  const header = cell.column.columnDef.header;
                  const label = typeof header === 'string' ? header : null;
                  return (
                    <div key={cell.id} className="flex items-baseline justify-between gap-3">
                      {label ? <dt className="shrink-0 text-muted-foreground">{label}</dt> : null}
                      <dd className={cn('min-w-0 tabular-nums', label ? 'text-right' : 'w-full text-left')}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run the DataTable test to verify it passes**

Run: `bun run test src/components/ui/data-table.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `bun run test`
Expected: PASS — all existing suites still green (they default to desktop via the `vitest.setup.ts` polyfill, so table assertions hold).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/data-table.tsx src/components/ui/data-table.test.tsx vitest.setup.ts
git commit -m "feat(data-table): render cards instead of a table below lg"
```

---

### Task 3: Clusters `meta.card` hints

**Files:**
- Modify: `src/pages/ClusterManagement.tsx`
- Modify: `src/pages/ClusterManagement.test.tsx`

**Interfaces:**
- Consumes: the `meta.card` card-placement contract from Task 2.
- Produces: nothing new — declarative column hints only.

- [ ] **Step 1: Write the failing test**

In `src/pages/ClusterManagement.test.tsx`, add a reset line to the existing file-level `beforeEach` so a mobile override in one test cannot leak into the next. Change the `beforeEach` block (lines ~61-67) to add, as its last statement:

```ts
  // Default every test to desktop (table). The mobile-card test below overrides
  // this within its own body; this line resets it for the following tests.
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
```

Then append a new describe at the end of the file:

```tsx
describe('ClusterManagement — mobile card view', () => {
  const setMobile = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
    }));

  it('renders clusters as cards (no table) with title/badge hints applied', async () => {
    setMobile();
    const { container } = renderPage();
    await screen.findByText('Acme Hotels');

    // No table element in card mode.
    expect(container.querySelector('table')).toBeNull();
    // Status is promoted to a badge, and the row actions menu is still reachable.
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /actions for acme hotels/i })).toBeInTheDocument();
    // Code + Name are promoted to the card title, so no "Code" label row is rendered.
    // (Without the meta.card:'title' hint they would appear as a labelled row.)
    expect(screen.queryByText('Code')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/pages/ClusterManagement.test.tsx`
Expected: FAIL — `expect(screen.queryByText('Code')).toBeNull()` fails, because without hints the `code` column renders as a labelled `Code : ACME` row in card mode.

- [ ] **Step 3: Add the hints in `src/pages/ClusterManagement.tsx`**

In the `columns` `useMemo` (starts line ~261), edit these three column definitions:

`code` — add `card: 'title'` to its existing `meta`:

```tsx
      meta: { headerClassName: 'w-24', cellClassName: 'w-24', card: 'title' },
```

`name` — it has no `meta` today; add one:

```tsx
    {
      accessorKey: 'name',
      header: 'Name',
      meta: { card: 'title' },
      cell: ({ row }) => (
```

`is_active` — add `card: 'badge'` to its existing `meta`:

```tsx
      meta: { headerClassName: 'w-32', cellClassName: 'w-32', card: 'badge' },
```

`updated_at` — it has no `meta` today; add one to hide it on cards (full audit lives on the edit page):

```tsx
      accessorKey: 'updated_at',
      id: 'updated_at',
      header: 'Updated',
      meta: { card: 'hidden' },
      cell: ({ row }) => {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test src/pages/ClusterManagement.test.tsx`
Expected: PASS — all existing ClusterManagement tests plus the new mobile-card test.

- [ ] **Step 5: Run the full suite and the production build**

Run: `bun run test`
Expected: PASS (whole suite).

Run: `bun run build`
Expected: build succeeds with no TypeScript errors (catches unused imports / type issues in the touched files).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ClusterManagement.tsx src/pages/ClusterManagement.test.tsx
git commit -m "feat(clusters): mobile card title/badge hints for the list table"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| `useMediaQuery` hook, lazy init, no flash | Task 1 |
| `DataTable` `mobileCards` / `mobileBreakpoint` props | Task 2 (Step 4.4-4.5) |
| Single-branch render (table *or* cards), no CSS double-mount | Task 2 (Step 4.6-4.7) |
| Column → card placement rules (`#`/select/actions/title/badge/hidden/default) | Task 2 (Step 4.8, `MobileCardList`) |
| Reuse `table` instance + `flexRender` | Task 2 (Step 4.8) |
| Row-selection checkbox in card mode | Task 2 (Step 1 test 3, Step 4.8 `selectCell`) |
| `vitest.setup.ts` matchMedia polyfill (default desktop) | Task 2 (Step 3) |
| "No results" in card mode | Task 2 (Step 4.8 empty branch) |
| Pagination footer reused in both modes | Task 2 (Step 4.7 — footer left outside the conditional) |
| Clusters hints (code/name title, is_active badge, updated hidden) | Task 3 (Step 3) |
| Breakpoint `< lg (1024px)` | Global Constraints + default `mobileBreakpoint` |

Out-of-scope items (mobile sort control, card skeleton, other-page hints, whole-card tap) are intentionally absent — no task, by design.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code.

**3. Type consistency:** `useMediaQuery(query: string): boolean` — defined Task 1, consumed Task 2 Step 4.6 with the same signature. `CardRole` union `'title' | 'badge' | 'hidden' | 'actions'` — defined Task 2 Step 4.3, matches the `meta.card` values used in Task 3 (`'title'`, `'badge'`, `'hidden'`) and the placement reads in `MobileCardList`. Props `mobileCards` / `mobileBreakpoint` — declared (Step 4.4), destructured (Step 4.5), used (Step 4.6) consistently. `TanstackTable<TData>` import name matches the `MobileCardList` prop type.
