# Dialog Layout Editor: property panel

**Date:** 2026-10-09
**Repo:** `carmen-platform` only
**Branch:** `feature/dialog-property-panel`
**Builds on:** `2026-10-08-dialog-layout-editor-design.md` (drag-and-drop editor) and
`2026-10-08-dialog-control-label-attr-design.md` (`Label` on controls and groups)
**Status:** Design approved, awaiting spec review

## Problem

The layout editor arranges cells but every field property — label text, `Name`,
`DataSource`, `Items`/`Values`, `Multi`, default `Value` — still has to be typed
into the Dialog XML tab. Authors need to edit them from the Preview.

This is spec **A** of the three follow-ups (B: `Label` attribute — merged; C:
add/remove fields — next).

## Decisions (from brainstorming)

- **Scope B:** the basic set (label text, `Name`, `Value`, `Multi`, `ColSpan`,
  group heading) **plus** the Lookup data source (`DataSource`, or an
  `Items`/`Values` table).
- **DataSource list A:** a constant copy of inventory's `dataSourceMap` keys
  (11 values) in platform. A combobox that also accepts free text; a value not in
  the list gets a warning. The list must be updated together with inventory.
- **Placement:** a panel to the right of the canvas.
- **Commit timing A:** a field writes to the XML on blur or Enter. Invalid input
  shows an error under the field and is **not** written. Esc in a field restores
  the last written value.
- **Label location A:** edit the label where it lives — `<Label Text>` for a
  classic field, the `Label` attribute for a self-labelled field. Never convert
  between the two (avoids the `Label=` rollout rule).
- **Approach 1:** pure `xml → xml` ops in `dialogXmlEdit.ts`, a separate pure
  validation module, and a panel component. Rejected: string/regex edits — every
  other op works on the DOM.

## Data flow

```
blur / Enter → validate → ok: op(xml) → onChange(xml) → formData.dialog → re-render
                        → error: message under the field, XML unchanged
```

No new source of truth: the panel reads the focused cell from the parsed XML on
every render and writes only through `onChange`, like every other editor op.

## Focus (which cell the panel edits)

- Clicking the body of a cell (not its toolbar, handle, or checkbox) makes it the
  **focused cell**: a highlighted ring, and the panel shows its form. Fields inside
  a group can be focused on their own.
- Focus is separate from the grouping checkboxes.
- State is `{ xml, key }`, same pattern as the selection: attribute-only ops keep
  it (`applyKeepingSelection`); any op that changes keys (move, group, ungroup)
  drops it.
- No focused cell → the panel shows "Click a field to edit its properties".
- Keyboard: Enter / Space on a focused cell (Tab order) moves focus into the panel.

## Edit ops — `src/utils/dialogXmlEdit.ts`

Same contract as the existing ops: `(xml, …) => string`, never throw, return the
input unchanged when the XML does not parse or the key is not found. Attribute
edits never re-layout whitespace.

| Op | Behaviour |
|---|---|
| `setControlAttrs(xml, key, side, patch)` | `side`: `'from' \| 'to'` for a range, `undefined` for a field (top level or in a group). `patch: Record<string, string \| null>`; `null` or `''` removes the attribute. Only the listed attributes change. |
| `setLabelText(xml, key, side, text)` | Classic field / range From side → `Text` on its `<Label>` element. Self-labelled field → its `Label` attribute. Never converts. A range's To side is not editable (`side: 'to'` returns the input). |
| `setGroupLabel(xml, groupKey, text)` | Sets `Label` on `<Group>`; empty / whitespace removes it. |

`ColSpan` keeps using `setColSpan`.

## Validation — `src/utils/dialogXmlValidate.ts`

Pure functions returning i18n keys (errors block the write; warnings do not).

- `Name`: required; must match `^[A-Za-z_][A-Za-z0-9_]*$`; must be unique among
  **all** controls in the dialog, including inside groups (micro-data uses names
  as filter keys). Error.
- `Items` / `Values`: same row count, no empty row, no `~` inside a value. Error.
- Renaming a range side so that the pair no longer matches `XFrom` / `XTo`
  (named pair) and there is no `to` / hidden label between them → the range will
  split into two fields. Warning.
- `DataSource` not in the known list → inventory passes it through as-is. Warning.
- Label text may be empty (preview already warns `emptyLabel` / falls back).

## DataSource list — `src/utils/dialogDataSources.ts`

The 11 keys of inventory `routes/report/list/parse-report-dialog.ts`
`dataSourceMap`, each with an English description:
`@product_list`, `@category_list`, `@subcategory_list`, `@itemgroup_list`,
`@location_list`, `@location_inventory_list`, `@location_direct_list`,
`@location_consigment_list` (spelling as in inventory), `@location_count_list`,
`@vendor_list`, `@period_list`. `docs/dialog-xml/README.md` notes that this list
must change together with `dataSourceMap`.

