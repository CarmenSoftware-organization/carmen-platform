# Dialog Layout Editor (drag and drop)

**Date:** 2026-10-08
**Repo:** `carmen-platform` only
**Branch:** `feature/dialog-layout-editor`
**Builds on:** `2026-10-08-dialog-xml-columns-design.md` (`Cols` / `ColSpan` / `<Group>`, merged in #337)
**Status:** Design approved, awaiting spec review

## Problem

Authors can now lay out a report filter dialog in columns, but only by typing
`Cols`, `ColSpan`, and `<Group>` into the XML by hand. They need to arrange the
layout directly on the preview.

## Decisions (from brainstorming)

- **v1 is layout only:** reorder cells, set `ColSpan`, set `Cols`, move cells in
  and out of `<Group>`, create and dissolve groups. Adding fields or editing
  field properties (`DataSource`, `Items`/`Values`, `Multi`, …) stays in the XML
  editor.
- **Location A:** the existing **Preview** tab becomes the editor while the page
  is in edit mode. In read mode it stays the static preview. No new tab.
- **Group creation A:** tick two or more cells, then press "Group". A group has
  an "Ungroup" button. Dragging only reorders or moves in/out of existing
  groups — a drop never means "merge".
- **Approach 1:** edit the XML DOM in place and serialize with `XMLSerializer`.
  A no-op round trip of all 39 fixtures through jsdom's
  `DOMParser` → `XMLSerializer` was byte-identical (probe run 2026-10-08).
- **Libraries:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are
  approved (the inventory repo already uses them).
- **Tests:** unit tests for the pure edit module only (user's choice A). No
  component tests; the UI is verified in the browser.

## Single source of truth

The page already keeps the dialog XML in `formData.dialog`, and both
`XmlEditor` and `DialogPreview` render from it; `XmlEditor` accepts external
value changes. The editor therefore holds **no copy of the XML**:

```
user action → dialogXmlEdit op(xml) → new string → onChange(xml)
  → handleXmlChange('dialog') → formData.dialog → preview + XmlEditor re-render
```

Unsaved-change guard, `doc_version`, Save/Cancel, and XML versions keep working
unchanged. The editor's only local state is the **selection**, cleared whenever
the XML string changes (keys may have shifted).

## Edit operations — `src/utils/dialogXmlEdit.ts`

Pure functions, each `(xml: string, …) => string`. Each one re-parses the XML,
finds cells by `key`, mutates the DOM nodes those cells point to, and
serializes. If the XML does not parse, has no `<Dialog>` root, or a key is not
found, the input string is returned unchanged — never a throw.

| Op | Behaviour |
|---|---|
| `setCols(xml, n)` | Sets `Cols` on `<Dialog>`; `n = 1` **removes** the attribute. Existing `ColSpan`s above `n` are left alone — the parser clamps and warns, and raising `Cols` again restores them. |
| `setColSpan(xml, key, n)` | Sets `ColSpan` on a field's control, a range's From control, or a `<Group>`. Clamped to 1..`Cols`; `1` removes the attribute. |
| `moveCell(xml, key, target)` | Moves all of a cell's nodes: field = Label + control; range = its 4 nodes; group = the `<Group>` element. `target` is `{ before: key }` (lands in whichever container holds that key — so `before` a field inside a group moves into that group), `{ end: 'dialog' }`, or `{ end: groupKey }`. Moving a cell before itself is a no-op. A group cannot move into a group. A group left empty is removed. A range moved into a group splits into two fields. |
| `groupCells(xml, keys)` | Requires ≥ 2 keys, all top-level field or range cells. Inserts a `<Group>` at the first selected cell's position and moves the selected cells into it in document order. Ranges split into two fields (no pairing inside groups). |
| `ungroup(xml, groupKey)` | Replaces the `<Group>` with its children in place. The group's `ColSpan` is dropped; From/To pairs re-pair on their own outside the group. |

### Whitespace

- Attribute-only ops (`setCols`, `setColSpan`) never touch whitespace.
- Ops that move nodes re-layout **only the containers they touch** (`<Dialog>`
  and/or the affected `<Group>`), in the convention all 18 real templates use:
  - a `Label` and its control share one line;
  - one pair per line, indented 2 spaces inside `<Dialog>` and 4 inside `<Group>`;
  - nodes that are not part of a cell (comments, labels with no control,
    unknown elements) keep their own line and their position relative to the
    neighbouring cells — never dropped, never carried along.
- Invariant: on a conventionally formatted template, moving a cell and moving it
  back yields the original string byte for byte.

## Parser changes — `src/utils/dialogXml.ts`

- `DialogField` gains `labelElement: Element` (for a range's To side this may be
  a hidden label). The group cell gains `element: Element` (the `<Group>`).
- New `parseDialogDocument(doc: Document): DialogParseResult`;
  `parseDialogXml(xml)` creates the document and delegates. Edit ops build the
  document themselves, parse it, and mutate the very nodes the cells reference.
- Keys stay derived from element positions, so they are stable for a given
  string. Existing fixture behaviour must not change.

## Components

`DialogPreview.tsx` (~250 lines) splits into a folder:

| File | Role |
|---|---|
| `components/DialogPreview.tsx` | Entry. Props `{ xml; onChange?; onDragActiveChange? }`. Renders the editor when `onChange` is set **and** the viewport is ≥ `md` (`useMediaQuery`); otherwise the static preview. Owns the header badges and the warnings list. |
| `components/dialogPreview/CellView.tsx` | `renderControl` / `FieldBlock` / `CellBlock` moved from `DialogPreview.tsx`; used by both modes. |
| `components/dialogPreview/warningText.ts` | `warningText` moved out. |
| `components/dialogPreview/DialogLayoutEditor.tsx` | `DndContext`, one `SortableContext` for the dialog and one per group, selection state, `Cols` picker, selection bar, `onDragEnd → moveCell`. |
| `components/dialogPreview/SortableCell.tsx` | Wraps `CellView` with `useSortable` and the cell toolbar; a variant for group cells. |

`ReportTemplateEdit.tsx` passes `onChange={editing ? handleXmlChange('dialog') : undefined}`
and an `onDragActiveChange` that writes a `useRef` the Cancel shortcut checks.

## Interaction

- **Header:** the "N cols" badge becomes a `1 | 2 | 3 | 4` segmented picker → `setCols`.
- **Cell toolbar** (top-right, shown on hover or keyboard focus):
  - drag handle (`GripVertical`, `aria-label`) — the only drag start point;
  - `− n +` ColSpan stepper, disabled at 1 and at `Cols`, hidden when `Cols = 1`;
  - checkbox for grouping — top-level field and range cells only.
- **Group cell:** dashed box with a header: "Group" label, drag handle, ColSpan
  stepper, "Ungroup". Fields inside have their own handles to reorder within the
  group or drag out.
- **Selection bar** (≥ 2 ticked): "Group N cells" and "Clear". If a range is
  ticked, it says the range will split into two fields.
- **Dragging:** `PointerSensor` with a 5px activation distance (clicks on
  toolbar buttons are not swallowed); `KeyboardSensor` with
  `sortableKeyboardCoordinates` (Space to lift/drop, arrows to move, Esc to
  cancel); `rectSortingStrategy` for the grid. Cells shift live while dragging,
  but the XML changes **once, on drop** (one `moveCell`). A group dropped on a
  group target is rejected.
- **Esc trap:** the page binds Esc to Cancel (`useGlobalShortcuts`). While a drag
  is active, the page's Cancel handler must ignore Esc — via the `useRef` set by
  `onDragActiveChange` (a ref, not state: see the Radix dismiss-layer lesson).
- **Below `md`:** editing is off; the static preview shows with a one-line note
  that layout can be arranged on a wider screen.
- **Invalid XML / no `<Dialog>` / empty:** no editor; the existing error or empty
  state shows, telling the author to fix the XML in the Dialog XML tab.
- **Group rollout notice** from the previous spec still shows whenever a group
  exists; the editor does not block creating one.

## Testing

Unit tests for `src/utils/dialogXmlEdit.ts` only:

- every op against the shared fixtures in `docs/dialog-xml/fixtures/`;
- move-then-move-back returns the original string byte for byte;
- comments and unknown elements survive every op in place;
- a range moved or grouped into a group splits into two fields; ungrouping
  re-pairs it;
- empty group removed after its last cell moves out;
- bad key or unparsable XML returns the input unchanged;
- `setCols(…, 1)` / `setColSpan(…, 1)` remove the attribute.

Existing `dialogXml` tests must stay green after the parser change.

### Browser verification (local, never saved)

- Chrome's own `XMLSerializer` round-trips all 18 real templates byte for byte
  (only jsdom was proven).
- Esc during a keyboard drag cancels the drag, **not** the page.
- Whether Ctrl+Z in the Dialog XML tab undoes an editor change — record the
  result; acceptable either way.
- Reorder, ColSpan, Cols, group, ungroup, drag in/out of a group — then Cancel.
- Below `md`: static preview with the note.

## Build order

1. Parser: `labelElement`, `parseDialogDocument` (no behaviour change).
2. `dialogXmlEdit.ts` + tests.
3. Split `DialogPreview` into `dialogPreview/` (no behaviour change).
4. Add dnd-kit; update **both** `bun.lock` and `package-lock.json`
   (`npm install --package-lock-only`).
5. Editor without drag: `Cols` picker, ColSpan stepper.
6. Drag: dialog-level reorder, in/out of groups, keyboard.
7. Selection, group, ungroup.
8. Wire into `ReportTemplateEdit`: `onChange`, Esc guard, `md` gate.
9. Browser verification.

## Out of scope

- Adding or removing fields; editing field properties.
- Resize-by-drag for `ColSpan` (stepper only).
- An editor-level Undo button (page Cancel covers it).
- Editing on screens below `md`.
- Any inventory or backend change.
