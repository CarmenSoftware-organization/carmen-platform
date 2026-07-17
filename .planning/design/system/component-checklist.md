# Carmen Platform — Component Coverage Checklist

> Checklist view of the design-system component inventory. For full descriptions and the
> page-pattern map, see **[`components.md`](./components.md)**. Verified from
> `src/components/` on 2026-07-17.
>
> - `[x]` = built and in use.
> - `[ ]` = **not yet in the system** — a primitive an admin dashboard commonly needs but
>   this repo doesn't have (see *Gaps* at the bottom for the current workaround).
>
> **Coverage: 45 built** — 21 shadcn primitives + 24 app-level.

---

## Primitives — `src/components/ui/` (21) ✅

**⚠️ Do not modify without an explicit reason (repo rule 2).**

- [x] Avatar — `avatar.tsx`
- [x] Badge — `badge.tsx` (status: `success`/`warning`/`info`/`secondary`/`destructive`)
- [x] Button — `button.tsx` (CVA variants + `size="icon"`)
- [x] Card — `card.tsx` (flat `bg-card` + 1px border)
- [x] ChipInput — `chip-input.tsx`
- [x] ConfirmDialog — `confirm-dialog.tsx` (replaces `window.confirm()`)
- [x] DataTable — `data-table.tsx` (TanStack v8, server-side, auto `#` column)
- [x] DevDebugSheet — `dev-debug-sheet.tsx` (dev-only)
- [x] Dialog — `dialog.tsx`
- [x] DropdownMenu — `dropdown-menu.tsx`
- [x] Input — `input.tsx`
- [x] JsonViewer — `json-viewer.tsx`
- [x] Label — `label.tsx`
- [x] Select — `select.tsx`
- [x] Separator — `separator.tsx`
- [x] Sheet — `sheet.tsx`
- [x] Skeleton — `skeleton.tsx`
- [x] Table — `table.tsx`
- [x] Tabs — `tabs.tsx`
- [x] Textarea — `textarea.tsx`
- [x] Tooltip — `tooltip.tsx`

## Layout & navigation (4) ✅

- [x] Layout — `Layout.tsx` (shell, sidebar state, breadcrumb bar, nav registry)
- [x] Sidebar — `Sidebar.tsx` (desktop fixed + mobile Sheet drawer)
- [x] Breadcrumbs — `Breadcrumbs.tsx`
- [x] PageHeader — `PageHeader.tsx`

## Access control (2) ✅

- [x] PrivateRoute — `PrivateRoute.tsx` (route guard)
- [x] Can — `Can.tsx` (inline permission gate)

## Data display & state (5) ✅

- [x] TableSkeleton — `TableSkeleton.tsx`
- [x] EmptyState — `EmptyState.tsx`
- [x] ReadOnlyField — `ReadOnlyField.tsx`
- [x] VersionBadge — `VersionBadge.tsx`
- [x] DialogPreview — `DialogPreview.tsx`

## Forms & inputs — app-level (8) ✅

- [x] SearchInput — `SearchInput.tsx` (debounced 400ms)
- [x] BusinessUnitMultiSelect — `BusinessUnitMultiSelect.tsx`
- [x] UserMultiSelect — `UserMultiSelect.tsx`
- [x] PermissionPicker — `PermissionPicker.tsx`
- [x] MarkdownEditor — `MarkdownEditor.tsx`
- [x] XmlEditor — `XmlEditor.tsx` (CodeMirror 6)
- [x] ImageUpload — `ImageUpload.tsx`
- [x] BrandingImageUpload — `BrandingImageUpload.tsx`

## Feedback & overlays — app-level (1) ✅

- [x] KeyboardShortcuts — `KeyboardShortcuts.tsx` (`⌘K`/`⌘S`/`Esc`/`?`)

> Toast is `sonner` (external, wired in `App.tsx`). ConfirmDialog / Dialog / Sheet / Tooltip
> are primitives above.

## Domain-specific cards (4) ✅

- [x] InterfaceEntitlementCard — `InterfaceEntitlementCard.tsx`
- [x] TenantMigrationCard — `TenantMigrationCard.tsx`
- [x] TenantSeedCard — `TenantSeedCard.tsx`
- [x] DbConnectionView — `DbConnectionView.tsx`

---

## Gaps — not yet in the system (unbuilt)

Common shadcn/admin-dashboard primitives this repo does **not** have. Each note shows the
current workaround, so adding one is an extraction, not net-new UX.

- [ ] **Checkbox** — no `ui/checkbox.tsx`. Currently **raw `<input type="checkbox">` in 16
  files** (row selection, "Active only" filters, form toggles). *Strongest candidate to
  extract* — most-repeated raw element, would unify focus/disabled/indeterminate styling.
- [ ] **Switch / Toggle** — no primitive. Boolean toggles use raw checkboxes or buttons.
- [ ] **Accordion / Collapsible** — no shared primitive, though `tailwind.config.js` already
  ships accordion keyframes and `ApplicationEdit.tsx` rolls its own collapsible module list.
- [ ] **RadioGroup** — no primitive (single-choice fields use Select instead).
- [ ] **Popover** — no standalone primitive (Dropdown/Tooltip cover most cases).
- [ ] **Alert / inline banner** — no primitive; inline errors use `text-destructive` text +
  toast for transient messages.
- [ ] **Progress** — no primitive (streaming cards use custom UI).
- [ ] **Command / Combobox** — no primitive; `⌘K` search is custom in `KeyboardShortcuts`.
- [ ] **DatePicker / Calendar** — no primitive; native `<input type="date">` (1 file).

> These are **candidates, not a mandate.** Only extract a primitive when a second use site
> appears or the raw pattern drifts. Checkbox (16 raw usages) is the one with a clear case today.

---

## When adding a component

- [ ] Lives in `src/components/ui/` (primitive) or `src/components/` (app-level composite)?
- [ ] Uses **semantic tokens only** — no hardcoded hex, no raw Tailwind color scales, no raw
      green for status (`<Badge variant>` instead). See [`tokens.md`](./tokens.md).
- [ ] Radius via `rounded-lg`/`md`/`sm`; spacing on the 4px grid.
- [ ] Works in **both light and dark** (semantic tokens flip automatically).
- [ ] Co-located `*.test.tsx` (RTL, behavior not snapshots) — repo rule 18.
- [ ] Added to `components.md` + this checklist.
