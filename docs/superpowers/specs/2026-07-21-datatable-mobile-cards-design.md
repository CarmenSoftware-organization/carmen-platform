# Responsive Card View for DataTable — Design

**Date:** 2026-07-21
**Status:** Approved (design), pending implementation plan
**Scope:** `src/components/ui/data-table.tsx` (shared primitive), `src/hooks/useMediaQuery.ts` (new), `src/pages/ClusterManagement.tsx`, `vitest.setup.ts`

## Problem

On viewports narrower than a laptop, the `DataTable` renders a `min-w-[640px]` table inside a
horizontal-scroll container with frozen sticky columns. On a phone (~375px) the table always
scrolls sideways; on a tablet where the fixed sidebar eats width it scrolls too. Reading a row
means panning left/right. We want small screens to show one **card per row** instead — content
stacked vertically, no horizontal scroll.

`DataTable` is a shared primitive used by ~8 management pages (clusters, business units, users,
news, roles, applications, report templates, print-template mappings). Building the card view
into `DataTable` gives every page the behavior for free.

## Decisions

| Topic | Decision |
|---|---|
| Where | Build into the shared `DataTable` primitive — every management page benefits |
| Card strategy | **Hybrid** — auto-derive a card from the existing `columns` by default; optional per-column `meta.card` hints for polish |
| Breakpoint | **`< lg` (1024px)** renders cards; `>= lg` renders the table |
| Card tap | Only real links/buttons are interactive (mirrors desktop) — no whole-card tap; no permission concerns |
| Sort on mobile | No sort control in v1 — the persisted sort still applies |

## Architecture

### Breakpoint switch — `useMediaQuery` hook (new)

Add `src/hooks/useMediaQuery.ts`, following the existing `useDarkMode` matchMedia pattern:

```ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
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

- Lazy `useState` initializer reads `matchMedia().matches` synchronously → **no flash** of the
  wrong layout on first paint (this is a Vite SPA, `window` always exists).
- `DataTable` computes `const isDesktop = useMediaQuery(mobileBreakpoint)` and renders **only one
  branch** — the table **or** the cards, never both.

**Why not a CSS-only `lg:hidden` toggle?** Rendering both and hiding one with CSS keeps the hidden
table mounted, so its `useLayoutEffect` + `ResizeObserver` (the sticky-column measurement) run for
nothing, doubles the DOM, and — critically — jsdom does not evaluate media queries, so component
tests could not tell the two layouts apart. A JS `matchMedia` hook renders one branch and is
mockable in tests (precedent: `src/components/Sidebar.test.tsx` already mocks `matchMedia`).

### DataTable API additions

```ts
mobileCards?: boolean;       // default true — enable card view under the breakpoint
mobileBreakpoint?: string;   // default '(min-width: 1024px)' — desktop = table
```

Both optional and defaulted, so existing call sites need no changes to get the behavior.

### Card rendering — reuse the same table instance

A `MobileCardList` sub-component (same file) reuses the `table` object already built by
`useReactTable`. It iterates `table.getRowModel().rows`, and for each row renders a `<Card>` in
place of a `<tr>`, iterating `row.getVisibleCells()` and placing each cell by the kind of its
column. Cells are rendered with the **same `flexRender(cell, cell.getContext())`** used in the
table body, so every cell (Link, `CapacityMeter`, `Badge`, actions dropdown) renders identically —
this is a **re-layout, not a re-implementation**. No separate data mapping.

### Column → card placement rules

| Column | Placement in card |
|---|---|
| `id: 'rowIndex'` (`#`) | Skipped |
| `id: 'select'` | Checkbox, top-left of the card (only when `enableRowSelection`) |
| `id: 'actions'` **or** `meta.card === 'actions'` | Top-right of the card (`[⋮]` menu) |
| `meta.card === 'title'` | Card title line (multiple joined with ` · `) |
| `meta.card === 'badge'` | Chip beside the title |
| `meta.card === 'hidden'` | Skipped on the card |
| anything else | `label : value` row (label = the column's string `header`, if any) |

**Default (no hints):** every column except `#`/`select`/`actions` becomes a `label : value` row —
so any page that renders `DataTable` gets a usable card immediately, before anyone adds hints.

`meta.card` is an optional field added to the column `meta` object (alongside the existing
`headerClassName` / `cellClassName`). Vocabulary is intentionally small: `'title' | 'badge' |
'hidden' | 'actions'`.

### Row selection support

`UserManagement` and `NewsManagement` use `enableRowSelection` with bulk actions. The card **must**
render the selection checkbox (the existing `select` cell) so bulk-select keeps working under the
breakpoint. Placed top-left of each card.

## Clusters — meta.card hints

`ClusterManagement.tsx` column `meta` gains card hints:

```
code       → meta.card: 'title'
name       → meta.card: 'title'          // title line: "HQ-01 · Head Office"
is_active  → meta.card: 'badge'          // status chip beside the title
bu_count   → (default) label:value "Business units"  — CapacityMeter unchanged
user_count → (default) label:value "Users"           — CapacityMeter unchanged
created_at → (default) label:value "Created"
updated_at → meta.card: 'hidden'         // reduce noise; full audit lives on the edit page
deleted_at → (default) label:value       // conditional column, destructive style kept
actions    → top-right (auto from id === 'actions')
```

Card shape (mobile):

```
┌──────────────────────────────┐
│ HQ-01 · Head Office     [⋮]   │
│ ● Active                      │
│ Business units   3 / 10       │
│ Users            45 / 200     │
│ Created          2026-01-15   │
└──────────────────────────────┘
```

## States

- **Empty / error**: unchanged — the page handles these (`ListEmptyState`) before `DataTable`
  renders. Not in scope here.
- **"No results" inside the table**: card mode shows the same message.
- **Loading skeleton**: v1 keeps the existing `TableSkeleton` (owned by the page, not `DataTable`).
  On mobile it briefly shows a table-shaped skeleton — a minor cosmetic mismatch. A card skeleton
  is a possible follow-up, out of scope for v1.
- **Pagination footer**: reused as-is — it already has a mobile layout (prev/next + page indicator +
  page-size buttons).

## Testing

- `src/hooks/useMediaQuery.test.ts` — mock `window.matchMedia`; assert the hook reflects `matches`
  and responds to a `change` event.
- `src/components/ui/data-table.test.tsx` — mock `matchMedia` for mobile → assert cards render (row
  text, links, `[⋮]` menu, and the selection checkbox when `enableRowSelection`) and no `<table>`;
  mock desktop → assert the `<table>` renders and no cards.
- **`vitest.setup.ts`** — add a default `window.matchMedia` polyfill returning `matches: false`.
  This is required: once `DataTable` calls `matchMedia`, every existing management-page test that
  renders it would otherwise throw in jsdom. Defaulting to `false` = desktop = table, so all
  existing tests keep asserting the table and stay green.
- Existing `ClusterManagement.test.tsx` continues to run at the desktop default (table); the
  clusters `meta.card` hints do not affect table rendering.

## Files touched

- `src/hooks/useMediaQuery.ts` (new) + `useMediaQuery.test.ts` (new)
- `src/components/ui/data-table.tsx` — card rendering, `useMediaQuery` wiring, `meta.card` support
  (a `ui/` primitive change, justified by the approved scope) + `data-table.test.tsx` (new)
- `src/pages/ClusterManagement.tsx` — add `meta.card` hints to columns
- `vitest.setup.ts` — `matchMedia` polyfill

## Out of scope (YAGNI)

- Sort control on mobile (persisted sort still applies)
- Card-shaped loading skeleton (keep `TableSkeleton` for v1)
- Adding `meta.card` hints to the other management pages — they get the auto `label:value` card by
  default; polish per-page later
- Whole-card tap to navigate
