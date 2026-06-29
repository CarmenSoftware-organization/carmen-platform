# Split `BusinessUnitEdit.tsx` — Design

**Date:** 2026-06-29
**Status:** Approved (design)
**Branch:** `refactor/businessunit-edit-split`

## Context

`src/pages/BusinessUnitEdit.tsx` is the repo's largest file (**1847 lines**) — the BU edit
page. It bundles: form state + handlers, a BU-users sub-flow (add/edit/remove + two dialogs),
branding upload, a dev debug sheet, and nine `CollapsibleSection` form blocks (~800 lines of
repetitive edit/read-only field pairs). Its size makes it hard to hold in context and risky to
edit. This is the second of three deferred maintenance items (Vitest shipped first; React 19
upgrade follows).

## Goal

Decompose into focused units **with zero behavior change** — a pure structural refactor. The
routed page `BusinessUnitEdit.tsx` remains the orchestrator (owns form state + load/save +
composition); everything else moves into a co-located `src/pages/businessUnitEdit/` folder.

## Non-Goals (YAGNI)

- No behavior, copy, styling, validation, or API change. Byte-for-byte identical rendered output.
- No new tests (no component-test infra; React 19 upgrade is a separate task). Verification is
  `tsc` + `bun run build` + manual smoke.
- No touching other Edit pages or shared `ui/` primitives.

## Decisions & Rationale

1. **Per-section form components** (chosen over one mega `FormFields`). Each `CollapsibleSection`
   becomes its own file under `businessUnitEdit/sections/`. Smaller, focused files; the trade-off
   (repeated prop threading) is contained by a shared `SectionFieldProps` bundle spread into each.

2. **Shared `SectionFieldProps`** keeps drilling uniform:
   ```ts
   interface SectionFieldProps {
     formData: BusinessUnitFormData;
     editing: boolean;
     fieldErrors: Record<string, string>;
     onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
     onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
     onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
   }
   ```
   Sections needing more take extra props (Basic→`clusters`+`getClusterName`,
   Calc→`defaultCurrency`+`getCalculationMethodLabel`, Config→row handlers, DB→none beyond `value`).

