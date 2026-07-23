# Report Template — Template Type into Template Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Template Type to the top of the Template Info card as a required select, and drive three form-mode field rules (Report Group as a code select, Standard hidden+forced, BU Scope read-only+cleared) off `template_type === 'form'`.

**Architecture:** Single React page component (`ReportTemplateEdit.tsx`, used by both `/report-templates/new` and `/report-templates/:id/edit`). Form mode masks Standard + BU Scope in the render and normalizes them only in the save payload — `formData` is never mutated on the type toggle, so `form ⇄ list` is lossless. Report Group is a genuine control swap.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind, shadcn/ui, Vitest + React Testing Library + `@testing-library/user-event`, Bun.

**Spec:** `docs/superpowers/specs/2026-07-21-report-template-type-to-info-required-design.md`

## Global Constraints

- One production file only: `src/pages/ReportTemplateEdit.tsx`; its test: `src/pages/ReportTemplateEdit.test.tsx`. Do not touch `src/components/ui/*`, `reportTemplateService`, or the backend.
- Tests: Vitest with **explicit imports** (`import { describe, it, expect, vi } from 'vitest'`) — no globals. RTL + `user-event`. Keep routing real via `MemoryRouter`; `vi.mock` the shell + service (already set up in the existing test file).
- Run `bun run test` (one-shot) **and** `bun run build` before every commit. Build catches unused vars (TS6133) — never declare a symbol before the step that uses it.
- `template_type` stored value on the wire is always `'form'` or `'list'` (empty is blocked at submit). Report Group form codes: `PR, PO, GRN, SR, CN, SI, SO, PC, SC, RFP, EOP` — stored as the bare code.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch is already `feat/report-template-type-to-info` (spec committed there).

## File Structure

- `src/pages/ReportTemplateEdit.tsx` — all production changes (type widening, constant, load fallback, Template Info render, Data Source removal, validation, payload normalize).
- `src/pages/ReportTemplateEdit.test.tsx` — extend the existing integration suite; add a `template_type: 'list'` field to the shared `fakeTemplate` fixture in Task 1.

---

### Task 1: Move Template Type into Template Info, make it required

**Files:**

- Modify: `src/pages/ReportTemplateEdit.tsx` (interface, `initialFormData`, `REQUIRED_FIELD_LABELS`, `fetchTemplate` load, Template Info render, remove from Data Source, `handleSubmit` validation)
- Test: `src/pages/ReportTemplateEdit.test.tsx`

**Interfaces:**

- Consumes: existing `formData`/`fieldErrors`/`handleChange`/`handleFocus` state; existing sticky-bar `Create Template` / `Save Changes` submit button.
- Produces: `template_type: '' | 'form' | 'list'` in `ReportTemplateFormData`; a Template Type `<select>` labeled `Template Type *` (id `template_type`) rendered before Name; the Data Source card no longer renders any Template Type control.

- [ ] **Step 1: Add `template_type: 'list'` to the shared fixture**

In `src/pages/ReportTemplateEdit.test.tsx`, add the field to `fakeTemplate` (after `is_active: true,`, around line 71):

```ts
  is_active: true,
  template_type: 'list',
  builder_key: 'pr-summary',
```

- [ ] **Step 2: Write the failing tests**

First, add `waitFor` to the RTL import (line 3 of the test file):

```ts
import { render, screen, waitFor } from '@testing-library/react';
```

Then append this block to `src/pages/ReportTemplateEdit.test.tsx`:

```tsx
describe('ReportTemplateEdit — Template Type in Template Info', () => {
  it('renders Template Type before Name in the Template Info card (new template)', async () => {
    renderAt('/report-templates/new');

    const type = await screen.findByLabelText(/Template Type/);
    const name = screen.getByLabelText(/^Name/);
    // Template Type must come first in DOM order.
    expect(type.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('defaults Template Type to empty on a new template', async () => {
    renderAt('/report-templates/new');

    const type = (await screen.findByLabelText(/Template Type/)) as HTMLSelectElement;
    expect(type.value).toBe('');
  });

  it('blocks submit and shows an error when no type is chosen', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.click(await screen.findByRole('button', { name: /create template/i }));

    expect(await screen.findByText('Template type is required')).toBeInTheDocument();
    expect(reportTemplateService.create).not.toHaveBeenCalled();
  });

  it('creates a list template with a chosen type (happy path)', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.type(screen.getByLabelText(/^Name/), 'My Report');
    await user.type(screen.getByLabelText(/Report Group/), 'inventory');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'list', name: 'My Report', report_group: 'inventory' }),
      ),
    );
  });

  it('no longer renders a Template Type control in the Data Source card', async () => {
    renderAt('/report-templates/new');

    // Exactly one Template Type label now (in Template Info, not Data Source).
    expect(await screen.findAllByText(/^Template Type/)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: the 5 new tests FAIL (Template Type still in Data Source; new template defaults to `'list'`; no `template_type` validation).

- [ ] **Step 4: Widen the type and empty the default**

In `src/pages/ReportTemplateEdit.tsx`, change the interface field (line 48):

```ts
  template_type: '' | 'form' | 'list';
