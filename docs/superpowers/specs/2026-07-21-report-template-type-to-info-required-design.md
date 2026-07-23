# Report Template — Template Type into Template Info (required) + form-mode field rules

**Date:** 2026-07-21
**Scope:** Frontend UI change, 1 file
**Page:** `/report-templates/new` and `/report-templates/:id/edit` (`ReportTemplateEdit.tsx` — one shared component)

## Problem

On the Report Template edit form, **Template Type** currently lives at the top of
the **Data Source** card (`ReportTemplateEdit.tsx:625–646`), rendered as a
`<select>` with a hardcoded default of `'list'` — so it can never be empty and is
never explicitly chosen. The user wants Template Type to be the **first field of
the Template Info card** (before Name) and to be a **truly required** choice: a new
template must have its type deliberately selected before it can be saved.

The remaining three changes all key off `template_type === 'form'` — form templates
are a constrained shape:

1. **Report Group** is a free-text `<Input>` today. In form mode it should become a
   `<select>` over a fixed set of document codes; list/empty keeps free-text.
2. **Standard** (`is_standard`) is meaningless for form templates (always Standard):
   in form mode the control is hidden everywhere and the value forced to `true`.
3. **Business Unit Scope** (`allow_business_unit` / `deny_business_unit`) does not
   apply to form templates (they target all BUs): in form mode the two chip inputs
   are read-only, shown empty, and both values are cleared.

## Chosen behavior

**Move (not copy) Template Type into Template Info, first position, and enforce a
real selection.**

- **Placement:** Template Type is the first block in the `Template Info` card, above
  Name — in both edit mode and read-only mode. It is removed entirely from the
  Data Source card.
- **Required = force a real choice** (confirmed with user): the default becomes
  empty (`''`). The `<select>` gains a leading `Select type…` option that is
  `disabled` so the user cannot return to the empty value once a real type is
  chosen. Saving with an empty type is blocked with `Template type is required`.
- **Read-only mode:** Template Type shows as an `<Badge variant="outline">` at the
  top of Template Info, before Name (confirmed with user).

**Report Group is conditional on Template Type** (confirmed with user):

- `template_type === 'form'` → Report Group is a `<select>` over the fixed codes
  `PR, PO, GRN, SR, CN, SI, SO, PC, SC, RFP, EOP`. The **value stored is the bare
  code** (`report_group: 'PR'`) — options show the code, no label mapping.
- `template_type === 'list'` or `''` → Report Group stays the current free-text
  `<Input>` (any string: `inventory`, `procurement`, …).
- **Out-of-list preservation:** if the current `report_group` is non-empty and not
  one of the fixed codes (an existing `form` record saved before this change, or a
  value carried over when toggling `list → form`), it is prepended as an extra
  selected `<option>` so no data is silently dropped.
- Report Group is already required; in select mode it keeps a disabled
  `Select group…` placeholder so an empty value still fails the existing
  `Report group is required` check.

**Form-mode field masking — Standard and BU Scope** (confirmed with user).

The governing principle: **form mode masks these fields in the UI and normalizes
them in the save payload; it never mutates `formData` on the type toggle.** So
toggling `form ⇄ list` is lossless — the underlying values survive and reappear if
the user switches back, and dirty-tracking never shows a phantom change.

- **Standard hidden + forced `true`:** when `template_type === 'form'`, the Standard
  control is hidden in all three places it renders — the edit-mode checkbox, the
  read-only Kind badge, and the header Standard/Custom badge
  (`ReportTemplateEdit.tsx:407–409`). `is_standard` is forced to `true` **only in
  the save payload**.
- **BU Scope read-only + cleared:** when `template_type === 'form'`, both chip
  inputs (Allow / Deny) are disabled and rendered **empty** (form templates target
  all BUs). `allow_business_unit` and `deny_business_unit` are cleared to `''`
  **only in the save payload**.

Derived decisions (surfaced to user, open to change):

- **The type toggle never rewrites `formData`.** Report Group value, `is_standard`,
  and BU Scope values are all preserved in state across a `form ⇄ list` toggle;
  form-specific values (`is_standard=true`, empty scope) are applied only at save.
  Least-surprise, non-destructive, and keeps the unsaved-changes dot honest.
- **Report Group is a real control swap, not a mask** — its value is meaningful in
  both modes, so it is not cleared or forced; only its input widget changes.
