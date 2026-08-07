# Page Decomposition

A page gets a sibling directory named after it in camelCase: `BusinessUnitEdit.tsx` → `businessUnitEdit/`.

## When to split

**When a piece has a name.** If you can call it `BrandingSection`, `UsersCard`, or `StepRail`, it belongs in its own file — regardless of how long the page currently is.

Line count is a symptom, not the trigger. `ReportTemplateEdit.tsx` is 1183 lines and `ClusterEdit.tsx` 811; both are long because they orchestrate a lot, not because they're under-split. Don't refactor to hit a number.

## What lives where

The page file stays the **orchestrator**: form state, load/save, permission gating, composition. Everything else moves out:

| Kind | Naming | Examples |
|---|---|---|
| Form sections | `sections/<Name>Section.tsx` | `BrandingSection`, `UsersSection`, `DetailsSection` |
| Large blocks | `<Entity><Thing>Card.tsx` / `Panel.tsx` | `BusinessUnitUsersCard`, `FileCheckPanel` |
| Stateful sub-flows | `use<Thing>.ts` | `useBusinessUnitUsers`, `useClusterUsers`, `useScrollSpy` |
| Small primitives | plain name | `InlineField`, `InlineCell`, `HeroName`, `PasswordField` |
| Pure logic | plain `.ts` | `tableSort.ts` |
| Page-local types | `types.ts` | |
| Shared bits between siblings | `shared.tsx` | the `SectionFieldProps` bundle |

A subdirectory holding one file is fine — most Management pages have exactly one (the summary band).

Pure logic split out (`tableSort.ts`) exists so it can be unit-tested directly. That's a reason to split even when the page is short.

## Cross-page reuse

Several `clusterEdit/` pieces are generic — `InlineCell`, `BulkActionBar`, `TableToolbar`, `useScrollSpy`.

**The moment a second page needs one, move it** — components to `src/components/`, hooks to `src/hooks/`. Do not import across page subdirectories; `pages/foo/` reaching into `pages/bar/` is the smell that the piece was never page-specific.