```

and `initialFormData` (line 72):

```ts
  template_type: '',
```

- [ ] **Step 5: Register the required label**

Change `REQUIRED_FIELD_LABELS` (lines 31–34) to:

```ts
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  report_group: 'Report group',
  template_type: 'Template type',
};
```

- [ ] **Step 6: Fix the load fallback**

In `fetchTemplate`, change the `template_type` mapping (line 203) from `?? 'list'` to:

```ts
        template_type: (template.template_type as 'form' | 'list') || '',
```

- [ ] **Step 7: Add the required Template Type block before Name**

In the Template Info `CardContent`, insert this block immediately before the existing Name block (before the `<div className="space-y-2">` that holds `<Label htmlFor="name">`, line 440):

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

- [ ] **Step 8: Remove the Template Type block from the Data Source card**

Delete the entire Template Type `<div className="space-y-2">…</div>` block in the Data Source `CardContent` (originally lines 625–646, the block with `<Label htmlFor="template_type">Template Type</Label>` and the `list`/`form` select / `<Badge>`). The Data Source card's first field becomes Source Type.

- [ ] **Step 9: Add the `template_type` required check**

In `handleSubmit`, add the check as the first line of the `errs` block (before the `name` check, line 285):

```ts
    const errs: Record<string, string> = {};
    if (!formData.template_type) errs.template_type = 'Template type is required';
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.report_group.trim()) errs.report_group = 'Report group is required';
```

- [ ] **Step 10: Run tests + build to verify green**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: all tests PASS (the 5 new + all existing).
Run: `bun run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 11: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateEdit.test.tsx
git commit -m "$(cat <<'EOF'
feat(report-template): move Template Type into Template Info as a required select

Template Type is now the first field of the Template Info card (before Name),
with an empty default + disabled "Select type…" placeholder and a submit-time
"Template type is required" check. Removed the old control from the Data Source card.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Report Group becomes a code select in form mode

**Files:**

- Modify: `src/pages/ReportTemplateEdit.tsx` (`FORM_REPORT_GROUPS` constant, `isForm` derive, Report Group edit branch)
- Test: `src/pages/ReportTemplateEdit.test.tsx`

**Interfaces:**

