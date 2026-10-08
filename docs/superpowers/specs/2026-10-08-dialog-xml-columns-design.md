# Dialog XML Columns (`Cols` / `ColSpan` / `<Group>`)

**Date:** 2026-10-08
**Repos:** `carmen-platform`, `carmen-inventory-frontend-react`, `micro-report` (tests only)
**Branch (every repo):** `feature/dialog-xml-columns`
**Status:** Design approved, awaiting spec review
**Follow-up (separate spec):** drag-and-drop visual layout editor — see [Out of scope](#out-of-scope)

## Problem

A report template's filter dialog (`tb_report_template.dialog`) is a flat XML
list of `<Label/>` + control pairs. Every renderer draws it one field per row,
so long dialogs (`Purchase_Order_Detail_Report`: 16 controls) are tall, and the
template author has no way to lay fields out in columns.

The XML is read in **four** places, not one:

| Reader | File | How it reads today |
|---|---|---|
| Platform preview | `carmen-platform/src/components/DialogPreview.tsx` | Direct children of `<Dialog>` only; fixed `sm:grid-cols-2`; **no** From/To range pairing |
| Inventory run dialog | `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.ts` | Direct children only; one column (`FieldGroup`); auto-pairs From/To into range fields |
| Inventory schedule form | `carmen-inventory-frontend-react/routes/report/schedules/parse-schedule-dialog.ts` | Direct children only; flat field list |
| micro-report filter header | `micro-report/service/template_filter_inject.go` (`parseDialogDefs`) | Streaming token walk — reads **every depth**; uses `<Label Text>` as the printed filter name |

Consequences: the preview already disagrees with what users see (2 columns vs 1,
16 cells vs 9 for `Purchase_Order_Detail_Report`), and any wrapper element added
to the XML would make the inventory parsers **silently drop** the wrapped fields.

## Current data (scan of DEV snapshot, 2026-10-08)

Source: `reports-backup/report-templates/dev/` (18 dialogs). The `prod/` snapshot
folder is empty — production has never been backed up.

- All 18 parse; no orphan labels, unlabeled controls, duplicate names, unknown
  tags, or `Visible="false"` labels.
- Elements in use: `Label` 129, `Lookup` 98, `Date` 31. Attributes in use:
  `Text`, `Name`, `Value`, `DataSource`, `Items`, `Values`, `Multi`.
- Inventory renders the 129 controls as **76 cells, 61 of them From/To ranges**.
  The remaining singles are `Status`, `Period`, `GroupBy`, `As at Date`.
- Largest: `Purchase_Order_Detail_Report` 9 cells, `Receiving_Detail_Report` 7,
  `Stock_In/Out_Detail_Report` 6.
- Drift: micro-report's seed `Credit_Note_Detail_Report.dialog.xml` has a
  `Group By` row that DEV does not. Must be reconciled before the next reseed
  (not part of this work).

No current template needs `<Group>`: the "one label, several controls" look is
already produced for all 61 ranges by auto-pairing. `Cols` + `ColSpan` alone can
lay out every existing template. `<Group>` is kept because the user wants it, and
is built **last**.

## Decisions (from brainstorming)

- **Both sides:** platform preview and inventory runtime support the new format
  together. The preview must show what users will see.
- **Group shape A:** `<Group>` wraps ordinary `Label`+control pairs; it is a
  layout box only. micro-report keeps reading labels with no code change.
- **`ColSpan` also on single controls**, so widening one field needs no `<Group>`.
- **Default `Cols` = 1** on both sides. Every existing template renders exactly as
  today in inventory; the preview changes from 2 columns to 1 to match.
- **No auto range-pairing inside `<Group>`** — a Group is the author's explicit
  layout. Outside Groups, pairing is unchanged.
- **Approach 1:** one written format spec + one shared fixture set; each repo
  keeps its own parser and runs the fixtures as tests. No shared package.
- **Forward compatibility:** unknown attributes and elements are ignored, never
  an error. Layout attributes are parsed into one `layout` object so new ones
  add a field instead of reshaping types.
- **Preview gains range pairing** and the inventory modal widens with `Cols`
  (both found by the scan, accepted).
- **Tests:** write parser tests against the shared fixtures (overrides the
  user's default "skip tests" preference for this work — the fixtures are the
  cross-repo consistency mechanism). No component/page tests; UI is verified in
  the browser.

## Format rules

```xml
<Dialog Cols="3">
  <Group ColSpan="2">
    <Label Text="Date From"/><Date Name="DateFrom" Value="@today"/>
    <Label Text="Date To"/><Date Name="DateTo" Value="@today"/>
  </Group>
  <Label Text="Group By"/><Lookup Name="GroupBy" Items="A~B" Values="a~b"/>
  <Label Text="Vendor"/><Lookup Name="Vendor" DataSource="@vendor_list" ColSpan="3"/>
</Dialog>
```

### `Cols` on `<Dialog>`

- Integer 1–4. Absent → **1**.
- Not an integer, or < 1 → 1. > 4 → 4. (4 is the cap because the inventory
  dialog is a modal; five Lookups across become unreadable.)

### Cells

Direct children of `<Dialog>` form cells, in document order:

1. A visible `Label` followed by a `Date`/`Lookup` → field (inventory's existing rule).
2. `<Group>` → group cell.

Everything else is dropped by inventory and therefore by the preview too, which
lists a warning instead of drawing it: a control with no visible `Label` in
front (`controlWithoutLabel`), a `Label` with no control after it
(`labelWithoutControl`), and any element other than `Label`/`Date`/`Lookup`/
`Group` (`unknownElement`). (Revised after the final review: the preview used to
draw these, which shifted the grid away from what inventory shows.)

Inventory's existing range auto-pairing (`Label`, `XFrom`, `Label`, `XTo`, or a
`"to"`/invisible second label) still collapses four elements into one **range**
cell outside Groups. The platform preview adopts the **same** pairing rule.

### `ColSpan`

- Allowed on `<Group>` and on the **control** element (`Date`, `Lookup`, any
  other control). Not on `<Label>` — the label is optional, the control is not.
- Integer ≥ 1. Absent or invalid → 1. > effective `Cols` → effective `Cols`.
- A range cell takes the `ColSpan` of its **From** control.

### `<Group>`

- Children are `Label`+control pairs, laid out side by side, equal width; the
  inner column count is the number of pairs (capped at 4, wrapping after).
- No range auto-pairing inside.
- Nested `<Group>` is not supported: its children are lifted into the outer
  Group in place (fields are never lost).
- Empty `<Group>` is skipped.
- `Cols` and `Label` on `<Group>` are **reserved** for future use and have no
  effect now.

### Everywhere

- Unknown attributes/elements are ignored, never an error. Both renderers show
  only `Date` and `Lookup`; the preview warns `unknownElement` for anything else.
- Below `sm` (640px): one column, `ColSpan` ignored, Group contents stack.
- Grid flows row by row in document order with no dense packing; a span that
  does not fit leaves a gap. Order matching the XML beats tightness.
- `<Label Visible="false">` behaves as today.

### Correction policy

Inventory corrects invalid values **silently**. The platform preview applies the
**same** correction and **lists a warning** for each one (`Cols` clamped/invalid,
`ColSpan` clamped/invalid, `ColSpan` on a `Label`, nested Group lifted, empty
Group skipped, element other than `Date`/`Lookup`), so the author learns at edit time.

## Parsers and types

### Platform — `src/utils/dialogXml.ts` (new, pure)

`parseDialogXml` moves out of `DialogPreview.tsx`. It no longer takes `t`;
errors and warnings are codes, translated by the component.

```ts
interface DialogLayout { colSpan: number } // new layout attributes add fields here
interface DialogField {
  key: string;
  label?: string;
  element: Element | null;
  layout: DialogLayout;
}
type DialogCell =
  | ({ kind: 'field' } & DialogField)
  | { kind: 'range'; key: string; label: string; from: DialogField; to: DialogField; layout: DialogLayout }
  | { kind: 'group'; key: string; layout: DialogLayout; fields: DialogField[] };
type DialogWarning =
  | { code: 'colsClamped' | 'colsInvalid'; raw: string; used: number }
  | { code: 'colSpanClamped' | 'colSpanInvalid'; raw: string; used: number; at: string }
  | { code: 'nestedGroupFlattened' | 'emptyGroup' | 'colSpanOnLabel'; at: string }
  | { code: 'unknownElement'; at: string; tag: string };
interface DialogParseResult {
  ok: boolean;
  error?: 'empty' | 'parse' | 'noDialogRoot';
  errorDetail?: string;
  cols: number;
  cells: DialogCell[];
  counts: Record<string, number>; // includes controls inside groups and both ends of ranges
  warnings: DialogWarning[];
}
```

`at` names the offending element (its `Name`, else its tag and position).

### Inventory — `routes/report/list/parse-report-dialog.ts`

- `RangeField` and `SingleField` gain `colSpan: number`.
- `parseReportDialog` returns `{ cols: number; cells: DialogCell[] }` where
  `DialogCell = FormField | GroupCell` and
  `GroupCell = { kind: 'group'; colSpan: number; fields: SingleField[] }`.
- New `flattenFields(cells): FormField[]` so `collectDataSources`,
  `needsPeriods`, and filter submission keep their current logic.
- Lookup injection (`enrichedFields` in `report-param-dialog.tsx`) maps over
  cells and into groups.
- Group is a real node (not a `groupId` tag on flat fields) so the reserved
  `Group Cols`/`Group Label` have a home later.

### Inventory — `routes/report/schedules/parse-schedule-dialog.ts`

Descends into `<Group>` (including nested) and still returns a flat list. No
multi-column layout on the schedule form — it is a different form; the only
requirement is that no field disappears.

### micro-report

No code change. `parseDialogDefs` already walks every depth. Add a Go test that
feeds a dialog with a Group and a nested Group and asserts ordered label/name
pairs are complete and correct.

## Rendering

### Shared class tables

Tailwind JIT cannot see composed class names, so both repos use literal tables:

```ts
const GRID_COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };
const COL_SPAN  = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' };
const MODAL_W   = { 1: '', 2: 'sm:max-w-3xl', 3: 'sm:max-w-5xl', 4: 'sm:max-w-5xl' };
```

Every grid starts with `grid-cols-1` for mobile.

### Inventory — `report-param-dialog.tsx`

- `<FieldGroup className="gap-3">` becomes a grid driven by `cols`; each cell
  gets `COL_SPAN[colSpan]`.
- Range and single cells keep the existing `<Field>` + `<FieldControl>`;
  `RangeRow` is untouched.
- Group cell: a `<div>` with `COL_SPAN`, containing an inner
  `grid-cols-1 sm:grid-cols-{min(pairs,4)}` grid of the existing `<Field>`s.
- `DialogContent` (currently `sm:max-w-lg` from `components/ui/dialog.tsx`)
  gets `MODAL_W[cols]`; `cn`/tailwind-merge replaces the default.
- Lookup popovers are already widened independently
  (`popoverWidth="w-[min(92vw,32rem)]"`), so narrower cells do not narrow the
  option list.
- A template without `Cols` must look **identical** to today — verify in the
  browser, since `FieldGroup` may carry more than a gap.

### Platform — `DialogPreview.tsx`

- Renders `cells`: range → label with trailing " From" stripped + disabled
  From/To pair (mirrors `RangeRow`); field → as today; group → inner grid.
- The preview canvas is capped at the real modal width for its `Cols`
  (`max-w-lg` / `max-w-3xl` / `max-w-5xl`), so cell widths are honest.
- Header row adds a `"{n} cols"` badge and a warning-count badge next to the
  existing field-count badge.
- Warnings render above the grid as a list using the `--warning` token, one line
  each (e.g. `ColSpan="5" on ProductFrom clamped to 3`).
- Transition guard: while inventory production lacks Group support, any
  `<Group>` triggers an extra notice (computed in the component from
  `cells`, not a parser warning, so removing it touches one line) that it needs the newer inventory
  release. Removed once inventory production ships Group.
- New strings go under `components.dialogPreview.*` in both `en.ts` and `th.ts`.

## Shared fixtures

`carmen-platform/docs/dialog-xml/fixtures/` holds the canonical set; the
inventory repo keeps a copied set under its parser tests. Each fixture is an
`.xml` with a sibling `.expected.json` describing the expected `cols`, cell
kinds, spans, and field names in order (warnings are platform-only).

- The 18 DEV dialogs, unchanged (must parse to `cols: 1` and today's cells).
- `cols-invalid`, `cols-over-max`, `colspan-over-cols`, `colspan-on-label`,
  `colspan-on-range-from`, `group-basic`, `group-nested`, `group-empty`,
  `unknown-attrs-and-elements`, `colspan-with-cols-1`.

Parser tests in both repos load every fixture and compare against its
`.expected.json`. The inventory copy is refreshed by hand whenever the
canonical set changes; no cross-repo sync tooling (YAGNI).

## Rollout

`Cols`/`ColSpan` are safe in any order: current inventory ignores unknown
attributes, so a template that sets `Cols` early still renders one column.

`<Group>` is the one hazard: on an inventory build that predates this work,
grouped fields vanish silently. **Rule:** no real template uses `<Group>` until
the Group-capable inventory release is on **production**. (Per memory, the
inventory's production environment is named "UAT" — re-verify at deploy time.)
micro-report ships nothing (tests only).

## Build order

Branch `feature/dialog-xml-columns` in each repo; name the branch explicitly when
dispatching any subagent into a sibling repo.

1. Fixtures + this spec's format section as `docs/dialog-xml/README.md`
   (platform).
2. Inventory: parser (`cols`, `colSpan`, `flattenFields`) → grid + modal width.
3. Platform: extract `utils/dialogXml.ts` + range pairing + warnings → preview
   rendering.
4. micro-report: Group test for `parseDialogDefs`.
5. **Group (last):** inventory parser + rendering; schedule parser descends;
   platform parser + rendering + warnings + transition guard.
6. Browser verification on both sides, wide and 390px (iframe probe).

## Verification

- `typecheck` + `lint` in both frontends; `go test ./service/...` in micro-report.
- Parser fixture tests green in platform and inventory.
- Every DEV dialog still yields 129/129 controls in inventory.
- In the browser: a template without `Cols` looks unchanged in inventory; the
  preview matches inventory for the same XML.
- First real use: set `Cols="2"` on `Purchase_Order_Detail_Report` on DEV, with
  the date range on `ColSpan="2"`.

## Out of scope

- **Drag-and-drop layout editor** — next spec. Approved direction: v1 edits
  layout only (reorder cells, `ColSpan`, `Cols`, drag in/out of Group) by
  mutating the XML DOM in place so unknown attributes survive; field properties
  stay in the XML editor. `@dnd-kit/core` + `@dnd-kit/sortable` are approved for
  the platform (already used by inventory).
- Multi-column schedule form.
- Mobile preview toggle.
- `Group Cols` / `Group Label` behaviour (reserved only).
- Reconciling the `Credit_Note_Detail_Report` seed/DEV drift; backing up prod.