- **Read-only Report Group is unchanged** — still the existing `<Badge>`.
- **Layout when Standard is hidden** — the Standard/Active row is a 2-col grid; with
  Standard gone, Active (edit) / Status (read-only) sits alone in the first column,
  left-aligned. No grid restructure.

Rejected alternative:

- *Visual `*` only, keep `'list'` default* — the marker would imply a required
  choice the form never actually enforces. User explicitly chose real enforcement.
- *Force/clear form-mode values in the Type `onChange`* — mutating `formData` on
  toggle loses the prior values and marks the form dirty even when the user toggles
  back with no net change. Rejected in favor of save-time normalization.

## Design

Single file: `src/pages/ReportTemplateEdit.tsx`. Reuses the existing
`name`/`report_group` required-field mechanics (label `*`, `fieldErrors`,
`border-destructive`, pre-submit check) — no new machinery. A single derived flag
`const isForm = formData.template_type === 'form'` is computed once in the render
body (after the not-found gate, before `return`) and reused by every guard below.

### 1. Type + initial state

```ts
interface ReportTemplateFormData {
  // ...
  template_type: '' | 'form' | 'list';   // was: 'form' | 'list'
  // ...
}

const initialFormData: ReportTemplateFormData = {
  // ...
  template_type: '',   // was: 'list'
  // ...
};
```

Payload safety: `handleSubmit` blocks an empty `template_type` before the
`create`/`update` call, so the value sent to the backend is always `'form'` or
`'list'`. The widened union only affects in-form state.

### 2. Required-field label registry + form-group codes

```ts
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  report_group: 'Report group',
  template_type: 'Template type',   // add
};

// Report Group choices when template_type === 'form'. Stored value === the code.
const FORM_REPORT_GROUPS = [
  'PR', 'PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'PC', 'SC', 'RFP', 'EOP',
] as const;
```

### 3. Load (`fetchTemplate`)

```ts
template_type: (template.template_type as 'form' | 'list') || '',
// was: (template.template_type as 'form' | 'list') ?? 'list'
```

An existing record with a stored type loads that value unchanged. A record whose
backend read returns null/empty falls to `''`, so the same required rule applies
consistently. Existing records virtually always carry a type — defensive edge only.
Load does **not** clear/force any form-mode field (that would mark the form dirty
before any edit); masking/normalization is a render + save concern only.

### 4. Template Info card — Template Type as new first block

Insert **before** the Name block (`ReportTemplateEdit.tsx:440`), inside the
`{loading ? … : <> … </>}` populated branch:

```tsx
<div className="space-y-2">
  <Label htmlFor="template_type">Template Type {editing && '*'}</Label>
  {editing ? (
    <>
      <select
        id="template_type"
        name="template_type"
        value={formData.template_type}
        onFocus={() => setFieldErrors((prev) => ({ ...prev, template_type: '' }))}
        onChange={(e) => {
          setFormData((prev) => ({
            ...prev,
            template_type: e.target.value as '' | 'form' | 'list',
          }));
          setFieldErrors((prev) => ({ ...prev, template_type: '' }));
          setError('');
        }}
        className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          fieldErrors.template_type ? 'border-destructive' : 'border-input'
        }`}
      >
        <option value="" disabled>Select type…</option>
        <option value="list">List</option>
        <option value="form">Form</option>
      </select>
      {fieldErrors.template_type && (
        <p className="text-xs text-destructive">{fieldErrors.template_type}</p>
      )}
    </>
  ) : (
    <Badge variant="outline">{formData.template_type}</Badge>
  )}
