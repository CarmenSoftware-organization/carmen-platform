# Dialog XML: `Label` attribute on controls

**Date:** 2026-10-08
**Repos:** `carmen-platform`, `carmen-inventory-frontend-react`, `micro-report`
**Branch:** `feature/dialog-control-label-attr` (same name in each repo)
**Builds on:** `2026-10-08-dialog-xml-columns-design.md` (`Cols` / `ColSpan` / `<Group>`) and
`2026-10-08-dialog-layout-editor-design.md` (drag-and-drop editor)
**Status:** Design approved, awaiting spec review

## Problem

Every field in a dialog is two elements, `<Label Text="…"/>` followed by a
control. Authors want a control to carry its own label:

```xml
<!-- today -->
<Label Text="Date"/><Date Name="DateFrom"/>
<!-- new -->
<Date Name="DateFrom" Label="Date"/>
```

This is the first of three follow-ups the user asked for (B: new control
attributes). A (a property panel in the layout editor) and C (add/remove fields
in the editor) get their own specs afterwards.

## Decisions (from brainstorming)

- **Self-labelled = standalone.** `hasAttribute('Label')` makes the control one
  cell on its own. It never takes the `<Label>` before it (choice A).
- **No range pairing (choice D).** A self-labelled control is never part of a
  From/To range — as the From side or the To side. To keep From and To together,
  wrap them in `<Group>`:

  ```xml
  <Group ColSpan="2">
    <Date Name="DateFrom" Label="Date from"/>
    <Date Name="DateTo" Label="to"/>
  </Group>
  ```

  In inventory this is two date inputs side by side, not one range picker.
- **Implementation approach 1:** a self-labelled flag on the control node,
  handled as its own branch in the pairing step. Rejected: rewriting the
  attribute into a virtual `<Label>` before pairing — it would pair ranges
  (breaks D) and absorb a preceding `<Label>` (breaks A).
- Existing templates (18 real ones, none use `Label=`) parse exactly as before.

## Format rules (added to `docs/dialog-xml/README.md`)

- `Label="…"` is allowed on `<Date>` and `<Lookup>`. Presence decides, not value.
- A self-labelled control does not consume a `<Label>` before it. That `<Label>`,
  left with no control, gets the existing `labelWithoutControl` warning (preview)
  and is dropped (inventory), as today.
- Range pairing requires that neither the From control nor the To control is
  self-labelled. If only the To control is, the From side becomes a plain field
  and the To control its own cell.
- Works at top level and inside `<Group>`. `ColSpan` applies as on any control.
- `Label=""` is still self-labelled; readers show the control's `Name` instead.
  The preview warns `emptyLabel`.
- There is no `Visible` for an attribute label (hidden labels exist only for
  ranges, which D excludes).
- **Rollout rule:** do not use `Label=` in a live template until the inventory
  release that supports it is on inventory **production**. Older inventory
  builds silently drop the field (no `<Label>` in front). The preview shows a
  notice whenever a self-labelled control exists.

## Changes per repo

### carmen-platform — parser `src/utils/dialogXml.ts`

- `DialogField.labelElement` becomes `Element | null`; `null` means the label
  came from the attribute.
- `toNodes`: a control node gets `selfLabel: string | null` (the attribute
  value, or `null` when absent).
- `groupNodes`:
  - a control with `selfLabel !== null` → a `field` cell right away. Label text
    is `selfLabel`, or the control's `Name` when it is empty (push `emptyLabel`);
  - a visible `<Label>` whose next node is a self-labelled control → push
    `labelWithoutControl`, advance one (the control is handled on the next turn);
  - range pairing (`isToLabel` / `isNamedPair` branch) only when both `next` and
    `to` have `selfLabel === null`.
- New warning `{ code: 'emptyLabel'; at: string }`.
- `DialogParseResult` gains `hasLabelAttr: boolean` for the rollout notice.

### carmen-platform — editor `src/utils/dialogXmlEdit.ts`

- Cell node lists filter out `null` label elements, so a self-labelled field
  moves as its control alone. `groupCells` / `moveCell` / `ungroup` need no
  other change.
