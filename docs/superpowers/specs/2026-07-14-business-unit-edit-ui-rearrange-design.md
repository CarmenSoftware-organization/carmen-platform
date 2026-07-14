# Business Unit Edit — UI Rearrange (Side-Nav + Scrollspy)

**Date:** 2026-07-14
**Page:** `/business-units/:id/edit` · `src/pages/BusinessUnitEdit.tsx`
**Status:** Design approved — ready for implementation plan

## Problem

The BU Edit page stacks 13+ cards (9 form sections + 4 action cards) in one flat
`lg:grid-cols-2` masonry grid. Result:

- **Long scroll**, no grouping — hard to find a field.
- **Order is arbitrary** — important fields (name, status) sit next to niche ones (DB connection); super-admin tenant tools mixed in.
- **Cluttered in view mode** — everything expanded even when just reading.

User wants all four addressed: less scroll, logical order, cleaner view, and a visual refresh.

## Chosen Approach

**Sticky side-nav + scrollspy** (layout pattern **B**, approved over Tabs and Accordion).

- Left column: a sticky vertical nav listing 6 groups; the active group highlights as
  you scroll (scrollspy). Click a nav item to smooth-scroll to that group.
- Right column: all groups in one scrollable column, each an anchored `<section>`.
- Everything visible on one page (no hidden tabs), fast jump-to-section, matches the
  spirit of the existing `ReportTemplateEdit` sticky-column layout.

### Group structure (6 groups, approved)

| # | Nav id | Label | Contains | Notes |
|---|--------|-------|----------|-------|
| 1 | `general` | General | Basic Info · Calculation & Currency | |
| 2 | `address` | Address & Tax | Hotel Info · Company Info · Tax Info | |
| 3 | `localization` | Localization | Date/Time Formats · Number Formats | |
| 4 | `branding` | Branding | Logo / Avatar | existing BU only |
| 5 | `advanced` | Advanced | Configuration · Database Connection · Tenant Migration · Tenant Seed | `SA` badge; tenant cards super-admin & existing BU only |
| 6 | `users` | Users | Users in this BU | existing BU only |

Existing-only groups (`branding`, `users`) and the tenant cards are hidden when
`isNew`. The nav filters them out so it never links to a missing anchor.

### Responsive behavior

- **Desktop (md+, ≥768px):** `grid lg:grid-cols-[200px_1fr]`. Nav is
  `lg:sticky lg:top-4 lg:self-start`; content column scrolls beside it.
- **Mobile (<768px):** nav collapses to a **horizontal chip scroller**, `sticky top-0
  z-30`, `overflow-x-auto`; groups stack full-width below. Active chip highlights and
  scrolls into view horizontally.

### Sticky Save bar

Replace the inline Save/Cancel at the end of the form with the **sticky bottom action
bar** already used by `ReportTemplateEdit`:

- `fixed bottom-0 left-0 right-0 md:left-16 lg:left-60 z-40 border-t bg-background`,
  offset matched to the sidebar. Shows an "Unsaved changes" indicator + Cancel + Save.
- Wrap the page body in `pb-24` so content clears the bar.
- Offset the dev debug FAB (`bottom-20`) while the bar is visible.
- Only rendered while `editing`.

## Architecture

### Key decision — drop the `<form>` element

The `advanced` group interleaves **form-field cards** (Configuration, Database
Connection) with **action cards** (Tenant Migration/Seed), and `branding` (action card)
sits visually between form-field groups. HTML forbids nested `<form>`, and the shadcn
`Button` sets **no default `type`**, so any `<Button>` inside a `<form>` implicitly
submits. Wrapping the interleaved action cards in a `<form>` would make their buttons
(Migrate, Seed, Upload) fire an accidental save.

**Resolution:** the content column is a plain `<div>`, not a `<form>`. Saving is driven
by an explicit `handleSave()` (no `FormEvent`), wired to both the sticky Save button
(`onClick`) and `Ctrl/⌘+S` (`useGlobalShortcuts.onSave`). This is a **deliberate
deviation** from the repo's `<form>` + `formRef.current?.requestSubmit()` idiom,
justified by the mixed form/non-form scroll layout; it also removes accidental
Enter-to-submit on a long multi-section page. `onBlur` validation, `useUnsavedChanges`,
and payload building are unchanged. `formRef` is removed.

### New files