</div>
```

`onChange` only sets `template_type` (plus error/clear) — it deliberately does **not**
touch `is_standard` or the BU-scope values; those are handled by render masking (§7,
§8) and save normalization (§10). Inline `setFormData` is used because the shared
`handleChange` types its event as input/textarea only.

### 5. Template Info card — Report Group becomes conditional

Replace the current Report Group **edit** branch (`ReportTemplateEdit.tsx:487–504`,
the `<Input>` + inline error) with a fork on `isForm`. The read-only branch
(`<Badge>`, lines 505–509) is unchanged.

```tsx
{editing ? (
  isForm ? (
    <>
      <select
        id="report_group"
        name="report_group"
        value={formData.report_group}
        onFocus={handleFocus}
        onChange={(e) => {
          setFormData((prev) => ({ ...prev, report_group: e.target.value }));
          setFieldErrors((prev) => ({ ...prev, report_group: '' }));
          setError('');
        }}
        className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          fieldErrors.report_group ? 'border-destructive' : 'border-input'
        }`}
      >
        <option value="" disabled>Select group…</option>
        {/* preserve an existing value that isn't one of the fixed codes */}
        {formData.report_group &&
          !FORM_REPORT_GROUPS.includes(formData.report_group as typeof FORM_REPORT_GROUPS[number]) && (
            <option value={formData.report_group}>{formData.report_group}</option>
          )}
        {FORM_REPORT_GROUPS.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      {fieldErrors.report_group && (
        <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
      )}
    </>
  ) : (
    <>
      <Input
        type="text"
        id="report_group"
        name="report_group"
        value={formData.report_group}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder="e.g. inventory, procurement"
        className={fieldErrors.report_group ? 'border-destructive' : ''}
        required
      />
      {fieldErrors.report_group && (
        <p className="text-xs text-destructive">{fieldErrors.report_group}</p>
      )}
    </>
  )
) : (
  <div>
    <Badge variant="outline">{formData.report_group || '-'}</Badge>
  </div>
)}
```

Notes:

- The list/empty branch is the **current** input verbatim — no behavior change when
  not in form mode.
- `report_group` state stays a plain `string`; only the control changes. No type
  edits, no `initialFormData` change.
- Toggling type needs no reset logic: the control re-renders off `isForm`, and the
  out-of-list `<option>` keeps any carried-over value valid in the dropdown.

### 6. Remove Template Type from Data Source card

Delete the Template Type block (`ReportTemplateEdit.tsx:625–646`). The Data Source
card then opens with **Source Type**. Nothing else in that card moves.

### 7. Standard — hidden when `isForm`

Guard each of the three Standard renders with `!isForm`. These are visibility guards
only; the value is forced in the save payload (§10), not here.

**a. Header badge** (`ReportTemplateEdit.tsx:407–409`):

```tsx
{!isForm && (
  <Badge variant={formData.is_standard ? 'default' : 'outline'}>
    {formData.is_standard ? 'Standard' : 'Custom'}
  </Badge>
)}
```

**b. Edit-mode checkbox** (`ReportTemplateEdit.tsx:514–524`) — wrap the Standard
`<label>` only; the Active `<label>` is untouched and stays in the first grid
column:

```tsx
{!isForm && (
  <label className="flex items-center gap-2 text-sm cursor-pointer">
    <input type="checkbox" id="is_standard" name="is_standard"
      checked={formData.is_standard} onChange={handleChange}
      className="h-4 w-4 rounded border-input" />
    Standard
  </label>
)}
```

**c. Read-only Kind badge** (`ReportTemplateEdit.tsx:539–546`) — wrap the Kind
column; the Status column is untouched:

```tsx
{!isForm && (
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Kind</Label>
    <div>
      <Badge variant={formData.is_standard ? 'default' : 'outline'}>
        {formData.is_standard ? 'Standard' : 'Custom'}
      </Badge>
    </div>
  </div>
)}
```

### 8. Business Unit Scope — read-only + cleared display when `isForm`

The BU Scope card (`ReportTemplateEdit.tsx:574–595`) has two `<ChipInput>`s. In form
mode: force them empty and disabled, without mutating `formData` (so a `list → form
→ list` toggle restores the original chips). Change the `value` and `disabled` props
on both:

```tsx
<ChipInput
  id="allow_business_unit"
  name="allow_business_unit"
  value={isForm ? '' : formData.allow_business_unit}
  onChange={handleChipChange('allow_business_unit')}
  placeholder={isForm ? 'All business units (form template)' : 'Type BU code + Enter (blank = all)'}
  disabled={!editing || isForm}
/>
```

```tsx
<ChipInput
  id="deny_business_unit"
  name="deny_business_unit"
  value={isForm ? '' : formData.deny_business_unit}
  onChange={handleChipChange('deny_business_unit')}
  placeholder={isForm ? '—' : 'Type BU code + Enter (blank = none)'}
  disabled={!editing || isForm}
/>
```

`disabled` already blocks edits, so `onChange` cannot fire in form mode — `formData`
is untouched; only the displayed value is masked to `''`. The Allow placeholder is
reworded to explain the empty state instead of the normal hint.

### 9. Pre-submit validation (`handleSubmit`)

```ts
const errs: Record<string, string> = {};
if (!formData.template_type) errs.template_type = 'Template type is required';
if (!formData.name.trim()) errs.name = 'Name is required';
if (!formData.report_group.trim()) errs.report_group = 'Report group is required';
if (Object.keys(errs).length > 0) { setFieldErrors(errs); setSaving(false); return; }
```

Template Type is checked first so its error surfaces alongside the others; the early
return already prevents any empty-type payload from reaching the service.

### 10. Payload normalization (`handleSubmit`)

Apply all form-mode field rules in one place when building the payload — the single
source of truth for what `form` means on the wire:

```ts
const payload = {
  ...formData,
  is_standard: isForm ? true : formData.is_standard,
  allow_business_unit: isForm ? '' : formData.allow_business_unit,
  deny_business_unit: isForm ? '' : formData.deny_business_unit,
  source_name: formData.source_name.trim() || undefined,
  source_params: { params: cleanParams },
};
```

This covers the pre-change edge too: a `form` record loaded with a stale
`is_standard=false` or non-empty BU scope, saved without touching the Type control,
still normalizes correctly. `isForm` is the same flag used by the render guards, so
UI and payload can never disagree.

## Out of scope (intentionally untouched)

- Header badges (`ReportTemplateEdit.tsx:402–414`): the Active and Report Group
  badges are unchanged; only the Standard/Custom badge is conditionally hidden in
  form mode (§7a) — not restyled. No Template Type badge is added to the header.
- The Active flag (`is_active`) — never hidden, forced, or cleared; the user's
  form-mode rules cover only Standard and BU Scope. Active keeps its checkbox (edit)
  and Status badge (read-only) in all modes.
- The BU Scope **card itself** stays visible in form mode (read-only), not removed —
  the user asked for read-only, not hidden.
- XML editor column, Metadata card, debug sheet.
- `reportTemplateService`, backend contract, and the `/report-templates` list page.
- `FORM_REPORT_GROUPS` is a frontend constant — no backend validation/enum is added;
  the backend still accepts any `report_group` string and any BU-scope value.
- Template Type validation is submit-only (the `<select>` cannot be blank after
  first change). Report Group keeps its `handleBlur` required layering **only in the
  list/empty text branch**; the form-mode `<select>` relies on the disabled
  placeholder + submit check.

## Testing

Extend the existing `src/pages/ReportTemplateEdit.test.tsx`. Follow the
page-integration convention (CLAUDE.md): `vi.mock` `Layout`/`Can` and
`reportTemplateService`, keep routing real via `MemoryRouter`.

1. **Placement:** in a new-template render, the Template Info card's first labeled
   control is `Template Type`, and it precedes `Name` in DOM order.
2. **Empty default:** on `/report-templates/new`, the Template Type select value is
   `''` (the disabled `Select type…` option is selected).
3. **Required enforcement:** submitting the new form without choosing a type shows
   `Template type is required` and does **not** call `reportTemplateService.create`.
4. **Happy path (list):** choosing `List`, filling Name + Report Group (text),
   submitting calls `create` with `template_type: 'list'`.
5. **Removed from Data Source:** the Data Source card no longer renders a
   `Template Type` label (guard against a stray duplicate).
6. **Report Group control forks on type:** with `template_type = 'list'`, Report
   Group renders a textbox; after switching to `Form`, it renders a
   combobox/`<select>` whose options include `PR` and `EOP`.
7. **Bare-code value:** in form mode, choosing `PO` then submitting (Name filled)
   calls `create` with `report_group: 'PO'` and `template_type: 'form'`.
8. **Out-of-list preservation:** rendering an existing `form` record whose
   `report_group` is `inventory` (not a fixed code) shows `inventory` as the
   selected option and does not blank it.
9. **Standard hidden in form mode:** with `template_type = 'list'` the Standard
   checkbox is present; after switching to `Form`, the Standard checkbox and the
   header Standard/Custom badge are gone while the Active control remains.
10. **BU Scope read-only + empty in form mode:** after switching to `Form`, the Allow
    and Deny chip inputs are disabled and display no chips, even if the list-mode
    value had chips.
11. **Form payload normalization:** in form mode, submitting (Name + a group chosen)
    calls `create`/`update` with `is_standard: true`, `allow_business_unit: ''`, and
    `deny_business_unit: ''` — asserted even when the record/state carried a
    non-standard flag or BU chips beforehand.
12. **Lossless toggle:** entering BU chips in list mode, switching to `Form` (chips
    hidden), then back to `List` shows the original chips again (state preserved).

Run `bun run test` and `bun run build` before commit.
