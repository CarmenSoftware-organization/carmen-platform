# Edit Page Modes

There are **three** kinds of `<Entity>Edit` page. Pick by structure, not by preference.

| Mode | Use when | `formData` | `savedFormData` | `editing` | Examples |
|---|---|---|---|---|---|
| **Toggle** | One form, saved as a unit | ✓ | ✓ | ✓ | `RoleEdit` `UserEdit` `NewsEdit` `ApplicationEdit` `ReportTemplateEdit` |
| **Edit-in-place** | Several sections + related tables edited row by row | ✓ | ✓ | ✗ | `ClusterEdit` `BusinessUnitEdit` |
| **Relationship** | No form at all — you manage links, not fields | ✗ | ✗ | ✗ | `UserPlatformEdit` |

**Decision rule:** count the sections and related tables. One form section → Toggle. Multiple sections plus tables users edit row by row → Edit-in-place. Nothing but assignments/memberships → Relationship.

## Toggle mode

New record ⇒ `editing = true`. Existing ⇒ `false` until Edit is pressed. Stash `formData` into `savedFormData` on Edit; restore it on Cancel. Reference: `RoleEdit.tsx`.

## Edit-in-place

No Edit button — fields are live. **Still keep `savedFormData`**: it is what `useUnsavedChanges` diffs against. It is not leftover state.

Row-level editing uses the `clusterEdit/` primitives — `InlineCell`, `BulkActionBar`, `TableToolbar`, and `useScrollSpy` + `ClusterEditNav` for section navigation. They live under `clusterEdit/` but are not cluster-specific; reuse them rather than reinventing.

## Relationship pages

No `formData`, no Save button. Every action commits immediately through a dialog (`ConfirmDialog` to remove, a Dialog/Sheet to add). Load failures for secondary lists are non-fatal — swallow and carry on:

```ts
try { setRoleAssignments(await userRoleService.list(userId)); } catch { /* non-fatal */ }
```

## Common to all three

`fieldErrors` (validate on blur), `notFound`, `error`, `rawResponse` + dev debug Sheet, back button, `Ctrl/⌘+S` save, `Escape` cancel. `id` from `useParams`, `isNew = !id`.

After create: ``navigate(`/items/${created.id}/edit`, { replace: true })`` — there is no bare `/items/:id` route.
