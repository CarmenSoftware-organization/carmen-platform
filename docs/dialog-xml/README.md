# Dialog XML format

The filter dialog of a report template (`tb_report_template.dialog`). Read by
four places — keep them in step:

| Reader | File |
|---|---|
| Platform preview | `carmen-platform/src/utils/dialogXml.ts` → `src/components/DialogPreview.tsx` |
| Inventory run dialog | `carmen-inventory-frontend-react/routes/report/list/parse-report-dialog.ts` |
| Inventory schedule form | `carmen-inventory-frontend-react/routes/report/schedules/parse-schedule-dialog.ts` |
| micro-report filter header | `micro-report/service/template_filter_inject.go` (`parseDialogDefs`) |

## Elements

- `<Dialog Cols="1–4">` — root. `Cols` absent/invalid → 1, > 4 → 4.
- A visible `<Label Text="…"/>` followed by a control = one field. A control
  may instead carry its own `Label="…"` (see below). A control without either,
  or a label without a control after it, is not shown by inventory — the
  preview warns instead of drawing it.
- `Label="…"` on `<Date>`/`<Lookup>`: the control is a field on its own. It
  never takes the `<Label>` before it (that label is dropped with a warning) and
  is never part of a From/To range — wrap From and To in `<Group>` instead.
  The value is trimmed; empty → the control's `Name` is shown.
- Controls: `<Date Name Value/>`, `<Lookup Name DataSource|Items+Values [Multi="true"] [Value]/>`.
  Inventory renders only these two.
- `DataSource="@…_list"` values the run dialog understands are inventory's
  `dataSourceMap` (`routes/report/list/parse-report-dialog.ts`). The platform
  editor suggests the same list from `src/utils/dialogDataSources.ts` — change
  both together. Other values are passed through unchanged.
- `ColSpan="n"` on a control or `<Group>`: integer ≥ 1, clamped to `Cols`.
  Never on `<Label>` (no effect).
- `<Group ColSpan="n">` wraps `Label`+control pairs and lays them side by side.
  No From/To auto-pairing inside. Nested groups are lifted into the outer one.
  Empty groups are skipped. `Label="…"` on `<Group>` is a heading above its
  fields (trimmed; empty → none). `Cols` on `<Group>` is reserved.

Outside groups, `Label XFrom` + `Label XTo` (or a second label that is
`Visible="false"` or reads `to`) collapse into one **range** cell, which takes
the From control's `ColSpan`.

Below 640px every dialog is one column.

> **`<Group>` rollout rule:** do not use `<Group>` in a live template until the
> inventory release that supports it is on inventory **production**. Older
> inventory builds silently drop grouped fields.

> **`Label` attribute rollout rule:** do not put `Label=` on a `<Date>`/`<Lookup>`
> in a live template until the inventory release that supports it is on
> inventory **production**. Older builds silently drop that field. `Label` on
> `<Group>` is safe on older builds (the heading is just missing).

### Fields added by the layout editor

The editor's **Add field** menu writes classic pairs only — never `Label=` (see the
rollout rule above):

| Kind | XML |
|---|---|
| Date | `<Label Text="New field"/><Date Name="Date1"/>` |
| Lookup | `<Label Text="New field"/><Lookup Name="Lookup1" DataSource="@product_list"/>` |
| Date range | `<Label Text="New field"/><Date Name="Date1From"/>` + `<Label Text="to"/><Date Name="Date1To"/>` |
| Lookup range | as Date range, with `<Lookup … DataSource="@product_list"/>` on both sides |

The number is the smallest one that keeps every `Name` in the dialog unique.
Deleting the last field of a `<Group>` removes the group as well.

## Fixtures

`fixtures/<name>.xml` + `fixtures/<name>.expected.json`. Both frontends run every
fixture as a test. The inventory copy lives at
`carmen-inventory-frontend-react/routes/report/list/__fixtures__/dialog-xml/` —
re-copy it by hand whenever this set changes. `real-*` files are the DEV
templates as of 2026-10-08. Expected cells may carry `labels` (field labels)
and `heading` (group label); runners compare them only where present.
