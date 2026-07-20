# Cluster Edit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/clusters/:id/edit` as a sticky-sidenav + scrollspy, edit-in-place page with searchable/filterable/sortable, inline-editable, bulk-actionable Business Unit and User tables, decomposed into focused files under `src/pages/clusterEdit/`.

**Architecture:** `ClusterEdit.tsx` becomes a thin orchestrator (load/save cluster + compose sections). New units live in `src/pages/clusterEdit/`: a scrollspy nav, five sections, a users hook, and three reusable table primitives (toolbar, bulk bar, inline cell). Existing capacity/branding/identity primitives are reused as-is; identity fields are re-rendered through the existing `InlineField` control.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Tailwind 3.4 (HSL tokens), shadcn/ui, react-router-dom v6, Vitest + React Testing Library + `@testing-library/user-event`, sonner, lucide-react.

## Global Constraints

- **No new libraries.** Reuse what exists (rule 6).
- **No backend changes.** Bulk actions = N sequential requests over existing single-record endpoints.
- **Naming:** camelCase in code; snake_case only on the wire. IDs via query params, not path (backend contract already met by existing endpoints).
- **Every catch** uses `getErrorDetail(err)` / `parseApiError(err)` + `toast.error` (rule 12); never `alert`/`window.confirm` — use `toast.*` + `<ConfirmDialog>` (rule 3).
- **`doc_version` optimistic locking (rule 17):** dedicated `docVersion` state (never in `formData`); send only when present; `isVersionConflict(err)` → `notifyVersionConflict()` + refetch.
- **Permissions:** every write surface gated by `cluster.update` (scoped to `clusterId`) or `cluster.create`. `canEdit = hasPermission('cluster.update', { clusterId: id })`.
- **Status colors** via `<Badge variant="success" | "secondary">`, never raw green (rule 5).
- **Dev-only** code wrapped in `process.env.NODE_ENV === 'development'` (rule 7).
- **Column defs / derived lists** in `useMemo` with correct deps (rule 8).
- **Tests:** co-located `*.test.ts(x)`, explicit `vitest` imports (no globals), assert behavior not snapshots (rule 18).
- **`bun run build` must pass** (no unused imports/vars) before the final commit.
- **Reuse** `utils/capacity` (`utilization`, `CapLevel`), `CapacityGauge`, `CapacityMeter`, `ClusterHero`, `BrandingImageUpload`, `InlineField`, `PageHeader`, `Can`, `ConfirmDialog`, `EmptyState`, `DevDebugSheet`, `useUnsavedChanges`, `useGlobalShortcuts`, `docVersion` helpers.

## Section IDs (scrollspy anchors)

`'overview'`, `'details'`, `'branding'`, `'business-units'`, `'users'` — used as DOM `id`s and nav keys throughout.

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/clusterEdit/useScrollSpy.ts` | IntersectionObserver → active section id; `scrollTo(id)` |
| `src/pages/clusterEdit/tableSort.ts` | `SortState`, `cycleSort`, `compareValues`, `sortRows` |
| `src/pages/clusterEdit/TableToolbar.tsx` | search input + filter chips + optional right slot (presentational) |
| `src/pages/clusterEdit/BulkActionBar.tsx` | floating selection bar (count, clear, actions) |
| `src/pages/clusterEdit/InlineCell.tsx` | cell-level edit-in-place select |
| `src/pages/clusterEdit/useClusterUsers.ts` | cluster-user state + add/edit/remove/bulk handlers |
| `src/pages/clusterEdit/ClusterEditNav.tsx` | sticky sidenav (desktop) / chip row (mobile) |
| `src/pages/clusterEdit/sections/DetailsSection.tsx` | identity + licensing (InlineField, gated) |
| `src/pages/clusterEdit/sections/BrandingSection.tsx` | logo + avatar upload |
| `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx` | BU table + toolbar |
| `src/pages/clusterEdit/sections/UsersSection.tsx` | Users table + toolbar + bulk bar + inline cells |
| `src/pages/ClusterEdit.tsx` | **rewritten** orchestrator |
| `src/pages/ClusterEdit.test.tsx` | **updated** integration tests |

---

### Task 1: `useScrollSpy` hook

**Files:**
- Create: `src/pages/clusterEdit/useScrollSpy.ts`
- Test: `src/pages/clusterEdit/useScrollSpy.test.ts`

**Interfaces:**
- Produces: `useScrollSpy(ids: string[], opts?: { rootMargin?: string }): { activeId: string; scrollTo: (id: string) => void }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/useScrollSpy.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSpy } from './useScrollSpy';