3. **Users sub-flow → a hook + a card.** All users state/effect/handlers move to
   `useBusinessUnitUsers`; the table + both dialogs move to `BusinessUnitUsersCard`. The hook
   **exposes `setBuUsers`** so the parent's `fetchBusinessUnit` can seed users from the BU GET
   response (preserving today's single-fetch — no extra API call).

4. **Co-located sub-folder** `src/pages/businessUnitEdit/`. No other Edit page has one; justified
   here as the largest file and an explicitly-anticipated split. Other pages stay flat.

5. **Parent keeps the `<form>` shell indirectly** via `BusinessUnitFormFields`, which renders the
   `<form ref onSubmit>` + 9 sections + submit-button block. `formRef`, `handleSubmit`, `saving`
   stay owned by the parent and are passed down — so `useGlobalShortcuts`' `requestSubmit()` and
   the unsaved-changes guard keep working unchanged.

## File Structure

```
src/pages/
  BusinessUnitEdit.tsx                      (orchestrator — target ~520 lines)
  businessUnitEdit/
    types.ts            BUUser, ClusterUser, DefaultCurrency, BusinessUnitFormData,
                        initialFormData, BU_ROLES, SectionFieldProps
    shared.tsx          CollapsibleSection, ReadOnlyText, ReadOnlyTextarea, selectClassName
    useBusinessUnitUsers.ts
    BusinessUnitFormFields.tsx              <form> + 9 sections + submit buttons
    BusinessUnitBrandingCard.tsx
    BusinessUnitUsersCard.tsx               table + Edit-User + Add-User dialogs
    BusinessUnitDebugSheet.tsx
    sections/
      BasicInfoSection.tsx
      HotelInfoSection.tsx
      CompanyInfoSection.tsx
      TaxInfoSection.tsx
      DateTimeFormatsSection.tsx
      NumberFormatsSection.tsx
      CalculationSettingsSection.tsx
      ConfigurationSection.tsx
      DatabaseConnectionSection.tsx
```

## Component / Module APIs

### `useBusinessUnitUsers(id: string | undefined, clusterId: string, isNew: boolean)`
Returns:
```ts
{
  // state
  buUsers: BUUser[]; setBuUsers: React.Dispatch<React.SetStateAction<BUUser[]>>;
  clusterUsers: ClusterUser[]; loadingClusterUsers: boolean;
  rawClusterUsersResponse: unknown;
  editingUser: BUUser | null; setEditingUser: (u: BUUser | null) => void;
  editUserForm: { role: string; is_active: boolean }; setEditUserForm: ...;
  savingUser: boolean;
  showAddUser: boolean; setShowAddUser: (b: boolean) => void;
  addUserRole: string; setAddUserRole: (s: string) => void;
  selectedClusterUser: ClusterUser | null; setSelectedClusterUser: ...;
  addingUser: boolean;
  addUserSearchTerm: string; setAddUserSearchTerm: (s: string) => void;
  deleteUser: BUUser | null; setDeleteUser: (u: BUUser | null) => void;
  availableClusterUsers: ClusterUser[];     // derived
  // handlers
  fetchBuUsers: () => Promise<void>;
  handleDeleteUser: (u: BUUser) => void;
  handleConfirmDeleteUser: () => Promise<void>;
  handleOpenEditUser: (u: BUUser) => void;
  handleSaveEditUser: () => Promise<void>;
  handleOpenAddUser: () => void;
  handleAddUser: () => Promise<void>;
}
```
Internally owns the `useEffect` that fetches cluster users when `clusterId` changes
(verbatim move of lines 260–273). All handlers are verbatim moves (lines 360–442).

### `BusinessUnitUsersCard` props
`{ users: ReturnType<typeof useBusinessUnitUsers>; clusterId: string }` — renders the Users card,
Edit-User dialog, Add-User dialog, and the delete `ConfirmDialog`. (Passing the whole hook return
avoids enumerating ~20 props; the card is the hook's sole consumer.)

### `BusinessUnitBrandingCard` props
`{ logoUrl: string; avatarUrl: string; editing: boolean; onUploadLogo: (f: File) => Promise<void>; onUploadAvatar: (f: File) => Promise<void> }`

### `BusinessUnitFormFields` props
`SectionFieldProps` + `{ clusters; getClusterName; defaultCurrency; getCalculationMethodLabel;
onConfigChange; onAddConfigRow; onRemoveConfigRow; formRef; onSubmit; saving; isNew; onCancel }`

### `BusinessUnitDebugSheet` props
`{ rawResponse: unknown; rawClusterUsersResponse: unknown; buUsers: BUUser[]; debugTab: 'bu' | 'users'; setDebugTab; copied: boolean; onCopy: (data: unknown) => void }` — entire body wrapped in
`process.env.NODE_ENV === 'development'` (unchanged).

### Per-section components
Each takes `SectionFieldProps` (spread) plus its extras and renders the **exact** JSX currently in
the corresponding `CollapsibleSection` (verbatim move; `handleChange`→`onChange`, etc. renamed only
at the prop boundary). Source line ranges:
- BasicInfo 728–900 (+`clusters`,`getClusterName`,`selectClassName`)
- HotelInfo 903–1000
- CompanyInfo 1003–1100
- TaxInfo 1103–1136
- DateTimeFormats 1139–1238
- NumberFormats 1241–1304
- CalculationSettings 1307–1379 (+`defaultCurrency`,`getCalculationMethodLabel`,`selectClassName`)
- Configuration 1382–1471 (+`onConfigChange`,`onAddConfigRow`,`onRemoveConfigRow`,`selectClassName`)
- DatabaseConnection 1474–1479 (uses `DbConnectionView`)

## Parent (`BusinessUnitEdit.tsx`) after refactor — retains
- Routing: `id, navigate, searchParams, isNew, isSuperAdmin`.
- Form state: `formData, savedFormData, clusters, loading, editing, saving, error,
  defaultCurrency, logoUrl, avatarUrl, fieldErrors, docVersion, formRef, rawResponse, copied, debugTab`.
- Handlers: `handleEditToggle, handleCancelEdit, handleCopyJson, fetchClusters, toJsonString,
  fetchBusinessUnit, handleUploadLogo, handleUploadAvatar, handleChange, handleBlur, handleFocus,
  handleConfigChange, addConfigRow, removeConfigRow, buildPayload, handleSubmit, getClusterName,
  getCalculationMethodLabel`.
- The loading skeleton (592–693) stays inline (page-shell concern).
- Composition: header, error, `<BusinessUnitFormFields/>`, `<TenantMigrationCard/>` (unchanged),
  `<BusinessUnitBrandingCard/>`, `<BusinessUnitUsersCard/>`, `<BusinessUnitDebugSheet/>`.
- Calls `users.setBuUsers(...)` inside `fetchBusinessUnit` where it currently does `setBuUsers(...)`.

## Verification
1. `bun run build` after **each** extraction step (tsc + eslint via vite-plugin-checker) — green.
2. Final `bun run build` — production bundle emits, no checker errors.
3. Manual smoke (`bun start`): open an existing BU (view + Edit toggle, save), create a new BU,
   add/edit/remove a user, upload logo/avatar, open the dev debug sheet — all behave as before.
4. `git diff main --stat` confirms `BusinessUnitEdit.tsx` shrank and new files carry the moved code.

## Rollback
Per-step commits make any regression bisectable; revert the offending commit. The whole branch is
abandonable without touching `main`.