## Panel — `src/components/dialogPreview/PropertyPanel.tsx`

Split into per-kind form files if it grows past ~250 lines.

**Layout**
- `≥ lg`: canvas left (`flex-1 min-w-0`, existing `CANVAS_W`), panel right
  (`w-72 shrink-0`, `sticky top-4`).
- `md`–`lg`: panel below the canvas.
- `< md`: no editor, no panel (unchanged).
- Header: kind + name (e.g. "Lookup · Vendor") and a × that clears focus.
- `<aside aria-label>`; errors tied to inputs with `aria-describedby`.

**Date field:** Label, Name, default `Value` (text; hint that `@today` works),
ColSpan stepper.

**Lookup field:** Label, Name, then a **Data source | Fixed list** switch:
- Data source: `DataSource` combobox (11 values + free text, warning when unknown).
- Fixed list: a two-column table **Shown text (`Items`) | Value sent (`Values`)**
  with add, remove, move up/down. The table writes once when focus leaves the
  whole table (never mid-edit with unequal rows).
- Switching mode writes the chosen side and removes the other (`DataSource`
  removed when switching to Fixed list, `Items`/`Values` removed when switching to
  Data source). Switching to Fixed list with no rows writes nothing until a row
  exists.
- `Multi` checkbox: on → `Multi="true"`, off → removed.
- Default `Value`: a select over `Values` plus "None" in Fixed-list mode; free text
  in Data-source mode.
- ColSpan stepper.

**Range:** the range label (`Text` of the From side's `<Label>`), then a **From**
and a **To** section, each with the control fields of its kind (no Label, no
ColSpan). The To label is not editable — it is what makes the pair (`to` / hidden).
A "Same as From" button copies `DataSource` or `Items`/`Values` to To in one
write. ColSpan stays at range level (From control), as today.

**Group:** heading (`Label`, may be empty), ColSpan, Ungroup. A field inside a
group shows the field form without ColSpan (fields in a group take no span).

**Other attributes** (`Tooltip`, unknown ones): untouched; listed read-only at the
bottom of the panel with "Edit in the Dialog XML tab".

**Esc:** Esc inside a panel input restores its last written value and must not
trigger the page's Cancel shortcut — the panel reports "editing active" through
the same ref path the drag uses (`onDragActiveChange` → `dialogDragActiveRef`
in `ReportTemplateEdit.tsx`, generalised to "editor busy").

## Testing

Unit tests for the pure modules only (same policy as the editor spec):

- `dialogXmlEdit.test.ts`:
  - `setControlAttrs` changes only the listed attributes — rest of the string
    byte-identical; `null`/`''` removes; `from`/`to` hit the right control; bad
    key / broken XML returns the input.
  - `setLabelText`: classic → `<Label Text>`, self-labelled → `Label=`, no
    conversion; `side: 'to'` is a no-op.
  - `setGroupLabel`: empty removes.
  - `"`, `&`, `<`, Thai text round-trip through serialize → parse unchanged.
- `dialogXmlValidate.test.ts`: empty / duplicate (incl. inside a group) / bad
  pattern `Name`; unequal / empty-row / `~` Items-Values; range-split warning;
  unknown DataSource warning.
- No component tests; the UI is verified in the browser.

Static checks: `bun run typecheck && bun run lint && bun run test`.

### Browser verification (local, never saved)

- Edit label, Name, DataSource, Items/Values → the Dialog XML tab changes at one
  spot only.
- Duplicate Name → error, XML unchanged.
- Esc in a panel input restores the value and does not cancel the page.
- Renaming a range side away from From/To → warning, range splits into two fields.
- Panel on the right at ≥ lg, below the canvas at md–lg.
- Tab / Enter / Space reach a cell and the panel.

## Files

- `src/utils/dialogXmlEdit.ts` (+ test), `src/utils/dialogXmlValidate.ts` (new,
  + test), `src/utils/dialogDataSources.ts` (new)
- `src/components/dialogPreview/PropertyPanel.tsx` (new; per-kind files if long)
- `src/components/dialogPreview/DialogLayoutEditor.tsx` (focus state, flex layout)
- `src/components/dialogPreview/SortableCell.tsx` (click-to-focus, ring)
- `src/pages/ReportTemplateEdit.tsx` (Esc guard reuse)
- `src/i18n/en.ts`, `src/i18n/th.ts`
- `docs/dialog-xml/README.md` (DataSource list sync note)

## Out of scope

- Adding / removing fields (spec C, next).
- A "convert `<Label>` to `Label=`" button (after inventory production).
- Editing `Tooltip` or unknown attributes.
- A backend endpoint for the DataSource list.
- Any inventory or backend change — the XML format does not change.