type IOEntry = { target: Element; isIntersecting: boolean; intersectionRatio: number };
let ioCallback: (entries: IOEntry[]) => void;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  class MockIO {
    constructor(cb: (entries: IOEntry[]) => void) { ioCallback = cb; }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', MockIO as unknown as typeof IntersectionObserver);
  // Provide observable elements.
  for (const id of ['a', 'b']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useScrollSpy', () => {
  it('defaults activeId to the first id and observes each element', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    expect(result.current.activeId).toBe('a');
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('updates activeId when a section intersects', () => {
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    act(() => {
      ioCallback([{ target: document.getElementById('b')!, isIntersecting: true, intersectionRatio: 1 }]);
    });
    expect(result.current.activeId).toBe('b');
  });

  it('scrollTo calls scrollIntoView on the target element', () => {
    const spy = vi.fn();
    document.getElementById('b')!.scrollIntoView = spy;
    const { result } = renderHook(() => useScrollSpy(['a', 'b']));
    act(() => result.current.scrollTo('b'));
    expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/useScrollSpy.test.ts`
Expected: FAIL — `useScrollSpy` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/pages/clusterEdit/useScrollSpy.ts
import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks which section is in view via IntersectionObserver and smooth-scrolls to a
 * section on demand. `ids` are DOM element ids rendered by the sections.
 */
export function useScrollSpy(ids: string[], opts?: { rootMargin?: string }) {
  const [activeId, setActiveId] = useState(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first entry that is intersecting, in document order of `ids`.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const byId = new Map(visible.map((e) => [(e.target as HTMLElement).id, true]));
        const next = ids.find((id) => byId.has(id));
        if (next) setActiveId(next);
      },
      { rootMargin: opts?.rootMargin ?? '-45% 0px -50% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|'), opts?.rootMargin]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActiveId(id);
  }, []);

  return { activeId, scrollTo };
}
```

Note: the `scrollTo` test does not stub `matchMedia`; jsdom returns `undefined` for `window.matchMedia?.(...)` so `reduce` is falsy and `behavior` is `'smooth'` — matching the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/useScrollSpy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/useScrollSpy.ts src/pages/clusterEdit/useScrollSpy.test.ts
git commit -m "feat(cluster-edit): add useScrollSpy hook for section navigation"
```

---

### Task 2: `tableSort` helpers + `TableToolbar`

**Files:**
- Create: `src/pages/clusterEdit/tableSort.ts`
- Create: `src/pages/clusterEdit/TableToolbar.tsx`
- Test: `src/pages/clusterEdit/tableSort.test.ts`
- Test: `src/pages/clusterEdit/TableToolbar.test.tsx`

**Interfaces:**
- Produces (`tableSort.ts`):
  - `type SortDir = 'asc' | 'desc'`
  - `interface SortState { key: string; dir: SortDir }`
  - `cycleSort(current: SortState | null, key: string): SortState | null` — none→asc→desc→none
  - `compareValues(a: unknown, b: unknown): number`
  - `sortRows<T>(rows: T[], state: SortState | null, accessor: (row: T, key: string) => unknown): T[]`
- Produces (`TableToolbar.tsx`):
  - `interface FilterChip { key: string; label: string; active: boolean; onToggle: () => void }`
  - `interface TableToolbarProps { search: string; onSearchChange: (v: string) => void; placeholder?: string; filters?: FilterChip[]; right?: React.ReactNode }`
  - `export function TableToolbar(props: TableToolbarProps): JSX.Element`

- [ ] **Step 1: Write the failing test for tableSort**

```ts
// src/pages/clusterEdit/tableSort.test.ts
import { describe, it, expect } from 'vitest';
import { cycleSort, compareValues, sortRows } from './tableSort';

describe('cycleSort', () => {
  it('goes none -> asc -> desc -> none for the same key', () => {
    let s = cycleSort(null, 'name');
    expect(s).toEqual({ key: 'name', dir: 'asc' });
    s = cycleSort(s, 'name');
    expect(s).toEqual({ key: 'name', dir: 'desc' });
    s = cycleSort(s, 'name');
    expect(s).toBeNull();
  });
  it('resets to asc when a different key is clicked', () => {
    expect(cycleSort({ key: 'name', dir: 'desc' }, 'code')).toEqual({ key: 'code', dir: 'asc' });
  });
});

describe('compareValues', () => {
  it('compares numbers numerically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
  });
  it('compares strings case-insensitively', () => {
    expect(compareValues('Bravo', 'alpha')).toBeGreaterThan(0);
  });
  it('treats null/undefined as empty string', () => {
    expect(compareValues(null, 'a')).toBeLessThan(0);
  });
});

describe('sortRows', () => {
  const rows = [{ n: 'b', c: 2 }, { n: 'a', c: 1 }, { n: 'c', c: 3 }];
  const acc = (r: { n: string; c: number }, key: string) => (key === 'n' ? r.n : r.c);
  it('returns input unchanged when state is null', () => {
    expect(sortRows(rows, null, acc)).toBe(rows);
  });
  it('sorts ascending', () => {
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, acc).map((r) => r.n)).toEqual(['a', 'b', 'c']);
  });
  it('sorts descending without mutating the source', () => {
    const out = sortRows(rows, { key: 'c', dir: 'desc' }, acc).map((r) => r.c);
    expect(out).toEqual([3, 2, 1]);
    expect(rows[0].n).toBe('b'); // unchanged
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/tableSort.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tableSort**

```ts
// src/pages/clusterEdit/tableSort.ts
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

/** Header-click cycle: unsorted → asc → desc → unsorted. A new key starts at asc. */
export function cycleSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').toLowerCase().localeCompare(String(b ?? '').toLowerCase());
}

export function sortRows<T>(
  rows: T[],
  state: SortState | null,
  accessor: (row: T, key: string) => unknown,
): T[] {
  if (!state) return rows;
  const sorted = [...rows].sort((r1, r2) => compareValues(accessor(r1, state.key), accessor(r2, state.key)));
  return state.dir === 'desc' ? sorted.reverse() : sorted;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/tableSort.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for TableToolbar**

```tsx
// src/pages/clusterEdit/TableToolbar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableToolbar } from './TableToolbar';

describe('TableToolbar', () => {
  it('calls onSearchChange as the user types', async () => {
    const onSearchChange = vi.fn();
    render(<TableToolbar search="" onSearchChange={onSearchChange} placeholder="Search units" />);
    await userEvent.type(screen.getByPlaceholderText('Search units'), 'ho');
    expect(onSearchChange).toHaveBeenLastCalledWith('o'); // last keystroke value (controlled by parent)
  });

  it('renders filter chips and toggles them', async () => {
    const onToggle = vi.fn();
    render(
      <TableToolbar
        search=""
        onSearchChange={() => {}}
        filters={[{ key: 'active', label: 'Active', active: false, onToggle }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('marks an active chip with aria-pressed', () => {
    render(
      <TableToolbar
        search=""
        onSearchChange={() => {}}
        filters={[{ key: 'active', label: 'Active', active: true, onToggle: () => {} }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

Note on the first assertion: `search` is controlled by the parent (stays `""`), so each keystroke fires `onSearchChange` with just that character; `userEvent.type('ho')` ends with `'o'`.

- [ ] **Step 6: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/TableToolbar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement TableToolbar**

```tsx
// src/pages/clusterEdit/TableToolbar.tsx
import { Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';

export interface FilterChip {
  key: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}

export interface TableToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder?: string;
  filters?: FilterChip[];
  right?: React.ReactNode;
}

/**
 * Presentational search + filter-chip row for the in-page BU / Users tables.
 * Filtering/sorting logic stays in the section (client-side over already-loaded
 * data), so search here is instant — no debounce needed without a network round-trip.
 */
export function TableToolbar({ search, onSearchChange, placeholder, filters, right }: TableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder ?? 'Search...'}
            className="pl-9"
          />
        </div>
        {filters && filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={f.active}
                onClick={f.onToggle}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  f.active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/TableToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pages/clusterEdit/tableSort.ts src/pages/clusterEdit/tableSort.test.ts src/pages/clusterEdit/TableToolbar.tsx src/pages/clusterEdit/TableToolbar.test.tsx
git commit -m "feat(cluster-edit): add table sort helpers and TableToolbar"
```

---

### Task 3: `BulkActionBar`

**Files:**
- Create: `src/pages/clusterEdit/BulkActionBar.tsx`
- Test: `src/pages/clusterEdit/BulkActionBar.test.tsx`

**Interfaces:**
- Produces:
  - `interface BulkAction { key: string; label: string; icon?: LucideIcon; variant?: 'default' | 'destructive' | 'outline'; disabled?: boolean; onClick: () => void }`
  - `interface BulkActionBarProps { count: number; onClear: () => void; actions: BulkAction[] }`
  - `export function BulkActionBar(props: BulkActionBarProps): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/BulkActionBar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionBar } from './BulkActionBar';

describe('BulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<BulkActionBar count={0} onClear={() => {}} actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and fires an action', async () => {
    const onClick = vi.fn();
    render(
      <BulkActionBar
        count={3}
        onClear={() => {}}
        actions={[{ key: 'remove', label: 'Remove', onClick }]}
      />,
    );
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('clears the selection', async () => {
    const onClear = vi.fn();
    render(<BulkActionBar count={2} onClear={onClear} actions={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/BulkActionBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BulkActionBar**

```tsx
// src/pages/clusterEdit/BulkActionBar.tsx
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/button';

export interface BulkAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'destructive' | 'outline';
  disabled?: boolean;
  onClick: () => void;
}

export interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}

/** A compact selection bar shown above a table when one or more rows are selected. */
export function BulkActionBar({ count, onClear, actions }: BulkActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="bg-primary/5 border-primary/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Clear selection" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
        <span className="font-medium">{count} selected</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button
              key={a.key}
              size="sm"
              variant={a.variant ?? 'outline'}
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {Icon && <Icon className="mr-2 h-4 w-4" />}
              {a.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/BulkActionBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/BulkActionBar.tsx src/pages/clusterEdit/BulkActionBar.test.tsx
git commit -m "feat(cluster-edit): add BulkActionBar for multi-row selection"
```

---

### Task 4: `InlineCell`

**Files:**
- Create: `src/pages/clusterEdit/InlineCell.tsx`
- Test: `src/pages/clusterEdit/InlineCell.test.tsx`

**Interfaces:**
- Produces:
  - `interface InlineCellOption { value: string; label: string; disabled?: boolean }`
  - `interface InlineCellProps { value: string; display: React.ReactNode; options: InlineCellOption[]; ariaLabel: string; disabled?: boolean; onCommit: (value: string) => void }`
  - `export function InlineCell(props: InlineCellProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/InlineCell.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineCell } from './InlineCell';

const opts = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

describe('InlineCell', () => {
  it('shows the display node in read mode and opens a select on click', async () => {
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" onCommit={() => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /role/i }));
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
  });

  it('commits a changed value', async () => {
    const onCommit = vi.fn();
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" onCommit={onCommit} />);
    await userEvent.click(screen.getByRole('button', { name: /role/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'admin');
    expect(onCommit).toHaveBeenCalledWith('admin');
  });

  it('does not render a trigger button when disabled', () => {
    render(<InlineCell value="user" display={<span>User</span>} options={opts} ariaLabel="Role" disabled onCommit={() => {}} />);
    expect(screen.queryByRole('button', { name: /role/i })).toBeNull();
    expect(screen.getByText('User')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/InlineCell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement InlineCell**

```tsx
// src/pages/clusterEdit/InlineCell.tsx
import { useState } from 'react';
import { cn } from '../../lib/utils';

export interface InlineCellOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface InlineCellProps {
  value: string;
  display: React.ReactNode;
  options: InlineCellOption[];
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

const selectClass =
  'h-8 w-full max-w-[180px] rounded-md border border-primary bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Read-mode display that becomes a select on click; commits on change, reverts on Escape/blur. */
export function InlineCell({ value, display, options, ariaLabel, disabled, onCommit }: InlineCellProps) {
  const [editing, setEditing] = useState(false);

  if (disabled) return <>{display}</>;

  if (editing) {
    return (
      <select
        // eslint-disable-next-line jsx-a11y/no-autofocus -- edit-in-place: focus the field the user just opened
        autoFocus
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          setEditing(false);
          if (e.target.value !== value) onCommit(e.target.value);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        className={selectClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn('hover:bg-primary/5 -mx-1 rounded px-1 py-0.5 text-left transition-colors')}
    >
      {display}
    </button>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/InlineCell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/InlineCell.tsx src/pages/clusterEdit/InlineCell.test.tsx
git commit -m "feat(cluster-edit): add InlineCell for in-row select editing"
```

---

### Task 5: `useClusterUsers` hook

Extracts all cluster-user logic out of the page and adds bulk operations. Mirrors the shape of `src/pages/businessUnitEdit/useBusinessUnitUsers.ts`.

**Files:**
- Create: `src/pages/clusterEdit/useClusterUsers.ts`
- Test: `src/pages/clusterEdit/useClusterUsers.test.ts`

**Interfaces:**
- Consumes: `api` (`src/services/api`), `userService` (`getAll`), `getErrorDetail` (`src/utils/errorParser`), `toast` (sonner), types `ClusterUser` (`src/types`).
- Produces: `useClusterUsers(clusterId: string | undefined): ClusterUsersApi` where the returned object includes at least:
  - `clusterUsers: ClusterUser[]`, `usersLoading: boolean`, `rawUsersResponse: unknown`
  - `fetchClusterUsers(): Promise<void>`
  - `addUser(input: { userId: string; role: string; parentBuId?: string }): Promise<void>`
  - `updateUser(clusterUserId: string, patch: { role?: string; parent_bu_id?: string | null }): Promise<void>` (optimistic; rolls back on failure)
  - `removeUser(clusterUserId: string): Promise<void>`
  - `bulkRun(ids: string[], op: (id: string) => Promise<void>, label: string): Promise<{ ok: number; failed: number }>` — sequential, per-item catch, summary toast
  - search-users state for the add dialog: `searchUsers`, `searchUsersTerm`, `setSearchUsersTerm(v)`, `loadingSearchUsers`, `searchUsersTotal`, `loadMoreUsers()`, `hasMoreUsers`

- [ ] **Step 1: Write the failing test**

```ts
// src/pages/clusterEdit/useClusterUsers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../services/userService', () => ({ default: { getAll: vi.fn() } }));

import { useClusterUsers } from './useClusterUsers';
import api from '../../services/api';
import { toast } from 'sonner';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(api.get).mockResolvedValue({ data: { data: [{ id: 'cu1', user_id: 'u1', role: 'user' }] } });
});

describe('useClusterUsers', () => {
  it('fetches cluster users on mount', async () => {
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    expect(result.current.clusterUsers[0].id).toBe('cu1');
  });

  it('bulkRun runs sequentially, collects failures, and returns a summary', async () => {
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));

    const op = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    let summary: { ok: number; failed: number } | undefined;
    await act(async () => {
      summary = await result.current.bulkRun(['a', 'b', 'c'], op, 'update');
    });
    expect(op).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({ ok: 2, failed: 1 });
    expect(toast.success).toHaveBeenCalled();
  });

  it('removeUser calls DELETE and refetches', async () => {
    asMock(api.delete).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useClusterUsers('c1'));
    await waitFor(() => expect(result.current.clusterUsers).toHaveLength(1));
    await act(async () => { await result.current.removeUser('cu1'); });
    expect(api.delete).toHaveBeenCalledWith('/api-system/user/clusters/cu1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/useClusterUsers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/pages/clusterEdit/useClusterUsers.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import userService from '../../services/userService';
import { getErrorDetail } from '../../utils/errorParser';
import type { ClusterUser } from '../../types';

export interface SearchUser {
  id: string;
  username?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
}

const SEARCH_PER_PAGE = 10;

function sortByName(list: ClusterUser[]): ClusterUser[] {
  const nameOf = (u: ClusterUser) =>
    (u.userInfo?.firstname || u.userInfo?.middlename || u.userInfo?.lastname
      ? [u.userInfo.firstname, u.userInfo.middlename, u.userInfo.lastname].filter(Boolean).join(' ')
      : u.name || u.email || '').toLowerCase();
  return [...list].sort((a, b) => {
    const byName = nameOf(a).localeCompare(nameOf(b));
    return byName !== 0 ? byName : (a.email || '').toLowerCase().localeCompare((b.email || '').toLowerCase());
  });
}

export function useClusterUsers(clusterId: string | undefined) {
  const [clusterUsers, setClusterUsers] = useState<ClusterUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [rawUsersResponse, setRawUsersResponse] = useState<unknown>(null);

  const [searchUsers, setSearchUsers] = useState<SearchUser[]>([]);
  const [searchUsersTerm, setSearchUsersTermState] = useState('');
  const [searchUsersTotal, setSearchUsersTotal] = useState(0);
  const [searchUsersPage, setSearchUsersPage] = useState(1);
  const [loadingSearchUsers, setLoadingSearchUsers] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClusterUsers = useCallback(async () => {
    if (!clusterId) return;
    try {
      setUsersLoading(true);
      const response = await api.get(`/api-system/user/clusters/${clusterId}`);
      const data = response.data;
      setRawUsersResponse(data);
      const items = data.data || data;
      setClusterUsers(sortByName(Array.isArray(items) ? items : []));
    } catch {
      // Secondary data — keep prior list, no blocking error.
    } finally {
      setUsersLoading(false);
    }
  }, [clusterId]);

  useEffect(() => {
    fetchClusterUsers();
  }, [fetchClusterUsers]);

  const fetchSearchUsers = useCallback(async (search: string, page: number, append = false) => {
    setLoadingSearchUsers(true);
    try {
      const data = await userService.getAll({
        search,
        page,
        perpage: SEARCH_PER_PAGE,
        searchfields: ['username', 'email', 'firstname', 'lastname'],
      });
      const items = (data as { data?: SearchUser[] }).data || (data as unknown as SearchUser[]);
      const pag = (data as { paginate?: { total?: number } }).paginate;
      const list = Array.isArray(items) ? items : [];
      setSearchUsers((prev) => (append ? [...prev, ...list] : list));
      setSearchUsersTotal(pag?.total ?? 0);
    } catch {
      if (!append) { setSearchUsers([]); setSearchUsersTotal(0); }
    } finally {
      setLoadingSearchUsers(false);
    }
  }, []);

  const setSearchUsersTerm = useCallback((value: string) => {
    setSearchUsersTermState(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchUsersPage(1);
      fetchSearchUsers(value, 1);
    }, 400);
  }, [fetchSearchUsers]);

  const hasMoreUsers = searchUsersPage < Math.max(1, Math.ceil(searchUsersTotal / SEARCH_PER_PAGE));
  const loadMoreUsers = useCallback(() => {
    if (loadingSearchUsers || !hasMoreUsers) return;
    const next = searchUsersPage + 1;
    setSearchUsersPage(next);
    fetchSearchUsers(searchUsersTerm, next, true);
  }, [loadingSearchUsers, hasMoreUsers, searchUsersPage, searchUsersTerm, fetchSearchUsers]);

  const resetSearch = useCallback(() => {
    setSearchUsersTermState('');
    setSearchUsersPage(1);
    setSearchUsers([]);
    fetchSearchUsers('', 1);
  }, [fetchSearchUsers]);

  const addUser = useCallback(async (input: { userId: string; role: string; parentBuId?: string }) => {
    if (!clusterId) return;
    await api.post('/api-system/user/clusters', {
      user_id: input.userId,
      cluster_id: clusterId,
      role: input.role,
      is_active: true,
      ...(input.parentBuId ? { parent_bu_id: input.parentBuId } : {}),
    });
    toast.success('User added to cluster');
    await fetchClusterUsers();
  }, [clusterId, fetchClusterUsers]);

  const updateUser = useCallback(async (
    clusterUserId: string,
    patch: { role?: string; parent_bu_id?: string | null; is_active?: boolean },
  ) => {
    const prev = clusterUsers;
    setClusterUsers((list) => list.map((u) => (u.id === clusterUserId ? { ...u, ...patch } : u)));
    try {
      await api.put(`/api-system/user/clusters/${clusterUserId}`, patch);
    } catch (err) {
      setClusterUsers(prev); // rollback
      toast.error('Failed to update user', { description: getErrorDetail(err) });
      throw err;
    }
  }, [clusterUsers]);

  const removeUser = useCallback(async (clusterUserId: string) => {
    await api.delete(`/api-system/user/clusters/${clusterUserId}`);
    await fetchClusterUsers();
  }, [fetchClusterUsers]);

  // Sequential fan-out: one request per id, never abort the batch on a single failure.
  const bulkRun = useCallback(async (
    ids: string[],
    op: (id: string) => Promise<void>,
    label: string,
  ): Promise<{ ok: number; failed: number }> => {
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await op(id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    await fetchClusterUsers();
    if (failed === 0) {
      toast.success(`${label}: ${ok} updated`);
    } else {
      toast.error(`${label}: ${ok} updated, ${failed} failed`);
    }
    return { ok, failed };
  }, [fetchClusterUsers]);

  return {
    clusterUsers, usersLoading, rawUsersResponse,
    fetchClusterUsers,
    addUser, updateUser, removeUser, bulkRun,
    // add-user search
    searchUsers, searchUsersTerm, setSearchUsersTerm, loadingSearchUsers,
    searchUsersTotal, loadMoreUsers, hasMoreUsers, resetSearch,
  };
}

export type ClusterUsersApi = ReturnType<typeof useClusterUsers>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/useClusterUsers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/useClusterUsers.ts src/pages/clusterEdit/useClusterUsers.test.ts
git commit -m "feat(cluster-edit): add useClusterUsers hook with bulk fan-out"
```

---

### Task 6: `DetailsSection` (edit-in-place identity + licensing)

**Files:**
- Create: `src/pages/clusterEdit/sections/DetailsSection.tsx`
- Test: `src/pages/clusterEdit/sections/DetailsSection.test.tsx`

**Interfaces:**
- Consumes: `InlineField` (`src/pages/businessUnitEdit/InlineField`), `ClusterFormData` (`src/pages/clusterManagement/ClusterIdentityFields`), `validateField` (`src/utils/validation`).
- Produces: `interface DetailsSectionProps { formData: ClusterFormData; fieldErrors: Record<string, string>; canEdit: boolean; onCommit: (name: string, value: string) => void; onValidate: (name: string, value: string) => void }` and `export function DetailsSection(props): JSX.Element`.

Behavior: renders each identity field as an `InlineField`. When `!canEdit`, every field is `disabled` (read-only display, no edit trigger) — this is where `cluster.update` gating lives now that the Edit toggle is gone. `is_active` uses a select of `Active`/`Inactive` mapped to `'true'`/`'false'`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/sections/DetailsSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailsSection } from './DetailsSection';
import type { ClusterFormData } from '../../clusterManagement/ClusterIdentityFields';

const formData: ClusterFormData = {
  code: 'CLS1', name: 'Acme', alias_name: 'ACM', max_license_bu: '5', is_active: true,
};

describe('DetailsSection', () => {
  it('renders values and lets an editor change a field', async () => {
    const onCommit = vi.fn();
    render(
      <DetailsSection formData={formData} fieldErrors={{}} canEdit onCommit={onCommit} onValidate={() => {}} />,
    );
    // Read shows the value.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    // Click name → input appears → type → blur commits.
    await userEvent.click(screen.getByRole('button', { name: /acme/i }));
    const input = screen.getByDisplayValue('Acme');
    await userEvent.clear(input);
    await userEvent.type(input, 'Acme 2');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith('name', 'Acme 2');
  });

  it('renders read-only (no edit triggers) when canEdit is false', async () => {
    render(
      <DetailsSection formData={formData} fieldErrors={{}} canEdit={false} onCommit={() => {}} onValidate={() => {}} />,
    );
    expect(screen.getByText('Acme')).toBeInTheDocument();
    // No field can be opened for editing.
    expect(screen.queryByRole('button', { name: /acme/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/sections/DetailsSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DetailsSection**

```tsx
// src/pages/clusterEdit/sections/DetailsSection.tsx
import { InlineField } from '../../businessUnitEdit/InlineField';
import type { ClusterFormData } from '../../clusterManagement/ClusterIdentityFields';

export interface DetailsSectionProps {
  formData: ClusterFormData;
  fieldErrors: Record<string, string>;
  canEdit: boolean;
  onCommit: (name: string, value: string) => void;
  onValidate: (name: string, value: string) => void;
}

/**
 * Identity + licensing as an edit-in-place document. There is no Edit toggle: the
 * `cluster.update` gate lives here as `disabled={!canEdit}` on each field, so a user
 * without the permission sees values but cannot open any editor.
 */
export function DetailsSection({ formData, fieldErrors, canEdit, onCommit, onValidate }: DetailsSectionProps) {
  const disabled = !canEdit;
  return (
    <div className="divide-y">
      <InlineField
        name="code" label="Code" value={formData.code} mono required disabled={disabled}
        error={fieldErrors.code} onCommit={onCommit} onValidate={onValidate}
      />
      <InlineField
        name="name" label="Name" value={formData.name} required disabled={disabled}
        error={fieldErrors.name} onCommit={onCommit} onValidate={onValidate}
      />
      <InlineField
        name="alias_name" label="Alias name" value={formData.alias_name} mono disabled={disabled}
        placeholder="Max 3 chars" error={fieldErrors.alias_name} onCommit={onCommit} onValidate={onValidate}
      />
      <InlineField
        name="max_license_bu" label="Max licensed BUs" value={formData.max_license_bu} type="number"
        mono disabled={disabled} placeholder="Unlimited" error={fieldErrors.max_license_bu}
        onCommit={onCommit} onValidate={onValidate}
      />
      <InlineField
        name="is_active" label="Status" type="select" disabled={disabled}
        value={formData.is_active ? 'true' : 'false'}
        options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
        onCommit={onCommit}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/sections/DetailsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/sections/DetailsSection.tsx src/pages/clusterEdit/sections/DetailsSection.test.tsx
git commit -m "feat(cluster-edit): add edit-in-place DetailsSection with gating"
```

---

### Task 7: `BrandingSection`

**Files:**
- Create: `src/pages/clusterEdit/sections/BrandingSection.tsx`

**Interfaces:**
- Consumes: `BrandingImageUpload` (`src/components/BrandingImageUpload`).
- Produces: `interface BrandingSectionProps { logoUrl: string; avatarUrl: string; canEdit: boolean; onUploadLogo: (f: File) => Promise<void>; onUploadAvatar: (f: File) => Promise<void> }` and `export function BrandingSection(props): JSX.Element`.

This task has no dedicated test (thin composition of an already-tested upload control); it is verified by the page integration test in Task 12 and `bun run build`.

- [ ] **Step 1: Implement BrandingSection**

```tsx
// src/pages/clusterEdit/sections/BrandingSection.tsx
import { BrandingImageUpload } from '../../../components/BrandingImageUpload';

export interface BrandingSectionProps {
  logoUrl: string;
  avatarUrl: string;
  canEdit: boolean;
  onUploadLogo: (f: File) => Promise<void>;
  onUploadAvatar: (f: File) => Promise<void>;
}

export function BrandingSection({ logoUrl, avatarUrl, canEdit, onUploadLogo, onUploadAvatar }: BrandingSectionProps) {
  if (!canEdit) {
    return (
      <div className="flex flex-wrap gap-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-16 w-24 rounded-md border object-cover" />
        ) : (
          <div className="text-muted-foreground grid h-16 w-24 place-items-center rounded-md border text-xs">No logo</div>
        )}
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-md border object-cover" />
        ) : (
          <div className="text-muted-foreground grid h-16 w-16 place-items-center rounded-md border text-xs">No avatar</div>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BrandingImageUpload label="Logo" value={logoUrl} shape="rect" onUpload={onUploadLogo} />
      <BrandingImageUpload label="Avatar" value={avatarUrl} shape="square" onUpload={onUploadAvatar} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks / builds**

Run: `bun run build`
Expected: build succeeds (no unused imports). (Full page wiring lands in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/clusterEdit/sections/BrandingSection.tsx
git commit -m "feat(cluster-edit): add BrandingSection"
```

---

### Task 8: `BusinessUnitsSection`

**Files:**
- Create: `src/pages/clusterEdit/sections/BusinessUnitsSection.tsx`
- Test: `src/pages/clusterEdit/sections/BusinessUnitsSection.test.tsx`

**Interfaces:**
- Consumes: `TableToolbar`, `tableSort` (`cycleSort`, `sortRows`, `SortState`), `CapacityMeter` (`src/pages/clusterManagement/CapacityMeter`), `Badge`, `Button`, `Can`, `EmptyState`, types `BusinessUnit` + `ClusterUser`.
- Produces: `interface BusinessUnitsSectionProps { clusterId: string; businessUnits: BusinessUnit[]; clusterUsers: ClusterUser[]; loading: boolean; maxLicenseBu: number | null; onRefresh: () => void; onNavigate: (path: string) => void }` and `export function BusinessUnitsSection(props): JSX.Element`.

Behavior: `TableToolbar` (search over code/name; filter chips Active/Inactive) + sortable table (Code, Name, Users meter, Status). Add button gated by `cluster.create`, disabled at cap. Filtering/sorting via `useMemo`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/sections/BusinessUnitsSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { BusinessUnitsSection } from './BusinessUnitsSection';
import type { BusinessUnit } from '../../../types';

const bus: BusinessUnit[] = [
  { id: 'b1', cluster_id: 'c1', code: 'HQ', name: 'Head Office', is_active: true, max_license_users: 10 },
  { id: 'b2', cluster_id: 'c1', code: 'BR', name: 'Branch', is_active: false, max_license_users: 5 },
];

function renderSection(extra?: Partial<React.ComponentProps<typeof BusinessUnitsSection>>) {
  return render(
    <BusinessUnitsSection
      clusterId="c1" businessUnits={bus} clusterUsers={[]} loading={false}
      maxLicenseBu={5} onRefresh={() => {}} onNavigate={() => {}} {...extra}
    />,
  );
}

describe('BusinessUnitsSection', () => {
  it('filters by search term', async () => {
    renderSection();
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'branch');
    expect(screen.queryByText('Head Office')).toBeNull();
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  it('filters to active only via chip', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByText('Head Office')).toBeInTheDocument();
    expect(screen.queryByText('Branch')).toBeNull();
  });

  it('shows an empty state when there are no BUs', () => {
    renderSection({ businessUnits: [] });
    expect(screen.getByText(/no business units/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/sections/BusinessUnitsSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BusinessUnitsSection**

```tsx
// src/pages/clusterEdit/sections/BusinessUnitsSection.tsx
import { useMemo, useState } from 'react';
import { RefreshCw, Pencil, ChevronsUpDown } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import Can from '../../../components/Can';
import { CapacityMeter } from '../../clusterManagement/CapacityMeter';
import { TableToolbar } from '../TableToolbar';
import { cycleSort, sortRows, type SortState } from '../tableSort';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import type { BusinessUnit, ClusterUser } from '../../../types';

export interface BusinessUnitsSectionProps {
  clusterId: string;
  businessUnits: BusinessUnit[];
  clusterUsers: ClusterUser[];
  loading: boolean;
  maxLicenseBu: number | null;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}

const accessor = (bu: BusinessUnit, key: string): unknown => {
  if (key === 'code') return bu.code;
  if (key === 'name') return bu.name;
  if (key === 'status') return bu.is_active ? 1 : 0;
  return '';
};

export function BusinessUnitsSection({
  clusterId, businessUnits, clusterUsers, loading, maxLicenseBu, onRefresh, onNavigate,
}: BusinessUnitsSectionProps) {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = businessUnits.filter((bu) => {
      if (term && !(`${bu.code} ${bu.name}`.toLowerCase().includes(term))) return false;
      if (activeOnly && !bu.is_active) return false;
      if (inactiveOnly && bu.is_active) return false;
      return true;
    });
    out = sortRows(out, sort, accessor);
    return out;
  }, [businessUnits, search, activeOnly, inactiveOnly, sort]);

  const atLimit = maxLicenseBu != null && businessUnits.length >= maxLicenseBu;

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search business units"
        filters={[
          { key: 'active', label: 'Active', active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); } },
          { key: 'inactive', label: 'Inactive', active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh business units">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Can permission="cluster.create">
              <Button size="sm" onClick={() => onNavigate(`/business-units/new?cluster_id=${clusterId}`)} disabled={atLimit}
                title={atLimit ? `License limit reached (${businessUnits.length}/${maxLicenseBu})` : undefined}>
                Add
              </Button>
            </Can>
          </>
        }
      />
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {businessUnits.length === 0 ? 'No business units found in this cluster.' : 'No business units match your filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted border-b-2">
                {(['code', 'name'] as const).map((key) => (
                  <th key={key} className="px-4 py-2 text-left font-medium">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((s) => cycleSort(s, key))}>
                      {key === 'code' ? 'Code' : 'Name'}
                      <ChevronsUpDown className="h-3 w-3 opacity-50" />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2 text-left font-medium">Users</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((bu) => (
                <tr key={bu.id} className="zebra-row border-b transition-colors last:border-0">
                  <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{bu.code}</Badge></td>
                  <td className="px-4 py-2">{bu.name}</td>
                  <td className="px-4 py-2">
                    <CapacityMeter used={clusterUsers.filter((cu) => cu.parent_bu_id === bu.id).length} cap={bu.max_license_users} />
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={bu.is_active ? 'success' : 'secondary'} className="text-xs">
                      {bu.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${HIT_SLOP_44}`}
                      aria-label={`Edit ${bu.name || bu.code || 'business unit'}`} onClick={() => onNavigate(`/business-units/${bu.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/sections/BusinessUnitsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/sections/BusinessUnitsSection.tsx src/pages/clusterEdit/sections/BusinessUnitsSection.test.tsx
git commit -m "feat(cluster-edit): add searchable/sortable BusinessUnitsSection"
```

---

### Task 9: `UsersSection`

**Files:**
- Create: `src/pages/clusterEdit/sections/UsersSection.tsx`
- Test: `src/pages/clusterEdit/sections/UsersSection.test.tsx`

**Interfaces:**
- Consumes: `TableToolbar`, `BulkActionBar` (`BulkAction`), `InlineCell`, `tableSort`, `Badge`, `Button`, `Can`, `ConfirmDialog`, `useAuth` (for `canEdit`), types `BusinessUnit` + `ClusterUser`.
- Produces:
  - `interface UsersSectionProps { clusterId: string; users: ClusterUser[]; businessUnits: BusinessUnit[]; loading: boolean; canEdit: boolean; onRefresh: () => void; onAddUser: () => void; onUpdateUser: (id: string, patch: { role?: string; parent_bu_id?: string | null }) => Promise<void>; onRemoveUser: (id: string) => Promise<void>; onBulkRemove: (ids: string[]) => Promise<void>; onBulkMoveBu: (ids: string[], buId: string) => Promise<void> }`
  - `export function UsersSection(props): JSX.Element`

Behavior: `TableToolbar` (search name/email; chips Active/Inactive; role + parent-BU filter chips) + selection checkboxes → `BulkActionBar` (Remove [confirm], Move to BU). Inline `role` + `parent BU` cells via `InlineCell` (gated by `canEdit`). Selection resets when filters change. Bulk `is_active` toggle is intentionally omitted pending swagger confirmation (see spec).

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/sections/UsersSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UsersSection } from './UsersSection';
import type { ClusterUser, BusinessUnit } from '../../../types';

const users: ClusterUser[] = [
  { id: 'cu1', user_id: 'u1', email: 'jane@x.com', role: 'admin', is_active: true, userInfo: { firstname: 'Jane', lastname: 'Doe' } },
  { id: 'cu2', user_id: 'u2', email: 'bob@x.com', role: 'user', is_active: false, userInfo: { firstname: 'Bob', lastname: 'Roe' } },
];
const bus: BusinessUnit[] = [{ id: 'b1', code: 'HQ', name: 'Head Office', is_active: true }];

function renderSection(extra?: Partial<React.ComponentProps<typeof UsersSection>>) {
  return render(
    <UsersSection
      clusterId="c1" users={users} businessUnits={bus} loading={false} canEdit
      onRefresh={() => {}} onAddUser={() => {}}
      onUpdateUser={vi.fn().mockResolvedValue(undefined)}
      onRemoveUser={vi.fn().mockResolvedValue(undefined)}
      onBulkRemove={vi.fn().mockResolvedValue(undefined)}
      onBulkMoveBu={vi.fn().mockResolvedValue(undefined)}
      {...extra}
    />,
  );
}

describe('UsersSection', () => {
  it('searches by name', async () => {
    renderSection();
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'jane');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Bob Roe')).toBeNull();
  });

  it('selecting a row reveals the bulk bar and remove fires onBulkRemove', async () => {
    const onBulkRemove = vi.fn().mockResolvedValue(undefined);
    renderSection({ onBulkRemove });
    await userEvent.click(screen.getByRole('checkbox', { name: /select jane doe/i }));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    // ConfirmDialog opens; confirm it.
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i, hidden: false }));
    expect(onBulkRemove).toHaveBeenCalledWith(['cu1']);
  });

  it('hides checkboxes and inline editors when canEdit is false', () => {
    renderSection({ canEdit: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
    // role shows as plain badge text, not an editable trigger
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});
```

Note: the confirm-dialog interaction may need adjusting to the actual `ConfirmDialog` button label during implementation; keep the assertion that `onBulkRemove` is called with the selected id(s).

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/sections/UsersSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement UsersSection**

```tsx
// src/pages/clusterEdit/sections/UsersSection.tsx
import { useMemo, useState } from 'react';
import { RefreshCw, UserPlus, Trash2, Building2 } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { TableToolbar } from '../TableToolbar';
import { BulkActionBar, type BulkAction } from '../BulkActionBar';
import { InlineCell } from '../InlineCell';
import { HIT_SLOP_44 } from '../../../lib/hitSlop';
import type { BusinessUnit, ClusterUser } from '../../../types';

export interface UsersSectionProps {
  clusterId: string;
  users: ClusterUser[];
  businessUnits: BusinessUnit[];
  loading: boolean;
  canEdit: boolean;
  onRefresh: () => void;
  onAddUser: () => void;
  onUpdateUser: (id: string, patch: { role?: string; parent_bu_id?: string | null }) => Promise<void>;
  onRemoveUser: (id: string) => Promise<void>;
  onBulkRemove: (ids: string[]) => Promise<void>;
  onBulkMoveBu: (ids: string[], buId: string) => Promise<void>;
}

const ROLE_OPTIONS = [{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }];

function displayName(u: ClusterUser): string {
  const parts = [u.userInfo?.firstname, u.userInfo?.middlename, u.userInfo?.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || '');
}

export function UsersSection({
  clusterId, users, businessUnits, loading, canEdit,
  onRefresh, onAddUser, onUpdateUser, onRemoveUser, onBulkRemove, onBulkMoveBu,
}: UsersSectionProps) {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [confirmRemoveOne, setConfirmRemoveOne] = useState<ClusterUser | null>(null);
  const [moveBuId, setMoveBuId] = useState('');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (term) {
        const hay = `${displayName(u)} ${u.email ?? ''} ${u.username ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      const active = u.is_active !== false;
      if (activeOnly && !active) return false;
      if (inactiveOnly && active) return false;
      return true;
    });
  }, [users, search, activeOnly, inactiveOnly]);

  // Selection is scoped to the currently-filtered set; reset it whenever filters change.
  const resetSelection = () => setSelected(new Set());
  const rowIds = rows.map((r) => r.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rowIds));

  const buOptions = businessUnits.map((bu) => ({ value: bu.id, label: `${bu.code} - ${bu.name}` }));

  const bulkActions: BulkAction[] = [
    { key: 'remove', label: 'Remove', icon: Trash2, variant: 'destructive', onClick: () => setConfirmBulkRemove(true) },
    { key: 'move', label: 'Move to BU', icon: Building2, disabled: !moveBuId, onClick: () => { void onBulkMoveBu([...selected], moveBuId).then(resetSelection); } },
  ];

  return (
    <div>
      <TableToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); resetSelection(); }}
        placeholder="Search users"
        filters={[
          { key: 'active', label: 'Active', active: activeOnly, onToggle: () => { setActiveOnly((v) => !v); setInactiveOnly(false); resetSelection(); } },
          { key: 'inactive', label: 'Inactive', active: inactiveOnly, onToggle: () => { setInactiveOnly((v) => !v); setActiveOnly(false); resetSelection(); } },
        ]}
        right={
          <>
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}
              className={`h-8 w-8 ${HIT_SLOP_44}`} aria-label="Refresh users">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={onAddUser}>
                <UserPlus className="mr-2 h-4 w-4" /> Add User
              </Button>
            )}
          </>
        }
      />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <select aria-label="Bulk: target business unit" value={moveBuId} onChange={(e) => setMoveBuId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Move target BU…</option>
            {buOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <BulkActionBar count={selected.size} onClear={resetSelection} actions={bulkActions} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {users.length === 0 ? 'No users found in this cluster.' : 'No users match your filters.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border bg-muted border-b-2">
                {canEdit && (
                  <th className="w-10 px-4 py-2">
                    <input type="checkbox" aria-label="Select all users" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-input" />
                  </th>
                )}
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Parent Business Unit</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const bu = u.parent_bu_id ? businessUnits.find((b) => b.id === u.parent_bu_id) : null;
                return (
                  <tr key={u.id} className="zebra-row border-b transition-colors last:border-0">
                    {canEdit && (
                      <td className="px-4 py-2">
                        <input type="checkbox" aria-label={`Select ${displayName(u)}`} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="h-4 w-4 rounded border-input" />
                      </td>
                    )}
                    <td className="px-4 py-2">{displayName(u)}</td>
                    <td className="text-muted-foreground px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">
                      <InlineCell
                        ariaLabel={`Parent business unit for ${displayName(u)}`}
                        value={u.parent_bu_id ?? ''}
                        disabled={!canEdit}
                        options={[{ value: '', label: '—' }, ...buOptions]}
                        display={bu ? <Badge variant="outline" className="text-xs">{bu.code} - {bu.name}</Badge> : <span className="text-muted-foreground text-xs">-</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { parent_bu_id: v || null }); }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <InlineCell
                        ariaLabel={`Role for ${displayName(u)}`}
                        value={u.role ?? 'user'}
                        disabled={!canEdit}
                        options={ROLE_OPTIONS}
                        display={<span>{u.role ?? 'user'}</span>}
                        onCommit={(v) => { void onUpdateUser(u.id, { role: v }); }}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Badge variant={u.is_active !== false ? 'success' : 'secondary'} className="text-xs">
                        {u.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className={`text-destructive hover:text-destructive h-7 w-7 ${HIT_SLOP_44}`}
                          aria-label={`Remove ${displayName(u)} from this cluster`} onClick={() => setConfirmRemoveOne(u)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title="Remove selected users"
        description={`Remove ${selected.size} user(s) from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={async () => { await onBulkRemove([...selected]); resetSelection(); }}
      />
      <ConfirmDialog
        open={confirmRemoveOne !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemoveOne(null); }}
        title="Remove User from Cluster"
        description={`Remove "${confirmRemoveOne ? displayName(confirmRemoveOne) : ''}" from this cluster?`}
        confirmText="Remove"
        confirmVariant="destructive"
        onConfirm={async () => { if (confirmRemoveOne) await onRemoveUser(confirmRemoveOne.id); setConfirmRemoveOne(null); }}
      />
    </div>
  );
}
```

Note: `clusterId` is part of the props contract for the orchestrator's Add-User flow wiring even though the add dialog itself lives in the orchestrator (Task 11); keep it in the signature. If `bun run build` flags it as unused in this file, prefix usage by passing it to `onAddUser` is not required — instead drop the `clusterId` prop from THIS component and keep it only where used. Resolve during implementation to keep the build clean.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/sections/UsersSection.test.tsx`
Expected: PASS (adjust the ConfirmDialog assertion to the real button label if needed).

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/sections/UsersSection.tsx src/pages/clusterEdit/sections/UsersSection.test.tsx
git commit -m "feat(cluster-edit): add UsersSection with inline edit + bulk actions"
```

---

### Task 10: `ClusterEditNav` (sticky sidenav + scrollspy)

**Files:**
- Create: `src/pages/clusterEdit/ClusterEditNav.tsx`
- Test: `src/pages/clusterEdit/ClusterEditNav.test.tsx`

**Interfaces:**
- Consumes: `useScrollSpy`.
- Produces:
  - `interface NavItem { id: string; label: string; count?: number }`
  - `interface ClusterEditNavProps { items: NavItem[] }`
  - `export function ClusterEditNav(props): JSX.Element`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/clusterEdit/ClusterEditNav.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClusterEditNav } from './ClusterEditNav';

beforeEach(() => {
  class MockIO { observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn(); constructor() {} }
  vi.stubGlobal('IntersectionObserver', MockIO as unknown as typeof IntersectionObserver);
});
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('ClusterEditNav', () => {
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users', count: 12 },
  ];

  it('renders a link per item with count badges', () => {
    render(<ClusterEditNav items={items} />);
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users/i })).toHaveTextContent('12');
  });

  it('scrolls to a section on click', async () => {
    const target = document.createElement('div');
    target.id = 'users';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(<ClusterEditNav items={items} />);
    await userEvent.click(screen.getByRole('button', { name: /users/i }));
    expect(target.scrollIntoView).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/pages/clusterEdit/ClusterEditNav.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ClusterEditNav**

```tsx
// src/pages/clusterEdit/ClusterEditNav.tsx
import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { useScrollSpy } from './useScrollSpy';

export interface NavItem {
  id: string;
  label: string;
  count?: number;
}

export interface ClusterEditNavProps {
  items: NavItem[];
}

/**
 * Sticky section navigator. Desktop: a vertical sidenav that highlights the
 * in-view section. Mobile: a horizontal, scrollable chip row.
 */
export function ClusterEditNav({ items }: ClusterEditNavProps) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const { activeId, scrollTo } = useScrollSpy(ids);

  return (
    <nav aria-label="Cluster sections" className="lg:sticky lg:top-4">
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => scrollTo(item.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <span>{item.label}</span>
                {item.count != null && (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] tabular-nums', active ? 'bg-primary/15' : 'bg-muted')}>
                    {item.count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test -- src/pages/clusterEdit/ClusterEditNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clusterEdit/ClusterEditNav.tsx src/pages/clusterEdit/ClusterEditNav.test.tsx
git commit -m "feat(cluster-edit): add sticky scrollspy ClusterEditNav"
```

---

### Task 11: Rewrite `ClusterEdit.tsx` orchestrator

Compose everything: load cluster + BUs, edit-in-place details, save bar, branding, BU/Users sections, add-user dialog, not-found gate, debug sheet, isNew flow. Keep the existing `fetchCluster`/`handleSubmit`/`doc_version`/not-found logic; swap the presentation.

**Files:**
- Modify (rewrite): `src/pages/ClusterEdit.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–10, plus existing `clusterService`, `businessUnitService`, `ClusterHero`, `PageHeader`, `Can`, `EmptyState`, `DevDebugSheet`, `Skeleton`/`TableSkeleton`, `useAuth`, `useUnsavedChanges`, `useGlobalShortcuts`, `getDocVersion`/`isVersionConflict`/`notifyVersionConflict`, `getErrorDetail`/`isNotFoundError`.

- [ ] **Step 1: Rewrite the component**

Key structure (write the full file, preserving existing load/save/not-found logic verbatim where noted):

```tsx
// src/pages/ClusterEdit.tsx — orchestrator (abridged skeleton; fill from existing file for the load/save/dialog bodies)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Loader2, Save, X, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import Can from '../components/Can';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { DevDebugSheet } from '../components/ui/dev-debug-sheet';
import { useAuth } from '../context/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog, isNotFoundError } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { ClusterHero } from './clusterManagement/ClusterHero';
import { ClusterIdentityFields, type ClusterFormData } from './clusterManagement/ClusterIdentityFields';
import { ClusterEditNav, type NavItem } from './clusterEdit/ClusterEditNav';
import { DetailsSection } from './clusterEdit/sections/DetailsSection';
import { BrandingSection } from './clusterEdit/sections/BrandingSection';
import { BusinessUnitsSection } from './clusterEdit/sections/BusinessUnitsSection';
import { UsersSection } from './clusterEdit/sections/UsersSection';
import { useClusterUsers } from './clusterEdit/useClusterUsers';
import type { BusinessUnit } from '../types';

// ...
// KEEP verbatim from the current file: formData/savedFormData/docVersion/clusterMeta state,
// fetchCluster(), fetchBusinessUnits(), handleUploadLogo/Avatar(), handleSubmit() (create + update
// with doc_version), the loading Skeleton block, and the notFound EmptyState block.
//
// REPLACE the rendered body (the big `return (...)`) for the existing-cluster branch with:
//   <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-6 pb-24">
//     <ClusterEditNav items={navItems} />
//     <div className="space-y-6">
//       <section id="overview" className="scroll-mt-20"><ClusterHero .../></section>
//       <section id="details" className="scroll-mt-20"><Card>… <DetailsSection canEdit={canEdit} onCommit={handleCommitField} onValidate={handleValidateField} …/></Card></section>
//       <section id="branding" className="scroll-mt-20"><Card>… <BrandingSection canEdit={canEdit} …/></Card></section>
//       <section id="business-units" className="scroll-mt-20"><Card><BusinessUnitsSection …/></Card></section>
//       <section id="users" className="scroll-mt-20"><Card><UsersSection canEdit={canEdit} …/></Card></section>
//     </div>
//   </div>
// Plus the sticky bottom save bar (copied pattern from BusinessUnitEdit) shown when hasChanges.
// Plus the Add-User dialog (moved from the old file, wired to useClusterUsers.addUser + resetSearch).
// Plus <DevDebugSheet ... /> in development.
```

Concrete new/changed pieces to add to the orchestrator:

```tsx
const { id } = useParams<{ id: string }>();
const isNew = !id;
const { hasPermission } = useAuth();
const canEdit = !isNew && hasPermission('cluster.update', { clusterId: id });

const users = useClusterUsers(id);

// Edit-in-place commit: write into formData (identity fields only; doc_version stays separate).
const handleCommitField = (name: string, value: string) => {
  setFormData((prev) => ({ ...prev, [name]: name === 'is_active' ? value === 'true' : value }));
  setError('');
};
const handleValidateField = (name: string, value: string) => {
  setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
};

// hasChanges drives the sticky save bar (unchanged pattern).
const hasChanges = !isNew && JSON.stringify(formData) !== JSON.stringify(savedFormData);
useUnsavedChanges(hasChanges);
useGlobalShortcuts({
  onSave: () => { if (hasChanges && !saving) void handleSaveCluster(); },
  onCancel: () => { if (hasChanges) setFormData(savedFormData); },
});

// Save via the existing update path (doc_version-aware).
const handleSaveCluster = async () => { /* body extracted from the existing handleSubmit update branch */ };

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'branding', label: 'Branding' },
  { id: 'business-units', label: 'Business Units', count: businessUnits.length },
  { id: 'users', label: 'Users', count: users.clusterUsers.length },
];
```

- Bulk handlers wired to `useClusterUsers`:

```tsx
const handleBulkRemove = async (ids: string[]) =>
  users.bulkRun(ids, (cuId) => users.removeUser(cuId), 'Remove users');
const handleBulkMoveBu = async (ids: string[], buId: string) =>
  users.bulkRun(ids, (cuId) => users.updateUser(cuId, { parent_bu_id: buId }), 'Move users');
```

- The `isNew` branch keeps the current single-form create UI (PageHeader "Add Cluster" + `ClusterIdentityFields editing` + Create/Cancel) — unchanged.

- [ ] **Step 2: Verify build + existing non-security tests compile**

Run: `bun run build`
Expected: succeeds. Fix any unused imports (e.g. remove now-unused `Badge`, `Dialog` pieces if the add-user dialog was simplified; keep what the dialog needs).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClusterEdit.tsx
git commit -m "feat(cluster-edit): rewrite page as scrollspy edit-in-place orchestrator"
```

---

### Task 12: Update `ClusterEdit.test.tsx` and full verification

The security suite asserts on the removed "Edit details" button. Update it to the edit-in-place model **without weakening the security guarantee**: without `cluster.update`, the Details fields must not be editable and the user write surfaces (Add User, inline editors, remove) must be absent; with the scoped permission, they must be present.

**Files:**
- Modify: `src/pages/ClusterEdit.test.tsx`

- [ ] **Step 1: Update the affected tests**

Replace the two `describe` blocks that reference `edit details` / the two-mode Edit toggle. Keep the not-found, isNew, and load-into-hero tests. New assertions:

```tsx
// Within "ClusterEdit — cluster-user write surfaces are gated":
it('hides every write surface without cluster.update / cluster.create', async () => {
  auth.hasPermission = () => false;
  renderAt('/clusters/c1/edit');

  expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
  // Edit-in-place: with no permission, the Details fields are read-only (no edit trigger),
  // and the user write surfaces are absent.
  expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /^add$/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /remove jane doe/i })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();               // no bulk-select
  expect(screen.queryByRole('button', { name: /role for jane doe/i })).toBeNull(); // no inline role editor
  expect(screen.getByText('Jane Doe')).toBeInTheDocument();        // still shown as text
});

it('shows them when cluster.update is held for this cluster (discriminating control)', async () => {
  auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
  renderAt('/clusters/c1/edit');

  expect(await screen.findByRole('button', { name: /add user/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /remove jane doe/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /role for jane doe/i })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /select jane doe/i })).toBeInTheDocument();
});
```

Replace the "two-mode fields (A4 contract)" block with an edit-in-place equivalent:

```tsx
describe('ClusterEdit — edit-in-place details', () => {
  it('shows values read-only until a field is clicked (with permission)', async () => {
    auth.hasPermission = (perm, ctx) => perm === 'cluster.update' && ctx?.clusterId === 'c1';
    asMock(clusterService.getById).mockResolvedValue({ data: fakeCluster });
    const user = userEvent.setup();
    renderAt('/clusters/c1/edit');

    expect(await screen.findByRole('heading', { level: 1, name: 'Acme Cluster' })).toBeInTheDocument();
    // No inputs until a field is opened.
    expect(screen.queryByDisplayValue('Acme Cluster')).toBeNull();
    await user.click(screen.getByRole('button', { name: /acme cluster/i }));
    expect(await screen.findByDisplayValue('Acme Cluster')).toBeInTheDocument();
  });

  it('reads an unset cap as "Unlimited"', async () => {
    asMock(clusterService.getById).mockResolvedValue({ data: { ...fakeCluster, max_license_bu: null } });
    renderAt('/clusters/c1/edit');
    expect(await screen.findByText('Unlimited')).toBeInTheDocument();
  });
});
```

Note: `InlineField` shows the placeholder `Set max licensed bus…` for an empty numeric field, not "Unlimited". If the "Unlimited" read affordance is required, pass `placeholder="Unlimited"` (already in DetailsSection) — `InlineField` renders the placeholder text when the value is empty, so the assertion holds. Confirm during implementation; if the display differs, assert on the actual placeholder text.

- [ ] **Step 2: Run the page test suite**

Run: `bun run test -- src/pages/ClusterEdit.test.tsx`
Expected: PASS (adjust label regexes to the real rendered text where noted).

- [ ] **Step 3: Run the full unit suite + build**

Run: `bun run test`
Expected: all green.

Run: `bun run build`
Expected: succeeds, no unused-symbol errors.

- [ ] **Step 4: Manual verification checklist**

Start the dev server (`bun start`) and confirm:
- Desktop: sticky sidenav highlights the in-view section; clicking scrolls smoothly. Mobile (≤`lg`): chip row scrolls horizontally and navigates.
- Details: click a field → edit → blur commits → sticky save bar appears → Save persists (and `doc_version` refetches). `Ctrl/⌘+S` saves; `Esc` cancels a field.
- BU table: search, Active/Inactive chips, column sort, capacity meter colors, Add disabled at cap.
- Users table: search, chips, inline role/parent-BU edit, remove (confirm), select rows → bulk Remove (confirm) and Move to BU with a forced failure → summary toast "N updated, M failed".
- Permissions: revoke `cluster.update` → Details read-only, no Add/checkboxes/inline editors/remove.
- Not-found id → EmptyState. Dev debug sheet shows cluster/BU/users tabs.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClusterEdit.test.tsx
git commit -m "test(cluster-edit): move gating assertions to edit-in-place model"
```

---

## Self-Review

**Spec coverage:**
- Decompose into `src/pages/clusterEdit/` → Tasks 1–11. ✓
- Sticky sidenav + scrollspy → Tasks 1, 10, 11. ✓
- Edit-in-place + sticky save bar + preserved doc_version/not-found/Can/debug/shortcuts → Tasks 6, 11, 12. ✓
- Search/filter/sort (BU + Users) → Tasks 2, 8, 9. ✓
- Inline edit → Tasks 4, 9. ✓
- Bulk actions (N sequential requests, per-item errors, summary) → Tasks 5, 9, 11. ✓
- Licensing insight (CapacityGauge/Meter reuse) → Tasks 8 (meter), 11 (hero). ✓
- `is_active` inline/bulk conditional on swagger → deferred/omitted per spec note (Task 9 omits bulk status; inline status stays read-only Badge). ✓
- Testing plan → Tasks 1–12 each ship tests; page integration in 12. ✓

**Placeholder scan:** Task 11 intentionally shows an abridged orchestrator skeleton with explicit "KEEP verbatim from the current file" instructions rather than re-printing ~300 lines of unchanged load/save/dialog code; every NEW piece (commit/validate handlers, canEdit, navItems, bulk handlers, save handler shape) is given in full. This is a deliberate "modify existing file" task, not a placeholder.

**Type consistency:** `SortState`/`cycleSort`/`sortRows` (Task 2) used consistently in Tasks 8. `BulkAction` (Task 3) used in Task 9. `InlineCell` props (Task 4) match Task 9 usage. `useClusterUsers` return shape (Task 5) matches orchestrator wiring (Task 11). `DetailsSection` props (Task 6) match Task 11. `ClusterEditNav`/`NavItem` (Task 10) match Task 11.

**Known implementation-time adjustments (flagged inline, not placeholders):** exact `ConfirmDialog` confirm-button label in the UsersSection test; `InlineField` empty-value placeholder text for the "Unlimited" assertion; possible removal of the `clusterId` prop from `UsersSection` if unused after wiring. Each is called out at its step.