- Consumes: `formData.template_type` from Task 1; existing `handleChange`/`handleBlur`/`handleFocus`.
- Produces: module-level `FORM_REPORT_GROUPS` tuple; render-body `const isForm = formData.template_type === 'form'` (reused by Tasks 3–4); Report Group renders a `<select id="report_group">` when `isForm`, a text `<Input id="report_group">` otherwise.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/ReportTemplateEdit.test.tsx`:

```tsx
describe('ReportTemplateEdit — Report Group forks on Template Type', () => {
  it('is a textbox for list and a select for form', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    expect((screen.getByLabelText(/Report Group/) as HTMLElement).tagName).toBe('INPUT');

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    const group = screen.getByLabelText(/Report Group/) as HTMLElement;
    expect(group.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'PR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EOP' })).toBeInTheDocument();
  });

  it('stores the bare code when a form group is chosen', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'form');
    await user.type(screen.getByLabelText(/^Name/), 'Form Report');
    await user.selectOptions(screen.getByLabelText(/Report Group/), 'PO');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ template_type: 'form', report_group: 'PO' }),
      ),
    );
  });

  it('preserves an out-of-list report_group on an existing form record', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.getById).mockResolvedValue({
      data: { ...fakeTemplate, template_type: 'form', report_group: 'inventory' },
    });
    renderAt('/report-templates/rt1/edit');

    await user.click(await screen.findByRole('button', { name: /^edit$/i }));

    const group = screen.getByLabelText(/Report Group/) as HTMLSelectElement;
    expect(group.value).toBe('inventory');
    expect(screen.getByRole('option', { name: 'inventory' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: the 3 new tests FAIL (Report Group is always a textbox; no `PR`/`EOP` options).

- [ ] **Step 3: Add the `FORM_REPORT_GROUPS` constant**

In `src/pages/ReportTemplateEdit.tsx`, add after `REQUIRED_FIELD_LABELS` (after line 34/35):

```ts
// Report Group choices when template_type === 'form'. Stored value === the code.
const FORM_REPORT_GROUPS = [
  'PR', 'PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'PC', 'SC', 'RFP', 'EOP',
] as const;
```

- [ ] **Step 4: Derive `isForm` in the render body**

Add just before the existing `const dialogLines = countLines(formData.dialog);` (line 363):

```ts
  const isForm = formData.template_type === 'form';
```

- [ ] **Step 5: Fork the Report Group edit branch**

Replace the current Report Group `editing ? (…) : (…)` block (lines 487–509 — the `<Input>` edit branch and the read-only `<Badge>`) with:

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
                                {formData.report_group &&
                                  !FORM_REPORT_GROUPS.includes(
                                    formData.report_group as typeof FORM_REPORT_GROUPS[number],
                                  ) && (
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

- [ ] **Step 6: Run tests + build to verify green**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: all tests PASS.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateEdit.test.tsx
git commit -m "$(cat <<'EOF'
feat(report-template): Report Group becomes a code select in form mode

When template_type === 'form', Report Group renders a <select> over the fixed
document codes (PR, PO, GRN, SR, CN, SI, SO, PC, SC, RFP, EOP), storing the bare
code; an out-of-list value is preserved as an extra option. list/empty keeps the
free-text input.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hide Standard and force it true in form mode

**Files:**

- Modify: `src/pages/ReportTemplateEdit.tsx` (three `!isForm` render guards + payload normalize)
- Test: `src/pages/ReportTemplateEdit.test.tsx`

**Interfaces:**

- Consumes: `isForm` from Task 2; existing `is_standard` state; existing `payload` object in `handleSubmit`.
- Produces: header Standard badge, edit-mode Standard checkbox, and read-only Kind badge are all wrapped in `{!isForm && …}`; `payload.is_standard` is normalized to `true` when `isForm`.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/ReportTemplateEdit.test.tsx`:

```tsx
describe('ReportTemplateEdit — Standard hidden + forced in form mode', () => {
  it('hides the Standard checkbox and header badge in form mode', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    expect(screen.getByLabelText('Standard')).toBeInTheDocument();
    expect(screen.getByLabelText('Active')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    expect(screen.queryByLabelText('Standard')).toBeNull();
    expect(screen.getByLabelText('Active')).toBeInTheDocument();
  });

  it('forces is_standard true in the form-mode payload even after unchecking it', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    // Uncheck Standard while in list mode…
    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.click(screen.getByLabelText('Standard'));
    // …then switch to form and save.
    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    await user.type(screen.getByLabelText(/^Name/), 'Form Report');
    await user.selectOptions(screen.getByLabelText(/Report Group/), 'PR');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_standard: true }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: FAIL (Standard checkbox still visible in form mode; `is_standard` saves as `false`).

- [ ] **Step 3: Guard the header Standard badge**

In the header badge row, wrap the Standard/Custom `<Badge>` (lines 407–409):

```tsx
            {!isForm && (
              <Badge variant={formData.is_standard ? 'default' : 'outline'}>
                {formData.is_standard ? 'Standard' : 'Custom'}
              </Badge>
            )}
```

- [ ] **Step 4: Guard the edit-mode Standard checkbox**

Wrap the Standard `<label>` (lines 514–524) — leave the Active `<label>` untouched:

```tsx
                          {!isForm && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                id="is_standard"
                                name="is_standard"
                                checked={formData.is_standard}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-input"
                              />
                              Standard
                            </label>
                          )}
```

- [ ] **Step 5: Guard the read-only Kind badge**

Wrap the Kind `<div className="space-y-2">` column (lines 539–546) — leave the Status column untouched:

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

- [ ] **Step 6: Normalize `is_standard` in the payload**

In `handleSubmit`, add `is_standard` to the `payload` object (the block starting `const payload = { ...formData,` around line 303):

```ts
    const payload = {
      ...formData,
      is_standard: isForm ? true : formData.is_standard,
      source_name: formData.source_name.trim() || undefined,
      source_params: { params: cleanParams },
    };
```

- [ ] **Step 7: Run tests + build to verify green**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: all PASS.
Run: `bun run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateEdit.test.tsx
git commit -m "$(cat <<'EOF'
feat(report-template): hide Standard and force it true in form mode

When template_type === 'form', the Standard control is hidden in all three
places (edit checkbox, read-only Kind badge, header badge) and is_standard is
normalized to true in the save payload. formData is left untouched so toggling
back to list restores the prior value.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Business Unit Scope read-only + cleared in form mode

**Files:**

- Modify: `src/pages/ReportTemplateEdit.tsx` (both `<ChipInput>` `value`/`placeholder`/`disabled` props + payload normalize)
- Test: `src/pages/ReportTemplateEdit.test.tsx`

**Interfaces:**

- Consumes: `isForm` from Task 2; `payload` object from Task 3.
- Produces: Allow/Deny chip inputs disabled and masked to empty when `isForm`; `payload.allow_business_unit` / `payload.deny_business_unit` normalized to `''` when `isForm`.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/ReportTemplateEdit.test.tsx`:

```tsx
describe('ReportTemplateEdit — BU Scope read-only in form mode', () => {
  it('disables and empties the Allow/Deny inputs in form mode', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    expect(screen.getByLabelText('Allow')).toBeInTheDocument(); // textbox present in list mode

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    // Disabled ChipInput renders no <input>, so the label points at nothing.
    expect(screen.queryByLabelText('Allow')).toBeNull();
    expect(screen.queryByLabelText('Deny')).toBeNull();
  });

  it('clears BU scope in the form-mode payload', async () => {
    const user = userEvent.setup();
    asMock(reportTemplateService.create).mockResolvedValue({ data: { id: 'new1' } });
    asMock(reportTemplateService.getById).mockResolvedValue({ data: fakeTemplate });
    renderAt('/report-templates/new');

    // Add an Allow chip in list mode…
    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.type(screen.getByLabelText('Allow'), 'BU1{Enter}');
    // …then switch to form and save.
    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    await user.type(screen.getByLabelText(/^Name/), 'Form Report');
    await user.selectOptions(screen.getByLabelText(/Report Group/), 'PR');
    await user.click(screen.getByRole('button', { name: /create template/i }));

    await waitFor(() =>
      expect(reportTemplateService.create).toHaveBeenCalledWith(
        expect.objectContaining({ allow_business_unit: '', deny_business_unit: '' }),
      ),
    );
  });

  it('restores BU chips when toggling form -> list (lossless)', async () => {
    const user = userEvent.setup();
    renderAt('/report-templates/new');

    await user.selectOptions(await screen.findByLabelText(/Template Type/), 'list');
    await user.type(screen.getByLabelText('Allow'), 'BU1{Enter}');
    expect(screen.getByText('BU1')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Template Type/), 'form');
    await user.selectOptions(screen.getByLabelText(/Template Type/), 'list');

    // The chip survived the round-trip.
    expect(screen.getByText('BU1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove BU1/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: FAIL (Allow input still present in form mode; payload keeps the chip).

- [ ] **Step 3: Mask the Allow chip input**

In the BU Scope card, change the Allow `<ChipInput>` (lines 576–583) to:

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

- [ ] **Step 4: Mask the Deny chip input**

Change the Deny `<ChipInput>` (lines 587–593) to:

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

- [ ] **Step 5: Normalize BU scope in the payload**

Extend the `payload` object in `handleSubmit` (from Task 3) to clear both scope fields:

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

- [ ] **Step 6: Run tests + build to verify green**

Run: `bun run test -- src/pages/ReportTemplateEdit.test.tsx`
Expected: all PASS.
Run: `bun run build`
Expected: succeeds.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`
Expected: the whole repo suite is green (no regressions in sibling pages).

- [ ] **Step 8: Commit**

```bash
git add src/pages/ReportTemplateEdit.tsx src/pages/ReportTemplateEdit.test.tsx
git commit -m "$(cat <<'EOF'
feat(report-template): make Business Unit Scope read-only and cleared in form mode

When template_type === 'form', the Allow/Deny chip inputs are disabled and shown
empty, and both values are cleared in the save payload. formData is untouched so a
form -> list toggle restores the original chips (lossless).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

- §1 Type + initial state → Task 1 Step 4.
- §2 Label registry + `FORM_REPORT_GROUPS` → Task 1 Step 5, Task 2 Step 3.
- §3 Load fallback → Task 1 Step 6.
- §4 Template Type block → Task 1 Step 7.
- §5 Report Group conditional → Task 2 Step 5.
- §6 Remove from Data Source → Task 1 Step 8.
- §7 Standard hidden (a/b/c) → Task 3 Steps 3–5.
- §8 BU Scope read-only → Task 4 Steps 3–4.
- §9 Validation → Task 1 Step 9.
- §10 Payload normalize (is_standard + allow/deny) → Task 3 Step 6, Task 4 Step 5.
- Spec tests 1–12 all mapped: T1(1,2,3,4,5), T2(6,7,8), T3(9,11-is_standard), T4(10,11-BU,12).

**Placeholder scan:** none — every step has exact code, paths, and commands.

**Type consistency:** `template_type: '' | 'form' | 'list'` used identically in Task 1 (interface, select cast) and Task 2 (`isForm`). `isForm` declared once (Task 2 Step 4) and reused in Tasks 2–4. `FORM_REPORT_GROUPS` tuple + `typeof FORM_REPORT_GROUPS[number]` cast consistent. `payload` object grows additively across Task 3 Step 6 → Task 4 Step 5 (same key set, `isForm` guard). Test helpers (`renderAt`, `asMock`, `fakeTemplate`, `reportTemplateService`) all pre-exist in the file.

**Ordering note:** `isForm` is intentionally introduced in Task 2 (its first use), not Task 1 — declaring it unused in Task 1 would fail the `bun run build` TS6133 check.