1. **`src/hooks/useScrollSpy.ts`** — `useScrollSpy(ids: string[]): string`
   - `IntersectionObserver` over the section elements resolved from `ids`.
   - `rootMargin` tuned to a near-top band (e.g. `-20% 0px -70% 0px`) so the section
     nearest the top wins; returns its id as `activeId`.
   - On manual nav click the caller sets active immediately; a short suppression window
     (~500ms) prevents mid-smooth-scroll flicker.
   - Guards for environments without `IntersectionObserver` (jsdom) — returns first id.

2. **`src/pages/businessUnitEdit/BusinessUnitSectionNav.tsx`**
   - Props: `sections: { id; label; badge? }[]`, `activeId`, `onNavigate(id)`.
   - Desktop vertical sticky list; mobile horizontal chip scroller. Active item styled
     with the primary token (no raw Tailwind colors). `badge` renders the `SA` chip.
   - Click → `onNavigate(id)`; the page scrolls the target via
     `scrollIntoView({ behavior: 'smooth', block: 'start' })`.

3. **`src/pages/businessUnitEdit/sections.ts`** — single source of truth:
   ```ts
   export const BU_EDIT_SECTIONS = [
     { id: 'general',      label: 'General' },
     { id: 'address',      label: 'Address & Tax' },
     { id: 'localization', label: 'Localization' },
     { id: 'branding',     label: 'Branding', existingOnly: true },
     { id: 'advanced',     label: 'Advanced', badge: 'SA' },
     { id: 'users',        label: 'Users', existingOnly: true },
   ] as const;
   ```
   Nav, scrollspy id list, and anchor ids all derive from this — they can't drift apart.

### Changed files

4. **`BusinessUnitFormFields.tsx` → content-column layout** (same filename, repurposed)
   - Renders the 6 anchored `<section id=… className="scroll-mt-24 space-y-4">`
     wrappers instead of a flat `<form>` grid.
   - Keeps rendering the existing section components (`BasicInfoSection`, etc.) — their
     internal markup is **unchanged** (so their unit tests stay green).
   - Receives the action cards as **slot props** (`brandingSlot`, `advancedExtraSlot`,
     `usersSlot`: `React.ReactNode`) so the page owns their wiring (upload handlers,
     tenant props) and this component stays layout-only.
   - Within a group, cards stack (`space-y-4`); where two pair naturally (Hotel/Company)
     an internal `lg:grid-cols-2` is allowed for density.
   - No submit button here anymore (moved to the sticky bar).

5. **`BusinessUnitEdit.tsx` (orchestrator)**
   - Adds `activeId` state + `useScrollSpy(visibleSectionIds)`; computes
     `visibleSectionIds` by filtering `BU_EDIT_SECTIONS` on `isNew`.
   - Renders `grid lg:grid-cols-[200px_1fr]`: `<BusinessUnitSectionNav>` +
     `<BusinessUnitFormFields>` with the action-card slots.
   - `handleSubmit(e)` → `handleSave()` (drop the event); Ctrl+S and the sticky Save
     button both call it. Adds the sticky action bar (editing only), `pb-24` wrapper.
   - `handleNavigate(id)` scrolls to the anchor and sets `activeId`.
   - Loading skeleton updated to roughly mirror the nav + column shape.

## Non-goals / unchanged

- **No field/behavior changes** — same fields, same payload (`buildPayload`), same
  validation, same `doc_version` optimistic-locking flow (`getDocVersion` / send only
  when present / `isVersionConflict` → `notifyVersionConflict()` + refetch).
- **No changes** to `src/components/ui/` primitives.
- **No changes** to the section components' internals or the service layer.
- Tenant/Branding/Users card internals unchanged (only relocated into anchored sections).

## Testing

- **`useScrollSpy.test.ts`** — mock `IntersectionObserver`; assert active id updates and
  the no-IO fallback.
- **`BusinessUnitSectionNav.test.tsx`** — renders items from a section list; hides
  `existingOnly` items; click calls `onNavigate(id)`; renders the `SA` badge.
- **Page integration** (extend existing pattern: mock shell + services, real
  `MemoryRouter`) — nav renders the visible groups; clicking a nav item calls
  `scrollIntoView` (mocked in jsdom); the sticky Save bar appears only in edit mode.
- Existing section tests (`CompanyInfoSection`, `DatabaseConnectionSection`,
  `HotelInfoSection`, `TaxInfoSection`, `shared`) must stay green untouched.

## Risks

- **jsdom lacks `IntersectionObserver` and `scrollIntoView`** — hook must no-op safely;
  tests mock both.
- **Scrollspy flicker** during smooth scroll — mitigated by the click-suppression window.
- **Sticky offsets** must match the sidebar (`md:left-16 lg:left-60`) and collapsed vs
  expanded states, same as `ReportTemplateEdit`.
