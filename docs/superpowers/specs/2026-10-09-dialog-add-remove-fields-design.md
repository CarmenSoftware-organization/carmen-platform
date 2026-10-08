# Dialog Layout Editor: add and remove fields

**Date:** 2026-10-09
**Repo:** `carmen-platform` only
**Branch:** `feature/dialog-add-remove-fields`
**Builds on:** `2026-10-08-dialog-layout-editor-design.md` (drag-and-drop editor),
`2026-10-08-dialog-control-label-attr-design.md` (`Label` attribute),
`2026-10-09-dialog-property-panel-design.md` (property panel, PR #341)
**Status:** Design approved, awaiting spec review

## Problem

The layout editor can arrange cells and, since the property panel, edit them —
but a new field or a removed one still has to be typed into the Dialog XML tab.

This is spec **C**, the last of the three follow-ups (B: `Label` attribute —
merged #340; A: property panel — merged #341).

## Decisions (from brainstorming)

- **Kinds (B):** Date, Lookup, Date range (From/To), Lookup range (From/To). No
  empty `<Group>` — grouping already exists (select cells → Group).
- **Position (A):** after the focused cell; into its group when the focused cell
  is a field inside a `<Group>`; at the end of the dialog when nothing is
  focused. A range is never inserted into a group (groups hold single fields
  only) — with a field in a group focused, a range goes after the `<Group>`.
- **Delete (A):** no confirmation. A toast with **Undo** (10 s) restores the XML
  from before the delete, but only while the current XML is still exactly the
  XML right after the delete. Deleting a `<Group>` removes it with its fields;
  Ungroup is the way to keep the fields.
- **Defaults (A):** classic `<Label Text="New field"/>` (never `Label=`, per the
  `Label` rollout rule), a generated unique `Name`, and a new Lookup gets
  `DataSource="@product_list"` so the XML is valid from the first write.
- **Approach 1:** pure `xml → xml` ops in `dialogXmlEdit.ts` over the DOM, like
  every other editor op. Rejected: string/regex splicing (breaks inside groups
  and around comments); a separate "create field" dialog (duplicates the
  property panel and costs a click per field).

## Edit ops — `src/utils/dialogXmlEdit.ts`

Same contract as the existing ops: never throw; broken XML or an unknown key
returns the input unchanged. Only the container that changed is re-laid-out
(`relayout`); the rest of the string is byte-identical.

### `insertField(xml, afterKey, kind) → { xml: string; name: string | null }`

`kind: 'date' | 'lookup' | 'dateRange' | 'lookupRange'`. `name` is the
generated `Name` (the From name for a range), or `null` when nothing changed.

| kind | Nodes inserted (`n` = generated number) |
|---|---|
| `date` | `<Label Text="New field"/><Date Name="Daten"/>` |
| `lookup` | `<Label Text="New field"/><Lookup Name="Lookupn" DataSource="@product_list"/>` |
| `dateRange` | `<Label Text="New field"/><Date Name="DatenFrom"/>` `<Label Text="to"/><Date Name="DatenTo"/>` |
| `lookupRange` | as `dateRange` with `<Lookup … DataSource="@product_list"/>` on both sides |

A generated range pairs both ways (a `to` label **and** the `XFrom`/`XTo` named
pair), so it stays one range if the author later edits either.

**Name:** the smallest `n ≥ 1` such that every generated name (both sides of a
range) is unused by any control in the document, including inside groups.

**Position:**

| `afterKey` | Inserted |
|---|---|
| `null` | at the end of `<Dialog>` |
| a top-level field or range | after that cell's last node |
| a group | after the `<Group>` element |
| a field inside a group | single field: inside the group, after that field; range: after the `<Group>` |

### `deleteCell(xml, key) → string`

| Cell | Removed |
|---|---|
| field | its `<Label>` element (if any — none for `Label=`) and its control |
| range | From label, From control, To label (visible or hidden), To control |
| group | the whole `<Group>` element |
| last field in a group | the field **and** the now-empty `<Group>` |

Deleting every field leaves an empty `<Dialog>`; the preview already renders
that state. Ops never touch `Cols`, other cells' `ColSpan`, or any attribute.

## UI

### Add — editor toolbar (`DialogLayoutEditor.tsx`)

- A "+ Add field" button beside the Cols control opens a `DropdownMenu`
  (`components/ui/dropdown-menu.tsx`) with Date, Lookup, Date range, Lookup
  range, and a muted line naming where the field will go: "After «label»",
  "In group «heading or Group N»", or "At the end".
- While the menu is open the editor reports busy through the same path as a
  drag (`onDragActiveChange` → `dialogDragActiveRef` in `ReportTemplateEdit.tsx`),
  so Esc closes only the menu, not the page. The flag is kept in a ref (see the
  Radix dismiss-layer lesson: state lags one render behind the Esc handler).
- While the property panel reports a blocking error, adding is refused with the
  existing `fixErrorFirst` warning toast.
- After insert: the selection is cleared (keys shift), the new cell is found in
  the re-parsed XML by its generated `Name` and becomes the focused cell, it is
  scrolled into view, and keyboard focus goes to the panel's Label input — the
  DataSource input for a Lookup or Lookup range.

### Delete — cell toolbar and panel header

- A trash icon button in `CellToolbar.tsx` on every cell, groups included,
  `aria-label` "Delete «label»".
- A "Delete" button in the property panel header, beside ×.
- Both call `deleteCell` for that cell's key.
- After delete: panel focus clears; keyboard focus moves to the next cell, else
  the previous one, else the Add field button — never to `body` (an Esc there
  would cancel the page).
- `toast("Deleted «label»", { action: Undo, duration: 10000 })`. Undo applies
  the pre-delete XML only when the current XML equals the post-delete XML;
  otherwise `toast.info("Can't undo — the dialog changed since")`.

All strings via i18n (`en.ts`, `th.ts`).

## Testing

Unit tests for the pure ops only (same policy as specs A and the editor). No
component tests; the UI is verified in the browser.

`dialogXmlEdit.test.ts`:

- `insertField`: each kind parses back to the expected cell (`range` for both
  range kinds); every position row above; unique names (existing `Date1` →
  `Date2`; existing `Date1From` → a range gets `Date2From`/`Date2To`; names
  inside groups count); outside the changed container the string is
  byte-identical; bad key / broken XML → input unchanged, `name: null`.
- `deleteCell`: classic field, `Label=` field, range with visible and hidden To
  label, group, last field in a group removes the group, deleting everything
  leaves an empty `<Dialog>`; insert then delete the new cell returns the
  original string (whitespace of the touched container may differ only if
  `relayout` normalises it — the test states which); bad key → input unchanged.

Static checks: `bun run typecheck && bun run lint && bun run test`.

### Browser verification (local, never saved)

- Add each kind at each position → Dialog XML tab changes in one place; the
  panel focuses the new field with the right input focused.
- Delete a field, a range, a group, and the last field of a group → Undo
  restores; Undo after another edit → "can't undo" toast.
- Esc with the Add menu open closes only the menu.
- After delete, focus is on a cell or the Add button, not `body`.
- Add while the panel shows an error → warning toast, XML unchanged.

## Files

- `src/utils/dialogXmlEdit.ts` (+ test)
- `src/components/dialogPreview/DialogLayoutEditor.tsx`
- `src/components/dialogPreview/CellToolbar.tsx`
- `src/components/dialogPreview/PropertyPanel.tsx`
- `src/i18n/en.ts`, `src/i18n/th.ts`
- `docs/dialog-xml/README.md` (what the editor generates)

## Out of scope

- Duplicate field; adding an empty `<Group>`.
- `Label=` on generated fields (after inventory production has #264).
- A Delete/Backspace keyboard shortcut on cells.
- Any inventory, micro-report, or backend change — the XML format does not change.
