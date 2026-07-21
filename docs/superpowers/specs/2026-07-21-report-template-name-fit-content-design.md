# Report Template — Name column fit-content

**Date:** 2026-07-21
**Scope:** Frontend UI tweak, 2 files
**Page:** `/report-templates` (`ReportTemplateManagement.tsx`)

## Problem

On the Report Templates list, the **Name** column truncates long names at
`max-w-[220px]` with an ellipsis (`…`). Users want the Name column to size to
its content — show the full name on a single line, no truncation.

## Root cause

The shared `DataTable` wrapper (`src/components/ui/data-table.tsx:263`) hardcodes
`table-fixed` on the `<table>`. Fixed table layout distributes column widths
independently of content, so no per-column tweak can make a column "fit content".
Content-based sizing requires `table-auto`.

## Chosen behavior

**Fit content, single line, no truncation.** The Name column grows to exactly the
width of the longest visible name. Accepted trade-off (confirmed with user): a very
long name can push the table past the viewport and trigger horizontal scroll — the
existing `overflow-x-auto` wrapper (`data-table.tsx:262`) already handles this. No
max-width cap, because the user chose "no truncation".

Rejected alternatives:
- *Wider fixed width + graceful truncate* — still truncates, not true fit.
- *Wrap to multiple lines* — taller rows, user wanted single line.

## Design

Backward-compatible: every page that already uses `DataTable` keeps `table-fixed`.
Only `report-templates` opts in to `table-auto`.

### File 1 — `src/components/ui/data-table.tsx`

Add an optional prop:

```ts
tableLayout?: 'fixed' | 'auto';   // default 'fixed'
```

Wire it into the `<Table>` className (currently a static string):

```tsx
<Table className={cn(
  "min-w-[640px] table-sticky-left table-sticky-right",
  tableLayout === 'auto' ? 'table-auto' : 'table-fixed'
)}>
```

`cn` is already imported. Default `'fixed'` preserves current behavior everywhere.

### File 2 — `src/pages/ReportTemplateManagement.tsx`

1. Pass `tableLayout="auto"` to `<DataTable>`.
2. Name column cell: replace `truncate max-w-[220px]` with `whitespace-nowrap`,
   keep `title={row.original.name}` for the hover tooltip.

Other columns already carry their own width constraints (`Description` and
`Source` name both `max-w-[200px]`, `Status` `w-32`, actions `w-20`, `#` `w-8`),
so under `table-auto` only Name expands to content; the rest stay bounded.

## Risks

- **Sticky-left offset.** With no row-selection column, `#` is column 1 (sticky
  `left:0`) and Name is column 2 (sticky `left:40px`, hardcoded in
  `src/index.css`). Under `table-auto` the `#` column sizes to content and could
  differ slightly from the assumed 40px, shifting the Name pin when scrolled
  horizontally. Low impact (only visible mid horizontal-scroll on desktop, rare).
  Verify visually in-browser after implementing.

## Testing

- **New** `src/components/ui/data-table.test.tsx`: renders `DataTable` and asserts
  the `<table>` has `table-fixed` by default and `table-auto` when
  `tableLayout="auto"`.
- **Extend** `src/pages/ReportTemplateManagement.test.tsx`: the Name link has
  `whitespace-nowrap` and does **not** have `truncate`.

Layout metrics (actual pixel widths) can't be asserted in jsdom; class presence is
the proxy. Final look confirmed manually in the browser.

## Out of scope

- Other management pages (Cluster, BusinessUnit, User, …) — untouched, stay fixed.
- No change to `table-fixed` default, sticky CSS, or the `Table` primitive.
