# Split `BusinessUnitEdit.tsx` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`) tracking.
>
> **Source of truth:** `docs/superpowers/specs/2026-06-29-businessunit-edit-split-design.md` — it carries the exact component prop APIs and the source **line ranges** for every section. This plan is the task ordering + verification gates. "Move verbatim" = cut the referenced lines from `BusinessUnitEdit.tsx` and paste into the new file unchanged except renaming the handler props at the boundary (`handleChange`→`onChange`, `handleBlur`→`onBlur`, `handleFocus`→`onFocus`, `handleConfigChange`→`onConfigChange`, `addConfigRow`→`onAddConfigRow`, `removeConfigRow`→`onRemoveConfigRow`).

**Goal:** Decompose the 1847-line `BusinessUnitEdit.tsx` into focused co-located units with **zero behavior change**.

**Architecture:** Parent stays the orchestrator (state + load/save + composition); extracted units live in `src/pages/businessUnitEdit/`. See spec for the file tree.

**Tech Stack:** React 18 + TS strict, Vite 8, vite-plugin-checker (tsc + eslint).

## Global Constraints

- **Zero behavior/markup change.** Every moved block is byte-identical except boundary prop renames listed above.
- Do not modify other pages or `src/components/ui/`.
- `bun run build` must pass after **every** task (it runs tsc + eslint); commit per task so regressions are bisectable.
- Follow existing import style (relative paths, named ui imports).
- New section components are presentational — no data fetching, no local state except what a block already had (none do).

---

### Task 1: Extract `types.ts` + `shared.tsx`

- Create `src/pages/businessUnitEdit/types.ts` — move `BUUser`, `ClusterUser`, `DefaultCurrency`, `BusinessUnitFormData`, `initialFormData`, `BU_ROLES` (lines 29–146) **and add** the `SectionFieldProps` interface (verbatim from spec §Decisions 2). Re-export `BusinessUnitConfig`/`Cluster` consumers import from `../../types` directly.
- Create `src/pages/businessUnitEdit/shared.tsx` — move `CollapsibleSection` + `CollapsibleSectionProps`, `ReadOnlyText`, `ReadOnlyTextarea` (lines 148–181) **and** export `const selectClassName` (the string at line 695).
- In `BusinessUnitEdit.tsx`: delete the moved blocks; import them from the new files.
- [ ] **Verify:** `bun run build` → green. **Commit:** `refactor(bu-edit): extract types + shared presentational bits`

---

### Task 2: Extract `useBusinessUnitUsers` hook

- Create `src/pages/businessUnitEdit/useBusinessUnitUsers.ts` with the signature + return shape in spec §Component APIs.
- Move into it: the users-related `useState` (lines 200–210, 214, 217), the cluster-users `useEffect` (260–273), and handlers `fetchBuUsers`, `handleDeleteUser`, `handleConfirmDeleteUser`, `handleOpenEditUser`, `handleSaveEditUser`, `handleOpenAddUser`, `availableClusterUsers`, `handleAddUser` (360–442). Internals verbatim.
- In the parent: replace those with `const users = useBusinessUnitUsers(id, formData.cluster_id, isNew);`. In `fetchBusinessUnit`, change `setBuUsers(...)` → `users.setBuUsers(...)`. Update the Users card JSX (still inline for now) + debug sheet to read `users.*`.
- [ ] **Verify:** `bun run build` → green. **Commit:** `refactor(bu-edit): extract useBusinessUnitUsers hook`

---

### Task 3: Extract the 9 section components

Create each file under `src/pages/businessUnitEdit/sections/`, moving the exact `CollapsibleSection` block at the spec's line range. Each accepts `SectionFieldProps` (spread) + listed extras. Parent passes the shared bundle once per section.

- [ ] BasicInfoSection, HotelInfoSection, CompanyInfoSection, TaxInfoSection, DateTimeFormatsSection, NumberFormatsSection, CalculationSettingsSection, ConfigurationSection, DatabaseConnectionSection
- **Verify:** `bun run build` → green. **Commit:** `refactor(bu-edit): extract 9 form section components`

---

### Task 4: Extract `BusinessUnitFormFields` (the `<form>`)

- Create `src/pages/businessUnitEdit/BusinessUnitFormFields.tsx` rendering `<form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">` → the 9 `<XxxSection .../>` in order → the submit-button block (lines 1482–1493).
- Props per spec. Parent renders `<BusinessUnitFormFields .../>` in place of the inline `<form>` (lines 726–1494).
- [ ] **Verify:** `bun run build` → green. **Commit:** `refactor(bu-edit): extract BusinessUnitFormFields`

---

### Task 5: Extract Branding, Users card, Debug sheet

- `BusinessUnitBrandingCard.tsx` ← lines 1508–1532 body (props per spec).
- `BusinessUnitUsersCard.tsx` ← Users card (1534–1620) + Edit-User dialog (1621–1676) + Add-User dialog (1677–1776) + the delete `ConfirmDialog` (wherever it currently renders). Consumes `users` hook return + `clusterId`.
- `BusinessUnitDebugSheet.tsx` ← debug Sheet (1777–1845), body kept inside `process.env.NODE_ENV === 'development'`.
- Parent composes all three. Confirm `TenantMigrationCard` mount (1496–1506) stays inline, unchanged.
- [ ] **Verify:** `bun run build` → green. **Commit:** `refactor(bu-edit): extract branding, users card, debug sheet`

---

### Task 6: Final verification

- [ ] `bun run build` → production bundle emits, no checker errors.
- [ ] `git diff main --stat` → `BusinessUnitEdit.tsx` substantially smaller (~520 lines); new files present.
- [ ] Manual smoke per spec §Verification.3 (view/edit/save existing BU, create new, add/edit/remove user, upload logo/avatar, open debug sheet).
- [ ] Confirm `grep -rn "handleChange\|handleBlur" src/pages/businessUnitEdit/sections` returns nothing (boundary renames applied).

## Self-Review

- **Coverage:** every spec unit (types, shared, hook, 9 sections, FormFields, Branding, UsersCard, DebugSheet, parent rewiring) maps to Tasks 1–5; verification to Task 6. ✓
- **Placeholders:** none — each task names exact files + line ranges; detailed APIs live in the committed spec. ✓
- **Type consistency:** prop names match spec APIs; boundary renames enumerated once in the header. ✓