- `relayout` joins a `<Label>` with the next control on one line only if that
  control has no `Label` attribute — otherwise an orphan `<Label>` would be
  glued to an unrelated control.
- `hasHiddenToLabel` is unaffected (ranges never contain self-labelled controls).

### carmen-platform — UI

- `DialogPreview.tsx`: when `hasLabelAttr`, show `labelAttrNeedsInventory` next
  to the existing `groupNeedsInventory` notice. Delete both lines once inventory
  production has the release.
- `warningText.ts`: text for `emptyLabel`.
- `src/i18n/en.ts` + `th.ts`: `components.dialogPreview.warnings.emptyLabel`,
  `components.dialogPreview.labelAttrNeedsInventory`.
- `FieldBlock` already renders `field.label`; no change expected.

### carmen-inventory-frontend-react — run dialog `routes/report/list/parse-report-dialog.ts`

- `DateNode` / `LookupNode` gain `selfLabel: string | null`.
- `groupFields` gets the same three rules as the preview, line for line
  (preview is a port of this function — keep them identical).
- The empty-label fallback is the control's `name`.
- Shared fixtures are copied by hand into `routes/report/list/__fixtures__/dialog-xml/`.

### carmen-inventory-frontend-react — schedule form `routes/report/schedules/parse-schedule-dialog.ts`

- Label: when the control has a `Label` attribute, use it (empty → `name`) and
  ignore `currentLabel`; otherwise `currentLabel` → `name` as today.
- `currentLabel` is cleared after every control, as today.

### micro-report — `service/template_filter_inject.go` (`parseDialogDefs`)

- `xmlControl` gains `Label *string \`xml:"Label,attr"\`` (a pointer, so presence
  is distinguishable from an empty value).
- Label: attribute present → its value, or `ctrl.Name` when empty, and
  `pendingLabel` is ignored; absent → `pendingLabel` → `ctrl.Name` as today.
- The filter-subtitle From/To line merge stays name-based (display only):
  `Date from: x    to: y`.

## Testing

Static checks in every repo: typecheck + lint (platform, inventory), `go vet`
(micro-report). Existing suites must stay green.

### Shared fixtures (`docs/dialog-xml/fixtures/`, copied to inventory)

| Fixture | Checks |
|---|---|
| `label-attr-basic` | `Date` and `Lookup` with `Label=` mixed with classic pairs |
| `label-attr-preceded` | `<Label>` before a self-labelled control → `labelWithoutControl`; the control uses its attribute |
| `label-attr-no-range` | `DateFrom`/`DateTo` both self-labelled → 2 fields; classic From + self-labelled To → 2 cells, no range |
| `label-attr-group` | self-labelled controls inside `<Group>`, with `ColSpan` |
| `label-attr-empty` | `Label=""` → label = `Name`, `emptyLabel` warning |

Both fixture runners (`dialogXml.test.ts`, inventory `parse-report-dialog.test.ts`)
pick new files up automatically.

### Unit tests

- `dialogXmlEdit.test.ts`:
  - moving a self-labelled field away and back is byte-identical;
  - group / ungroup of self-labelled fields;
  - an orphan `<Label>` before a self-labelled control is not joined onto its
    line by `relayout`.
- inventory `parse-schedule-dialog`: one test for label precedence.
- micro-report `TestParseDialogDefs_LabelAttr`: attribute beats `pendingLabel`;
  an empty attribute gives `Name` (not `pendingLabel`); no attribute behaves as today.

### Browser verification (local, never saved)

- Preview draws self-labelled fields; the rollout notice shows.
- Drag, group, and ColSpan on self-labelled fields; then Cancel.
- Inventory localhost run dialog shows every field for a pasted test XML (the
  user signs in if needed).

## Merge and deploy order

- The three PRs can merge to `main` in any order: each still reads existing
  templates unchanged.
- `Label=` may appear in live templates only after inventory production has the
  release. Until micro-report deploys (blocked on GitHub billing), report
  headers fall back to `Name` — degraded, not broken.

## Out of scope

- A property panel in the editor (spec A, next).
- Adding / removing fields in the editor (spec C).
- Converting the 18 real templates to `Label=`.
- `Visible` on the attribute label; range pairing for self-labelled controls.
